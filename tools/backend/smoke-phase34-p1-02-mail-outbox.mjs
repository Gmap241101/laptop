import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMailOutboxRepository } from '../../server/src/mail/mail-outbox-repository.mjs';
import { MAIL_EVENTS, MAIL_EVENT_BY_KEY, renderMailTemplate, validateMailEventUpdate, sanitizeMailHtml, legacyMailTextToHtml } from '../../server/src/mail/mail-event-catalog.mjs';
let checks = 0;
const verify = (condition, label) => { assert.ok(condition,label); checks++; };
const migration = readFileSync('server/migrations/044_phase34_p1_02_mail_outbox.sql','utf8');
for (const fragment of ['CREATE TABLE IF NOT EXISTS app_mail_outbox','dedupe_key CHAR(64) NOT NULL UNIQUE','CREATE INDEX IF NOT EXISTS app_mail_outbox_ready_idx','CREATE TABLE IF NOT EXISTS app_mail_delivery_quota','sent_count INTEGER','lease_expires_at']) verify(migration.includes(fragment), fragment);
verify(MAIL_EVENTS.length === 19, '19 stable events');
for (const [key, variables] of Object.entries({signup_submitted:['signupRequestedAt'],rental_submitted:['rentalRequestedAt'],rental_returned:['rentalReturnedAt'],rental_due_reminder:['rentalDueAt'],extension_approved:['newRentalDueAt'],inquiry_first_answer:['answerCreatedAt'],rental_cancelled:['rentalCancelledAt']})) {
  verify(variables.every((v) => MAIL_EVENT_BY_KEY[key].variables.includes(v)),`variables for ${key}`);
}
const html = '<p style="text-align:center"><strong>신청일: {{rentalRequestedAt}}</strong></p><a href="https://example.org/">확인</a>';
const input = validateMailEventUpdate('rental_submitted',{enabled:true,subject:'신청 확인',body:html,bodyFormat:'html',expectedRevision:1});
verify(input.bodyFormat === 'html' && input.body.includes('<strong>'), 'HTML template accepted');
const result = renderMailTemplate(input,{rentalRequestedAt:'<svg onload=alert(1)>'},MAIL_EVENT_BY_KEY.rental_submitted.variables);
verify(!result.html.includes('<svg ') && result.html.includes('&lt;svg'), 'safe variable substitution');
verify(result.text.includes('<svg'), 'plain text derived');
verify(legacyMailTextToHtml('첫 줄\n둘째 줄') === '<p>첫 줄</p><p>둘째 줄</p>', 'legacy plaintext upgrade');
for (const body of ['<img src="https://evil">','<script>alert(1)</script>','<p onmouseover="alert(1)">x</p>','<a href="javascript:alert(1)">x</a>','<svg><script>x</script></svg>','<span style="background-image:url(https://evil)">x</span>']) {
  assert.throws(()=>sanitizeMailHtml(body),{code:'mail_html_unsafe'});checks++;
}
let policyEnabled = false;
let policy={ events:{ rental_submitted:{enabled:true,subject:'접수',body:'{{name}} {{rentalRequestedAt}}',bodyFormat:'text'} } };
const stored = new Map(); let begun=false;
const client={ async query(sql,params) {
  if (sql.startsWith('SELECT payload FROM app_system_configuration')) return {rows:[{payload:policy}]};
  if (sql.startsWith('INSERT INTO app_mail_outbox')) {
    verify(begun,'transactional insert only');
    const [dedupe,eventKey,to,subject,text,html]=params;
    verify(dedupe.length===64 && eventKey==='rental_submitted' && to==='test@example.com', 'dedupe + recipient normalized');
    verify(!html.includes('<script'), 'safe stored HTML');
    if (stored.has(dedupe)) return {rows:[]};
    stored.set(dedupe,{eventKey,to,subject,text,html});
    return {rows:[{id:1}]};
  }
  throw Error(`unknown SQL: ${sql}`);
}};
const repo=createMailOutboxRepository();
const req={client,eventKey:'rental_submitted',recipientEmail:'TEST@example.com',eventId:'business-event-12345',values:{name:'테스트',rentalRequestedAt:'2026-10-22 14:00'}};
begun=true;
const first=await repo.enqueueInTransaction(req);
verify(first.queued && stored.size===1, 'first transactional enqueue');
const duplicate=await repo.enqueueInTransaction(req);
verify(!duplicate.queued && duplicate.duplicate && stored.size===1,'repeat idempotency');
const disabledPolicy={events:{rental_submitted:{enabled:false}}};policy=disabledPolicy;
const disabled=await repo.enqueueInTransaction({...req,eventId:'business-event-99999'});
verify(!disabled.queued && disabled.reason==='disabled' && stored.size===1,'per-event OFF means no queue');
policyEnabled=true;
verify(policyEnabled, 'test control');
policy={events:{rental_submitted:{enabled:true,subject:'접수',body:'{{name}} {{rentalRequestedAt}}'}}};
await assert.rejects(()=>repo.enqueueInTransaction({...req,eventId:'business-event-45678',values:{name:'테스트'}}),{code:'mail_template_variable_missing'});checks++;
await assert.rejects(()=>repo.enqueueInTransaction({...req,client:null}),{code:'mail_transaction_client_required'});checks++;
verify(!readFileSync('server/src/index.mjs','utf8').includes('createMailOutboxRepository('),'not wired to live events');
verify(!readFileSync('server/src/app.mjs','utf8').includes('/api/admin/mail-outbox'),'no live outbox endpoint');
const panel=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
verify(panel.includes('role="switch"') && panel.includes('aria-checked={draft.enabled}'),'existing admin toggle switch');
verify(panel.includes('RichTextEditor') && panel.includes('allowVideos={false}') && panel.includes('allowImages={false}'),'existing editor reused, media forbidden');
verify(panel.includes('current.variables.length') && panel.includes('copyVariable'), 'event-specific variables displayed');
console.log(`[phase34-p1-02-mail-outbox] PASS (${checks} checks; no sends; one existing PostgreSQL database)`);
