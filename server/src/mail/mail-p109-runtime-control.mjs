// Phase 34 P1-09. Operator control is independent from the legacy Brevo sandbox.
// Fail closed unless env, DB permission, and recent owner re-verification all agree.
import { requireMailPreflightReverification, requireMailPreflightOwner } from './mail-p108-preflight-control.mjs';
import { loadP101MailConfig } from './mail-provider-config.mjs';
const KEY = 'mail-notification-settings';
const bad=(code,status=403)=>Object.assign(new Error(code),{code,status});
export const parseP109Gate = (payload) => payload?.delivery?.enabled===true;
export const eligibleP109Environment=(env) => env.APP_ENV==='production' && env.P109_OPERATOR_CONTROL_ENABLED==='true' && env.MAIL_ENABLED==='true';
export function createP109RuntimeControl(pool,{env=process.env,loadConfig=()=>loadP101MailConfig(env)}={}) {
  if(typeof pool?.query!=='function'||typeof pool?.connect!=='function')throw new TypeError('p109_pool_required');
  const readiness=()=>{
    let cfg=null;try{cfg=loadConfig();}catch{}
    const blockers=[];
    if(env.APP_ENV!=='production')blockers.push('mail_production_only');
    if(env.P109_OPERATOR_CONTROL_ENABLED!=='true')blockers.push('mail_operator_control_not_configured');
    if(env.MAIL_ENABLED!=='true')blockers.push('mail_environment_disabled');
    if(cfg?.provider!=='brevo'||!cfg?.configured||cfg?.environment!=='production')blockers.push('mail_brevo_not_ready');
    if(!cfg?.sender?.endsWith('@mail.notebook.recruit.kro.kr'))blockers.push('mail_sender_domain_not_approved');
    if(!cfg || cfg.dailyLimit>300 || cfg.monthlyLimit>9300)blockers.push('mail_quota_invalid');
    return Object.freeze({ready:blockers.length===0,blockers,config:cfg});
  };
  const getStatus=async()=>{
    const [settings,queue]=await Promise.all([
      pool.query('SELECT payload FROM app_system_configuration WHERE config_key=$1',[KEY]),
      pool.query(`SELECT COUNT(*) FILTER(WHERE state IN ('queued','retry'))::integer AS queued,
        COUNT(*) FILTER(WHERE state='processing')::integer AS processing,
        COUNT(*) FILTER(WHERE state IN ('queued','retry') AND created_at<NOW()-INTERVAL '24 hours')::integer AS aged
        FROM app_mail_outbox`),
    ]);
    const {ready,blockers}=readiness();
    const dbEnabled=parseP109Gate(settings.rows[0]?.payload);
    return {authority:'postgresql',enabled:dbEnabled,active:dbEnabled&&ready,
      revision:Number(settings.rows[0]?.payload?.revision||0),blockers,queued:Number(queue.rows[0]?.queued||0),processing:Number(queue.rows[0]?.processing||0),
      aged:Number(queue.rows[0]?.aged||0),provider: 'brevo'};
  };
  return Object.freeze({
    readiness,
    async status({authority}){requireMailPreflightOwner(authority);return getStatus();},
    async change({authority,enabled,allowQueued=false,expectedRevision}){
      requireMailPreflightOwner(authority);
      if(typeof enabled!=='boolean'||typeof allowQueued!=='boolean'||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
        throw bad('mail_delivery_control_invalid',400);
      const proof=enabled?requireMailPreflightReverification(authority):null;
      if(enabled&&!readiness().ready)throw bad('mail_delivery_environment_blocked',409);
      const db=await pool.connect();let started=false;
      try{
        await db.query('BEGIN');started=true;
        // Same ordering as dispatcher claim: global lock -> settings row.
        await db.query("SELECT pg_advisory_xact_lock(hashtext('phase34-mail-quota-global-v1'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('mail-notification-settings'))");
        const rows=await db.query('SELECT payload FROM app_system_configuration WHERE config_key=$1 FOR UPDATE',[KEY]);
        const current=rows.rows[0]?.payload||{revision:0,events:{},audit:[]};
        if(Number(current.revision||0)!==expectedRevision)throw bad('mail_settings_revision_conflict',409);
        if(enabled===parseP109Gate(current))throw bad('mail_delivery_state_unchanged',409);
        if(enabled){
          const queue=await db.query(`SELECT COUNT(*) FILTER(WHERE state IN ('queued','retry'))::integer AS queued,
            COUNT(*) FILTER(WHERE state='processing')::integer AS processing,
            COUNT(*) FILTER(WHERE state IN ('queued','retry') AND created_at<NOW()-INTERVAL '24 hours')::integer AS aged
            FROM app_mail_outbox`);
          const counts=queue.rows[0]||{};
          if(Number(counts.processing||0)>0 || Number(counts.aged||0)>0 || (Number(counts.queued||0)>0 && !allowQueued))
            throw bad('mail_delivery_queue_review_required',409);
          // Used OTP proof cannot be replayed, even after another database revision.
          await db.query(`INSERT INTO app_mail_runtime_approval_audit
            (actor_clerk_user_id,verification_digest,enabled_before,enabled_after)
            VALUES ($1,$2,FALSE,TRUE)`,[proof.actorId,proof.verificationDigest]);
        }else{
          await db.query(`INSERT INTO app_mail_runtime_approval_audit
            (actor_clerk_user_id,verification_digest,enabled_before,enabled_after)
            VALUES ($1,NULL,TRUE,FALSE)`,[authority.auth.userId]);
        }
        const next={...current,revision:expectedRevision+1,delivery:{enabled,changedAt:new Date().toISOString(),
          actor:authority.auth.userId},audit:[{revision:expectedRevision+1,eventKey:'_delivery',actor:authority.auth.userId,
          changedAt:new Date().toISOString(),enabledAfter:enabled},...(Array.isArray(current.audit)?current.audit:[])].slice(0,200)};
        await db.query(`INSERT INTO app_system_configuration
          (config_key,payload,updated_by_clerk_user_id,created_at,updated_at)
          VALUES ($1,$2::jsonb,$3,NOW(),NOW())
          ON CONFLICT(config_key) DO UPDATE SET payload=EXCLUDED.payload,updated_by_clerk_user_id=EXCLUDED.updated_by_clerk_user_id,updated_at=NOW()`,
          [KEY,JSON.stringify(next),authority.auth.userId]);
        await db.query('COMMIT');started=false;
        return {enabled,revision:next.revision,queuedReviewed:allowQueued};
      }catch(e){if(started)await db.query('ROLLBACK').catch(()=>{});
        if(e.code==='23505')throw bad('mail_delivery_reverification_already_used',409);
        throw e;
      }finally{db.release();}
    },
  });
}
