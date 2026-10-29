import { MAIL_EVENTS, MAIL_EVENT_BY_KEY, validateMailEventUpdate } from './mail-event-catalog.mjs';
import { resolveMailDesign, validateMailDesign, renderDesignedMail, createMailPreviewValues } from './mail-template-design.mjs';

const POLICY_KEY = 'mail-notification-settings';
const error = (code, status) => Object.assign(new Error(code), { code, status });
const emptyPayload = () => ({ revision: 0, events: {}, audit: [] });
const eventView = (event, patch = {}) => ({
  key: event.key, category: event.category, title: event.title, recipient: event.recipient,
  enabled: patch.enabled === true,
  subject: typeof patch.subject === 'string' ? patch.subject : event.defaultSubject,
  body: typeof patch.body === 'string' ? patch.body : event.defaultBody,
  bodyFormat: patch.bodyFormat === 'html' ? 'html' : 'text',
  variables: [...event.variables],
});
const present = (payload) => ({
  authority: 'postgresql', revision: Number(payload.revision || 0),
  // No Outbox/dispatcher or live delivery is wired at this stage.
  liveSendingEnabled: payload?.delivery?.enabled===true, provider: 'brevo',
  design: resolveMailDesign(payload.design), designDraft: resolveMailDesign(payload.designDraft||payload.design),
  designVersions:(Array.isArray(payload.designVersions)?payload.designVersions:[]).map((v)=>({revision:v.revision,changedAt:v.changedAt,actor:v.actor})),
  designPublishedRevision:Number(payload.designPublishedRevision||0),
  events: MAIL_EVENTS.map((event) => eventView(event, payload.events?.[event.key])),
});

export const createMailNotificationSettingsService = (pool) => {
  if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool required.');
  return Object.freeze({
    async list() {
      const result = await pool.query('SELECT payload FROM app_system_configuration WHERE config_key=$1', [POLICY_KEY]);
      return present(result.rows[0]?.payload || emptyPayload());
    },
    // Preview is stateless: use only sample data, never read user records or enqueue/send.
    preview({ key, template, design }) {
      const validated = validateMailEventUpdate(key, { ...template, expectedRevision:0 });
      const event = MAIL_EVENT_BY_KEY[key];
      const result = renderDesignedMail({
        template:validated, values:createMailPreviewValues(event.variables),
        variables:event.variables, design: validateMailDesign(design),
      });
      return Object.freeze({ ...result, eventKey:key, sample:true });
    },
    async saveDesign({ input, actorClerkUserId }) {
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some((key) => ![...Object.keys(resolveMailDesign()),'expectedRevision'].includes(key)) ||
          !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw error('mail_design_invalid',400);
      const {expectedRevision:unusedRevision,...designFields}=input;
      const design = validateMailDesign(designFields);
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[POLICY_KEY]);
        const existing=await client.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE',[POLICY_KEY]);
        const current=existing.rows[0]?.payload || emptyPayload();
        const revision=Number(current.revision||0);
        if (revision !== input.expectedRevision) throw error('mail_settings_revision_conflict',409);
        const before=resolveMailDesign(current.design);
        const next={ ...current,revision:revision+1,design,
          audit:[{revision:revision+1,eventKey:'_design',actor:String(actorClerkUserId||'').slice(0,120),
            changedAt:new Date().toISOString(),designChanged:JSON.stringify(before)!==JSON.stringify(design)},
            ...(Array.isArray(current.audit)?current.audit:[])].slice(0,200)};
        await client.query(`INSERT INTO app_system_configuration
          (config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES ($1,$2::jsonb,$3,NOW(),NOW())
          ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,
            updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id,updated_at=NOW()`,
          [POLICY_KEY,JSON.stringify(next),String(actorClerkUserId||'')]);
        await client.query('COMMIT');
        return present(next);
      } catch (failure) {await client.query('ROLLBACK').catch(()=>{});throw failure;}
      finally{client.release();}
    },
    // P1-10: draft never changes the design used by live Outbox snapshots.
    async saveDraft({input,actorClerkUserId}) {
      if(!input||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)throw error('mail_design_invalid',400);
      const {expectedRevision,...fields}=input;
      const design=validateMailDesign(fields);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[POLICY_KEY]);
        const rows=await client.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE',[POLICY_KEY]);
        const current=rows.rows[0]?.payload||emptyPayload();
        if(Number(current.revision||0)!==expectedRevision)throw error('mail_settings_revision_conflict',409);
        const next={...current,revision:expectedRevision+1,designDraft:design,
          audit:[{revision:expectedRevision+1,eventKey:'_design_draft',actor:String(actorClerkUserId||'').slice(0,120),changedAt:new Date().toISOString()},...(Array.isArray(current.audit)?current.audit:[])].slice(0,200)};
        await client.query(`INSERT INTO app_system_configuration(config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES($1,$2::jsonb,$3,NOW(),NOW()) ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,
          updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id,updated_at=NOW()`,[POLICY_KEY,JSON.stringify(next),actorClerkUserId]);
        await client.query('COMMIT');return present(next);
      }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
    },
    async publishDesign({expectedRevision,actorClerkUserId,restoreRevision=null}) {
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0 ||
        (restoreRevision!==null&&(!Number.isSafeInteger(restoreRevision)||restoreRevision<0)))throw error('mail_design_invalid',400);
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[POLICY_KEY]);
        const rows=await client.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE',[POLICY_KEY]);
        const current=rows.rows[0]?.payload||emptyPayload();
        if(Number(current.revision||0)!==expectedRevision)throw error('mail_settings_revision_conflict',409);
        const versions=Array.isArray(current.designVersions)?current.designVersions:[];
        const restored=restoreRevision===null?null:versions.find(v=>v.revision===restoreRevision);
        if(restoreRevision!==null&&!restored)throw error('mail_design_version_not_found',404);
        if(!restored&&!current.designDraft)throw error('mail_design_draft_required',409);
        const chosen=validateMailDesign(restored?restored.design:current.designDraft);
        const before=resolveMailDesign(current.design);
        const at=new Date().toISOString();const revision=expectedRevision+1;
        const next={...current,revision,design:chosen,designDraft:chosen,designPublishedRevision:revision,
          designVersions:[{revision:Number(current.designPublishedRevision||0),design:before,actor:String(current.updatedBy||'system'),changedAt:at},...versions].slice(0,20),
          audit:[{revision,eventKey:restored?'_design_restore':'_design_publish',actor:String(actorClerkUserId||'').slice(0,120),changedAt:at},...(Array.isArray(current.audit)?current.audit:[])].slice(0,200)};
        await client.query(`INSERT INTO app_system_configuration(config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES($1,$2::jsonb,$3,NOW(),NOW()) ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,
          updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id,updated_at=NOW()`,[POLICY_KEY,JSON.stringify(next),actorClerkUserId]);
        await client.query('COMMIT');return present(next);
      }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
    },
    async saveEvent({ key, input, actorClerkUserId }) {
      const patch = validateMailEventUpdate(key, input);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [POLICY_KEY]);
        const existing = await client.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE', [POLICY_KEY]);
        const current = existing.rows[0]?.payload || emptyPayload();
        const revision = Number(current.revision || 0);
        if (patch.expectedRevision !== revision) throw error('mail_settings_revision_conflict', 409);
        const event = MAIL_EVENT_BY_KEY[key];
        const before = eventView(event, current.events?.[key]);
        const next = {
          ...current,
          revision: revision + 1,
          events: { ...current.events, [key]: { enabled: patch.enabled, subject: patch.subject, body: patch.body, bodyFormat: patch.bodyFormat } },
          audit: [{ revision: revision + 1, eventKey: key, actor: String(actorClerkUserId || '').slice(0, 120),
            changedAt: new Date().toISOString(), enabledBefore: before.enabled, enabledAfter: patch.enabled,
            templateChanged: before.subject !== patch.subject || before.body !== patch.body || before.bodyFormat !== patch.bodyFormat },
            ...(Array.isArray(current.audit) ? current.audit : [])].slice(0, 200),
        };
        await client.query(`INSERT INTO app_system_configuration
          (config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES ($1,$2::jsonb,$3,NOW(),NOW())
          ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,
            updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id, updated_at=NOW()`,
          [POLICY_KEY, JSON.stringify(next), String(actorClerkUserId || '')]);
        await client.query('COMMIT');
        return present(next);
      } catch (failure) {
        await client.query('ROLLBACK').catch(() => {});
        throw failure;
      } finally { client.release(); }
    },
  });
};
