import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAIL_EVENTS, MAIL_EVENT_BY_KEY, validateMailEventUpdate, renderMailTemplate } from '../../server/src/mail/mail-event-catalog.mjs';
import { createMailNotificationSettingsService } from '../../server/src/mail/mail-notification-settings-service.mjs';
import { createBrevoProvider } from '../../server/src/mail/brevo-provider.mjs';
import { loadP101MailConfig, describeP101MailReadiness } from '../../server/src/mail/mail-provider-config.mjs';

let checks = 0;
const test = (condition, title) => { assert.ok(condition, title); checks++; };
const runThrows = (fn, code) => { assert.throws(fn, (error) => error.code === code); checks++; };
test(MAIL_EVENTS.length === 19, '19 distinct events');
test(new Set(MAIL_EVENTS.map((x) => x.key)).size === 19, 'unique keys');
test(MAIL_EVENTS.filter((x) => x.recipient === 'admin').length === 2, 'two admin events');
test(MAIL_EVENTS.filter((x) => x.recipient === 'user').length === 17, '17 user events');
for (const event of MAIL_EVENTS) {
  test(event.defaultEnabled === false, `${event.key} default off`);
  test(Boolean(event.defaultBody && event.defaultSubject), `${event.key} has template`);
}
runThrows(() => validateMailEventUpdate('not_in_catalog', {}), 'mail_event_unknown');
runThrows(() => validateMailEventUpdate('rental_approved', { enabled:'true', subject:'a', body:'b', expectedRevision:0 }), 'mail_template_invalid');
runThrows(() => validateMailEventUpdate('rental_approved', { enabled:true, subject:'a\r\nBcc:attacker', body:'b', expectedRevision:0 }), 'mail_subject_invalid');
runThrows(() => validateMailEventUpdate('rental_approved', { enabled:true, subject:'x', body:'{{apiKey}}', expectedRevision:0 }), 'mail_template_variable_not_allowed');
runThrows(() => validateMailEventUpdate('rental_approved', { enabled:true, subject:'x', body:'{{name}', expectedRevision:0 }), 'mail_template_variable_invalid');
const good = validateMailEventUpdate('rental_approved', { enabled:true, subject:'확인 {{name}}', body:'{{name}}님 안녕하세요', expectedRevision:0 });
test(good.enabled === true, 'valid event update');
const rendered = renderMailTemplate(good, { name:'<img src=x onerror=alert(1)>' }, MAIL_EVENT_BY_KEY.rental_approved.variables);
test(!rendered.html.includes('<img '), 'HTML escaped');
test(rendered.html.includes('&lt;img'), 'Escaped html is visible');

let persisted = null; let inTransaction = false; let commit = 0; let rollback = 0;
const db = {
  async query(sql) { if (sql.startsWith('SELECT')) return { rows: persisted ? [{ payload: persisted }] : [] }; throw new Error('unexpected pool query'); },
  async connect() { return {
    async query(sql, args) {
      if (sql === 'BEGIN') { inTransaction = true; return { rows:[] }; }
      if (sql === 'COMMIT') { commit++; inTransaction = false; return { rows:[] }; }
      if (sql === 'ROLLBACK') { rollback++; inTransaction = false; return { rows:[] }; }
      if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows:[] };
      if (sql.startsWith('SELECT payload')) return { rows: persisted ? [{ payload: persisted }] : [] };
      if (sql.startsWith('INSERT INTO app_system_configuration')) { if (!inTransaction) throw Error('unlocked write'); persisted = JSON.parse(args[1]); return { rows:[] }; }
      throw Error(`Unexpected SQL: ${sql}`);
    }, release() {},
  }; },
};
const service = createMailNotificationSettingsService(db);
const first = await service.list();
test(first.revision === 0 && first.events.length === 19, 'defaults from existing DB without write');
test(first.liveSendingEnabled === false, 'control plane never enables live sends');
const after = await service.saveEvent({ key:'rental_approved', input:{ ...good }, actorClerkUserId:'admin_1' });
test(after.revision === 1, 'single revision increment');
test(after.events.find((e) => e.key==='rental_approved').enabled === true, 'individual toggle persisted');
test(after.events.find((e) => e.key==='rental_submitted').enabled === false, 'other toggle unchanged');
test(commit === 1 && !inTransaction, 'committed transaction');
test(persisted.audit.length === 1 && persisted.audit[0].actor === 'admin_1', 'audit includes actor');
await assert.rejects(() => service.saveEvent({ key:'rental_rejected', input:{ enabled:true, subject:'hello', body:'world', expectedRevision:0 }, actorClerkUserId:'admin_2' }), (e) => e.code === 'mail_settings_revision_conflict'); checks++;
test(rollback === 1 && persisted.revision === 1, 'conflict safely rolled back');

const env={ APP_ENV:'staging', MAIL_PROVIDER:'brevo', MAIL_ENABLED:'true', BREVO_API_KEY:'xkeysib_FAKE_FOR_MOCK',
  MAIL_FROM_ADDRESS:'notifications@notebook.recruit.kro.kr', MAIL_DOMAIN_VERIFIED:'true', MAIL_STAGING_ALLOWLIST:'test@example.org' };
const config=loadP101MailConfig(env);
test(config.provider === 'brevo' && config.dailyLimit === 300, 'Brevo daily ceiling');
test(config.monthlyLimit === 9300, 'Brevo month safety cap');
test(config.liveSendingReady === false, 'live sending hard off');
test(!JSON.stringify(describeP101MailReadiness(config)).includes('xkeysib_FAKE'), 'readiness hides key');
runThrows(() => loadP101MailConfig({ ...env, MAIL_FREE_DAILY_LIMIT:'301' }), undefined);
let calls=0;
const provider = createBrevoProvider({ config, fetchImpl: async (url, options) => {
  calls++;
  test(url === 'https://api.brevo.com/v3/senders/domains/notebook.recruit.kro.kr', 'fixed brevo domain endpoint');
  test(options.method === 'GET' && options.headers['api-key'] === env.BREVO_API_KEY, 'read-only domain check');
  return { ok:true, json:async () => ({ domain:'notebook.recruit.kro.kr', verified:true, authenticated:true }) };
} });
const status = await provider.getDomainStatus();
test(status.verified && status.matchedSenderDomain, 'domain verified when matching');
await assert.rejects(() => provider.send({ to:'test@example.org' }), (error) => error.code === 'outbox_and_quota_ledger_not_ready'); checks++;
test(calls === 1, 'no email API POST');
const bad=await createBrevoProvider({ config, fetchImpl: async () => ({ ok:true, json:async () => ({ domain:'other.org', verified:true, authenticated:true }) }) }).getDomainStatus();
test(!bad.verified, 'domain mismatch fail closed');
// Static route/UI wiring contracts (in addition to behavioral service tests above).
const appSource = readFileSync('server/src/app.mjs', 'utf8');
const adminPanelSource = readFileSync('src/admin/AdminMailNotificationsPanel.jsx', 'utf8');
const workspaceSource = readFileSync('src/admin/AdminWorkspace.jsx', 'utf8');
const clientSource = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
test(appSource.includes("url.pathname === '/api/admin/mail-notifications'"), 'mail policy GET is exposed');
test(appSource.includes('mailNotificationSettingsService.saveEvent'), 'mail policy PATCH is exposed');
test((appSource.slice(appSource.indexOf('// P1 mail configuration'), appSource.indexOf('    // P1-07: shared appearance')).match(/authority.adminAuth\?\.admin\?\.adminRole !== 'owner'/g) || []).length === 2, 'GET and PATCH enforce owner');
test(adminPanelSource.includes('saveAdminMailNotificationEvent'), 'admin panel persists a single event');
test(adminPanelSource.includes('expectedRevision: snapshot.revision'), 'admin panel supplies revision');
test(workspaceSource.includes("adminTab === 'mailNotifications'"), 'admin menu mounts the editor');
test(clientSource.includes("method: 'PATCH'"), 'browser client uses authorized PATCH');
console.log(`[phase34-p1-mail-control-plane] PASS (${checks} checks, 19 events, Brevo mocked, live emails 0)`);
