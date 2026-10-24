import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { D06D2A_ENDPOINT, P108_D06D2A_REAL_DELIVERY_LOCKED,
  inspectD06D2AOfflinePolicy, validateD06D2ASandboxPayload,
  buildD06D2AOfflinePlan, classifyD06D2AMockOutcome, createD06D2ASafeAudit,
} from '../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs';

let assertions = 0;
const check = (label, fn) => { fn(); assertions += 1; };
const reject = (label, fn, code) => check(label, () => assert.throws(fn, (error) => error?.code === code));
const allowed = 'qa@example.net';
const base = { environment: 'staging', provider: 'brevo', enabled: true,
  sender: 'noreply@mail.notebook.recruit.kro.kr', domainVerified: true,
  liveSendingReady: false, allowlist: new Set([allowed]), dailyLimit: 3, monthlyLimit: 30 };
check('source lock', () => assert.equal(P108_D06D2A_REAL_DELIVERY_LOCKED, true));
check('endpoint', () => assert.equal(D06D2A_ENDPOINT, 'https://api.brevo.com/v3/smtp/email'));
const readiness = inspectD06D2AOfflinePolicy({ config: base, recipient: allowed });
for (const [key, value] of Object.entries({canBuildSynthetic:true, canExecuteVendorRequest:false,
  canDeliverEmail:false, canClaimOutbox:false, canGrantSendingApproval:false})) {
  check(`policy.${key}`, () => assert.equal(readiness[key], value));
}
check('offline blocker-free', () => assert.deepEqual(readiness.blockers, []));
check('offline policy frozen', () => assert.ok(Object.isFrozen(readiness)));
for (const [field,value,code] of [
  ['environment','production','staging_only'], ['environment','local','staging_only'],
  ['environment','test','staging_only'], ['environment','development','staging_only'],
  ['provider','resend','brevo_only'], ['provider','disabled','brevo_only'],
  ['enabled',false,'brevo_only'], ['sender','noreply@notebook.recruit.kro.kr','sender_review_required'],
  ['domainVerified',false,'sender_review_required'], ['liveSendingReady',true,'live_delivery_lock_required'],
  ['liveSendingReady',undefined,'live_delivery_lock_required'],
  ['dailyLimit',0,'trial_limits_invalid'], ['dailyLimit',31,'trial_limits_invalid'],
  ['dailyLimit',1.5,'trial_limits_invalid'], ['dailyLimit','3','trial_limits_invalid'],
  ['monthlyLimit',0,'trial_limits_invalid'], ['monthlyLimit',901,'trial_limits_invalid'],
  ['monthlyLimit',0.1,'trial_limits_invalid'],
  ['allowlist',new Set(),'recipient_not_approved'], ['allowlist',new Set([allowed,'two@example.net','three@example.net','four@example.net','five@example.net','six@example.net']),'recipient_not_approved'],
  ['allowlist',null,'recipient_not_approved'], ['allowlist',['qa@example.net'],'recipient_not_approved'],
  ['allowlist',new Set(['QA@EXAMPLE.NET']),'recipient_not_approved'],
]) {
  check(`policy rejects ${field}=${String(value)}`, () => assert.ok(
    inspectD06D2AOfflinePolicy({config:{...base,[field]:value},recipient:allowed}).blockers.includes(code)));
}
for(const key of ['apiKey','smtpKey','authorization','secret']) {
  check(`secret field ${key} blocked`, () => assert.ok(inspectD06D2AOfflinePolicy({
    config:{...base,[key]:'DO_NOT_LOG'},recipient:allowed}).blockers.includes('credentials_forbidden_offline')));
  reject(`cannot construct with ${key}`, () => buildD06D2AOfflinePlan({
    config:{...base,[key]:'DO_NOT_LOG'},recipient:allowed}), 'credentials_forbidden_offline');
}
for (const email of ['',null,'unlisted@example.net','qa@example.net,bad@example.net',
 'evil@example.net\r\nBcc:qa@example.net','"qa"@example.net']) {
  check(`deny recipient ${String(email)}`, () => assert.equal(
    inspectD06D2AOfflinePolicy({config:base,recipient:email}).canBuildSynthetic,false));
  reject(`cannot construct recipient ${String(email)}`, () => buildD06D2AOfflinePlan({config:base,recipient:email}), 'recipient_not_approved');
}
const plan = buildD06D2AOfflinePlan({config:base,recipient:allowed});
check('one recipient',()=>assert.deepEqual(plan.body.to,[{email:allowed}]));
check('POST',()=>assert.equal(plan.method,'POST'));
check('body flag',()=>assert.equal(plan.body.headers['X-Sib-Sandbox'],'drop'));
check('body flag location',()=>assert.equal(plan.headerPlacement,'JSON_BODY_HEADERS'));
check('source-only mode',()=>assert.equal(plan.mode,'OFFLINE_SPECIFICATION_NOT_HTTP'));
check('correct sender',()=>assert.equal(plan.body.sender.email,base.sender));
check('no cc',()=>assert.equal(plan.body.cc,undefined));
check('no bcc',()=>assert.equal(plan.body.bcc,undefined));
check('no attachments',()=>assert.equal(plan.body.attachment,undefined));
check('no schedule',()=>assert.equal(plan.body.scheduledAt,undefined));
check('no metadata',()=>assert.equal(plan.body.params,undefined));
check('no template',()=>assert.equal(plan.body.templateId,undefined));
check('no authorization',()=>assert.equal(plan.canExecuteVendorRequest,false));
check('no delivered email',()=>assert.equal(plan.canDeliverEmail,false));
check('no vendor call',()=>assert.equal(plan.vendorRequestsExecuted,0));
check('no messages',()=>assert.equal(plan.emailsDelivered,0));
check('separate approval required',()=>assert.equal(plan.requiresSeparateApproval,true));
check('digest format',()=>assert.match(plan.bodyDigest,/^[0-9a-f]{64}$/));
check('payload shape',()=>assert.equal(validateD06D2ASandboxPayload(plan.body,allowed),true));
for (const value of [plan,plan.body,plan.body.sender,plan.body.to,plan.body.to[0],plan.body.headers]) {
  check('frozen nesting',()=>assert.equal(Object.isFrozen(value),true));
}
for(const [field,value] of [
  ['headers',{}], ['headers',{'X-Sib-Sandbox':'allow'}],
  ['headers',{'X-Sib-Sandbox':'drop', 'X-Other':'anything'}],
  ['sender',{email:'different@example.net',name:'Rental System'}],
  ['sender',{email:base.sender,name:'Different'}],
  ['to',[{email:allowed},{email:allowed}]], ['to',[{email:'another@example.net'}]],
  ['subject','Hello user'], ['textContent','actual user personal data'],
]) {
  reject(`payload mutation ${field}`,()=>validateD06D2ASandboxPayload({...plan.body,[field]:value},allowed),'unsafe_sandbox_payload');
}
for(const [field,value] of [
  ['attachment',[{name:'private.pdf',url:'https://example.net'}]],
  ['bcc',[{email:'other@example.net'}]], ['cc',[{email:'other@example.net'}]],
  ['htmlContent','<b>user content</b>'], ['scheduledAt','2026-10-24T12:00:00Z'],
  ['templateId',1], ['tags',['real']], ['messageVersions',[]], ['params',{user:1}],
  ['apiKey','THIS_IS_SECRET'], ['replyTo',{email:allowed}],
]) {
  reject(`reject extra key ${field}`,()=>validateD06D2ASandboxPayload({...plan.body,[field]:value},allowed),'unsafe_sandbox_payload');
}
const success = classifyD06D2AMockOutcome({status:201,body:{messageId:'<mock@brevo.test>'}});
check('mock success accepted',()=>assert.equal(success.sandboxAccepted,true));
check('mock outcome',()=>assert.equal(success.verdict,'sandbox_simulated_acceptance'));
check('mock response id hashed',()=>assert.match(success.providerIdDigest,/^[0-9a-f]{64}$/));
check('mock cannot send',()=>assert.equal(success.realEmailsSent,0));
check('mock no network',()=>assert.equal(success.networkRequestsExecuted,0));
check('mock not delivered',()=>assert.equal(success.deliveryConfirmed,false));
check('mock no automatic retry',()=>assert.equal(success.automaticRetryAllowed,false));
check('mock no review for success',()=>assert.equal(success.requiresHumanReview,false));
check('mock no raw id in result',()=>assert.equal(JSON.stringify(success).includes('<mock@brevo.test>'),false));
for (const status of [400,401,403,404,422,429,408,409,425,500,502,503,599,200,202,204,null,undefined,'201']) {
  const result=classifyD06D2AMockOutcome({status,body:{messageId:'<mock@brevo.test>'}});
  const expected=status===429?'rate_limited_manual_review':
    [400,401,403,404,422].includes(status)?'rejected_manual_review':'uncertain_quarantine';
  check(`classify ${String(status)}`,()=>assert.equal(result.verdict,expected));
  check(`not successful ${String(status)}`,()=>assert.equal(result.sandboxAccepted,false));
  check(`no retry ${String(status)}`,()=>assert.equal(result.automaticRetryAllowed,false));
  check(`review ${String(status)}`,()=>assert.equal(result.requiresHumanReview,true));
}
for(const body of [undefined,null,{},[],{messageId:''},{messageId:'ab'},
  {messageId:'x'.repeat(256)},{messageId:12},{messageIds:['foo']},
  {messageId:'bad\nnewline'}]) {
  const result=classifyD06D2AMockOutcome({status:201,body});
  check('malformed 201 quarantined',()=>assert.equal(result.verdict,'uncertain_quarantine'));
  check('malformed 201 cannot retry',()=>assert.equal(result.automaticRetryAllowed,false));
}
const audit=createD06D2ASafeAudit({plan,outcome:success});
check('audit event',()=>assert.equal(audit.event,'phase34.d06d2a.offline_mock'));
check('audit is readonly',()=>assert.ok(Object.isFrozen(audit)));
check('no email recipient in audit',()=>assert.equal(JSON.stringify(audit).includes(allowed),false));
check('no raw provider id in audit',()=>assert.equal(JSON.stringify(audit).includes('<mock@brevo.test>'),false));
check('audit real request count 0',()=>assert.equal(audit.realVendorRequests,0));
check('audit real email count 0',()=>assert.equal(audit.realEmailsSent,0));
check('audit no authorization',()=>assert.equal(audit.authorizedToSend,false));
reject('audit invalid inputs',()=>createD06D2ASafeAudit({plan:{},outcome:success}), 'offline_audit_input_invalid');
reject('audit invalid outcome',()=>createD06D2ASafeAudit({plan,outcome:{}}), 'offline_audit_input_invalid');
for(const file of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs',
 'server/src/mail/mail-p108-protected-bridge.mjs','server/src/mail/mail-p108-preflight-control.mjs']) {
  check(`runtime not importing ${file}`,()=>assert.ok(!readFileSync(file,'utf8').includes('mail-p108-d06d2a-sandbox-gate')));
}
const gateway=readFileSync('server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs','utf8');
for(const pattern of [ /\bfetch\s*\(/, /\bimport\s*\(\s*['"]node:(?:http|https|net)/,
  /\bprocess\.env\b/, /\bMAIL_ENABLED\b/, /\bpool\.query\s*\(/ ]) {
  check(`source excludes side effect ${pattern}`,()=>assert.equal(pattern.test(gateway),false));
}
for(const [file,pattern] of [
 ['server/src/mail/mail-dynoweb-dispatcher.mjs',/export const P103_REAL_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-p108-protected-bridge.mjs',/export const P108_REAL_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-p108-preflight-control.mjs',/export const P108_D06_LIVE_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-p108-d06d1-brevo-sandbox.mjs',/export const P108_D06D_REAL_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-provider-config.mjs',/liveSendingReady: false/],
]) check(`existing hard lock ${file}`,()=>assert.match(readFileSync(file,'utf8'),pattern));
check('no migration 050',()=>assert.equal(readdirSync('server/migrations').some(x=>/^050_/.test(x)),false));
check('script wired',()=>assert.ok(JSON.parse(readFileSync('package.json','utf8')).scripts['server:phase34:p1-08-d06d2a:smoke']));
console.log(`[phase34-p1-08-d06d2a-offline-gate] PASS (${assertions} assertions; vendor API calls=0; actual email=0; runtime/DB unchanged)`);
