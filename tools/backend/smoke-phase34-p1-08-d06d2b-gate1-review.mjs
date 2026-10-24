// D06-D2B-G1: entirely synthetic tests; zero DB, HTTP, CLI config or vendor calls.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {inspectD06D2BGate1,createD06D2BGate1OfflineRecord,D06D2B_REGRESSION_DOMAINS,
  P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-d06d2b-gate1-review.mjs';
import {P108_D06D2B_PREP_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-d06d2b-provider-preservation.mjs';
import {buildD06D2AOfflinePlan} from '../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs';

let checks=0;
function check(name, fn) { try {fn(); checks++;} catch(e) { console.error('FAIL:',name);throw e;} }
const clock='2026-10-24T10:00:00.000Z';
const recipient='synthetic-recipient@example.test';
const config={environment:'staging',provider:'brevo',enabled:true,
  sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,liveSendingReady:false,
  allowlist:new Set([recipient]),dailyLimit:1,monthlyLimit:1};
const evidence={
  source:'operator_attestation',observedAt:'2026-10-24T09:59:00.000Z',stagingBuild:'v299',
  reviewerRole:'super_admin',reauthenticatedAt:'2026-10-24T09:59:00.000Z',
  regression:Object.fromEntries(D06D2B_REGRESSION_DOMAINS.map(k=>[k,true])),
  outbox:{id:5,eventType:'admin_signup_pending',status:'queued',reviewedReadOnly:true,mutationPerformed:false},
  backup:{reviewedReadOnly:true,status:'Completed',verifiedAt:'2026-10-24T09:00:00.000Z'},
};
const ok=inspectD06D2BGate1({config,recipient,evidence,now:clock});
check('fixture complete only as attestation',()=>assert.equal(ok.operatorAttestationComplete,true));
check('review cannot verify operator claims',()=>assert.equal(ok.externallyVerified,false));
check('review cannot grant vendor approval',()=>assert.equal(ok.actualProviderApprovalGranted,false));
check('review cannot access vendor',()=>assert.equal(ok.canExecuteVendorRequest,false));
check('review cannot send real mail',()=>assert.equal(ok.canSendRealMail,false));
check('review cannot modify Outbox',()=>assert.equal(ok.canClaimOrModifyOutbox,false));
check('review cannot failover',()=>assert.equal(ok.canAutoFallbackToResend,false));
check('review preserves Resend',()=>assert.deepEqual(ok.retainedProviders,['brevo','resend']));
check('review no blockers',()=>assert.deepEqual(ok.blockers,[]));
check('review frozen',()=>assert.ok(Object.isFrozen(ok)));
check('preservation lock retained',()=>assert.equal(P108_D06D2B_PREP_REAL_DELIVERY_LOCKED,true));
check('new gate lock retained',()=>assert.equal(P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED,true));
const record=createD06D2BGate1OfflineRecord({config,recipient,evidence,now:clock});
check('no authenticated approval',()=>assert.equal(record.isAuthenticatedPermissionGrant,false));
check('no vendor call',()=>assert.equal(record.allowsVendorCall,false));
check('new approval required',()=>assert.equal(record.requiresSeparateSandboxApproval,true));
check('live approval required',()=>assert.equal(record.requiresSeparateLiveDeliveryApproval,true));
check('zero vendor requests',()=>assert.equal(record.vendorRequestsExecuted,0));
check('zero real mail',()=>assert.equal(record.realEmailsSent,0));
check('safe digest',()=>assert.match(record.evidenceDigest,/^[0-9a-f]{64}$/));
check('D2A body digest retained',()=>assert.equal(record.syntheticBodyDigest,buildD06D2AOfflinePlan({config,recipient}).bodyDigest));
check('no PII recipient in record',()=>assert.equal(JSON.stringify(record).includes(recipient),false));
check('no key leaked',()=>assert.equal(JSON.stringify(record).includes('api-key'),false));
check('record deeply restricted',()=>assert.ok(Object.isFrozen(record.availableProviders)));
for (const name of D06D2B_REGRESSION_DOMAINS) {
  check(`domain ${name} accepted true`,()=>assert.equal(evidence.regression[name],true));
  for (const value of [false,null,'PASS',1,0,undefined]) {
    const altered={...evidence,regression:{...evidence.regression,[name]:value}};
    const review=inspectD06D2BGate1({config,recipient,evidence:altered,now:clock});
    check(`domain ${name} rejects ${String(value)}`,()=>assert.ok(review.blockers.includes('eight_area_regression_unverified')));
    check(`domain ${name} cannot grant approval`,()=>assert.equal(review.canExecuteVendorRequest,false));
  }
}
for (const [label,altered,code] of [
  ['no evidence',undefined,'operator_attestation_invalid'],
  ['array evidence',[],'operator_attestation_invalid'],
  ['source bypass',{...evidence,source:'provider_verified'},'operator_attestation_invalid'],
  ['prod build',{...evidence,stagingBuild:'production'},'operator_attestation_invalid'],
  ['secret field',{...evidence,apiKey:'MUST_REJECT'},'operator_attestation_invalid'],
  ['untrusted reviewer',{...evidence,reviewerRole:'admin'},'recent_super_admin_reauth_missing'],
  ['stale reauth',{...evidence,reauthenticatedAt:'2026-10-24T09:54:59.999Z'},'recent_super_admin_reauth_missing'],
  ['future reauth',{...evidence,reauthenticatedAt:'2026-10-24T10:00:00.001Z'},'recent_super_admin_reauth_missing'],
  ['bad timestamp',{...evidence,observedAt:'yesterday'},'staging_evidence_missing_or_stale'],
  ['future observation',{...evidence,observedAt:'2026-10-24T11:00:00.000Z'},'staging_evidence_missing_or_stale'],
  ['stale observation',{...evidence,observedAt:'2026-10-23T09:59:59.999Z'},'staging_evidence_missing_or_stale'],
  ['outbox wrong id',{...evidence,outbox:{...evidence.outbox,id:'5'}},'outbox_five_review_missing'],
  ['outbox different event',{...evidence,outbox:{...evidence.outbox,eventType:'admin_rental_pending'}},'outbox_five_review_missing'],
  ['outbox mutated',{...evidence,outbox:{...evidence.outbox,mutationPerformed:true}},'outbox_five_review_missing'],
  ['outbox unread',{...evidence,outbox:{...evidence.outbox,reviewedReadOnly:false}},'outbox_five_review_missing'],
  ['outbox secret',{...evidence,outbox:{...evidence.outbox,email:'leak@example.org'}},'outbox_five_review_missing'],
  ['backup missing',{...evidence,backup:{...evidence.backup,reviewedReadOnly:false}},'recent_backup_review_missing'],
  ['backup stale',{...evidence,backup:{...evidence.backup,verifiedAt:'2026-10-23T09:59:59.999Z'}},'recent_backup_review_missing'],
  ['backup not complete',{...evidence,backup:{...evidence.backup,status:'Started'}},'recent_backup_review_missing'],
]) {
  const review=inspectD06D2BGate1({config,recipient,evidence:altered,now:clock});
  check(`${label}: code`,()=>assert.ok(review.blockers.includes(code)));
  check(`${label}: no attestation`,()=>assert.equal(review.operatorAttestationComplete,false));
  check(`${label}: cannot approve`,()=>assert.equal(review.actualProviderApprovalGranted,false));
  check(`${label}: record blocked`,()=>assert.throws(
    ()=>createD06D2BGate1OfflineRecord({config,recipient,evidence:altered,now:clock}), e=>e?.code===review.blockers[0]));
}
for (const [label,bad] of [
  ['production',{...config,environment:'production'}],
  ['resend',{...config,provider:'resend'}],
  ['disabled',{...config,enabled:false}],
  ['live unlocked',{...config,liveSendingReady:true}],
  ['wrong sender',{...config,sender:'noreply@example.org'}],
  ['domain unverified',{...config,domainVerified:false}],
  ['missing allowlist',{...config,allowlist:new Set()}],
  ['oversized daily',{...config,dailyLimit:31}],
  ['secret',{...config,apiKey:'mock-not-a-real-key'}],
]) {
  const review=inspectD06D2BGate1({config:bad,recipient,evidence,now:clock});
  check(`${label} policy fails`,()=>assert.ok(review.blockers.includes('sandbox_policy_failed')));
  check(`${label} never allows request`,()=>assert.equal(review.canExecuteVendorRequest,false));
}
for (const value of ['no recipient',null,'not-email','c@example.test']) {
  const review=inspectD06D2BGate1({config,recipient:value,evidence,now:clock});
  check(`bad recipient ${String(value)}`,()=>assert.equal(review.operatorAttestationComplete,false));
}
for (const value of [undefined,'2026-10-24','2026-10-24T10:00:00Z', '2026-10-24T11:00:00.000Z']) {
  const review=inspectD06D2BGate1({config,recipient,evidence,now:value});
  check(`bad clock ${String(value)}`,()=>assert.equal(review.operatorAttestationComplete,false));
  check(`bad clock never approves ${String(value)}`,()=>assert.equal(review.canExecuteVendorRequest,false));
}
for (const path of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs',
  'server/src/mail/mail-p108-protected-bridge.mjs','server/src/mail/mail-p108-preflight-control.mjs']) {
  check(`runtime does not import gate ${path}`,()=>assert.ok(!readFileSync(path,'utf8').includes('mail-p108-d06d2b-gate1-review')));
}
const newSource=readFileSync('server/src/mail/mail-p108-d06d2b-gate1-review.mjs','utf8');
for (const disallowed of ['fetch(', 'process.env', 'pool.query(', 'https.request(', 'http.request(', 'globalThis.fetch(', 'RESEND_API_KEY']) {
  check(`no live capability in gate source: ${disallowed}`,()=>assert.ok(!newSource.includes(disallowed)));
}
check('resend adapter remains',()=>assert.ok(readFileSync('server/src/mail/resend-provider.mjs','utf8').includes('Idempotency-Key')));
check('Resend still in provider config',()=>assert.ok(readFileSync('server/src/mail/mail-provider-config.mjs','utf8').includes("'resend', 'brevo'")));
check('no unapproved migrations',()=>assert.equal(readdirSync('server/migrations').some(f=>/^05[1-9]_/.test(f)),false));
check('new test npm script registered',()=>assert.ok(JSON.parse(readFileSync('package.json','utf8')).scripts['server:phase34:p1-08-d06d2b-gate1:smoke']));
console.log(`[phase34-p1-08-d06d2b-gate1] PASS (${checks} assertions; offline evidence unverified; Brevo selected; Resend preserved; HTTP=0; email=0; DB=0)`);
