import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {evaluateD06COffline, parseD06CArgs, PROVIDER_CHOICES} from '../ops/check-phase34-p1-08-d06c-offline.mjs';

let checks=0;
const test=(label,fn)=>{fn();checks++;};
const base=evaluateD06COffline();
test('offline mode',()=>assert.equal(base.mode,'OFFLINE_READ_ONLY'));
test('no account',()=>assert.equal(base.accountVerified,false));
test('no domain',()=>assert.equal(base.domainVerified,false));
test('no sends',()=>assert.equal(base.canSend,false));
test('no ready',()=>assert.equal(base.liveSendingReady,false));
test('no network',()=>assert.equal(base.vendorApiCalls,0));
test('no email',()=>assert.equal(base.realEmailsSent,0));
test('all locks',()=>assert.equal(base.codeLocksIntact,true));
test('four code locks',()=>assert.equal(base.locks.length,4));
for(const lock of base.locks) test(`lock ${lock.file}`,()=>assert.equal(lock.pass,true));
test('undecided provider',()=>assert.equal(base.provider,'undecided'));
test('undecided blocker',()=>assert.ok(base.blockers.includes('provider_selection_pending')));
test('domain blocker',()=>assert.ok(base.blockers.includes('sender_domain_pending')));
test('outbox blocker',()=>assert.ok(base.blockers.includes('existing_staging_outbox_review_required')));
test('authorization blocker',()=>assert.ok(base.blockers.includes('separate_real_delivery_authorization_required')));
test('no quota without vendor',()=>assert.equal(base.vendorQuota,null));
test('Brevo daily',()=>assert.equal(PROVIDER_CHOICES.brevo.dailyFree,300));
test('Brevo monthly unknown',()=>assert.equal(PROVIDER_CHOICES.brevo.monthlyFreePublished,null));
test('Resend daily',()=>assert.equal(PROVIDER_CHOICES.resend.dailyFree,100));
test('Resend monthly',()=>assert.equal(PROVIDER_CHOICES.resend.monthlyFreePublished,3000));
for(const p of ['brevo','resend']){
 const q=evaluateD06COffline({provider:p,senderDomain:'Notify.Example.COM'});
 test(`${p} select`,()=>assert.equal(q.provider,p));
 test(`${p} normalized`,()=>assert.equal(q.senderDomainCandidate,'notify.example.com'));
 test(`${p} kept blocked`,()=>assert.equal(q.canSend,false));
 test(`${p} account unknown`,()=>assert.equal(q.accountVerified,false));
 test(`${p} DNS not trusted`,()=>assert.equal(q.domainVerified,false));
 test(`${p} not falsely pending selection`,()=>assert.ok(!q.blockers.includes('provider_selection_pending')));
 test(`${p} still DNS blocked`,()=>assert.ok(q.blockers.includes('dns_authentication_evidence_pending')));
 test(`${p} quota`,()=>assert.equal(q.vendorQuota.dailyFree,p==='brevo'?300:100));
}
for(const invalid of ['-foo.example.com','a..com','a.', 'foo.com/evil','foo_com.com','localhost','a'.repeat(64)+'.com','@example.com','foo.example.com\nIN TXT']){
 test(`invalid domain ${invalid}`,()=>assert.throws(()=>evaluateD06COffline({senderDomain:invalid}),/sender_domain_invalid/));
}
for(const invalid of ['other','BREVO','sendgrid','','none']){
 test(`invalid provider ${invalid}`,()=>assert.throws(()=>evaluateD06COffline({provider:invalid}),/provider_must_be_brevo_or_resend/));
}
test('bad type domain',()=>assert.throws(()=>evaluateD06COffline({senderDomain:23}),/sender_domain_invalid/));
test('arguments parser',()=>assert.deepEqual(parseD06CArgs(['--provider','BREVO','--sender-domain','mail.example.com','--json']),{provider:'brevo',senderDomain:'mail.example.com'}));
test('arguments reject',()=>assert.throws(()=>parseD06CArgs(['--unsafe']),/unsupported_argument/));
for(const lock of base.locks){
 const compromised=evaluateD06COffline({sourceOverrides:{[lock.file]:'export const P103_REAL_DELIVERY_LOCKED = false;'}});
 test(`compromised ${lock.file}`,()=>assert.equal(compromised.codeLocksIntact,false));
 test(`block compromised ${lock.file}`,()=>assert.ok(compromised.blockers.includes('source_delivery_lock_missing')));
}
const run=spawnSync(process.execPath,['tools/ops/check-phase34-p1-08-d06c-offline.mjs','--provider','brevo','--sender-domain','notify.example.com','--json'],{encoding:'utf8',cwd:new URL('../../',import.meta.url)});
test('CLI exits success',()=>assert.equal(run.status,0));
test('CLI JSON',()=>assert.equal(JSON.parse(run.stdout).provider,'brevo'));
test('CLI no network',()=>assert.equal(JSON.parse(run.stdout).vendorApiCalls,0));
test('CLI no send',()=>assert.equal(JSON.parse(run.stdout).canSend,false));
console.log(`[phase34-p1-08-d06c-readiness] PASS (${checks} assertions; offline provider review; source hard-lock audit; HTTP=0; EMAIL=0)`);
