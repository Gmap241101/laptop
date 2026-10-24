import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createD06D1OfflineSandbox, D06D_BREVO_DOMAIN, D06D_BREVO_SENDER,
  evaluateD06D1Safety, prepareD06D1SyntheticSandbox, P108_D06D_REAL_DELIVERY_LOCKED,
} from '../../server/src/mail/mail-p108-d06d1-brevo-sandbox.mjs';

let tests=0;
const check = (desc, fn) => { fn(); tests++; };
const checkAsync = async (desc, fn) => { await fn(); tests++; };
const allowed='qa@example.net';
const base={environment:'staging',provider:'brevo',enabled:true,domainVerified:true,
  sender:D06D_BREVO_SENDER,allowlist:new Set([allowed]),dailyLimit:30,monthlyLimit:900,
  liveSendingReady:false};
const approvedMock={isMock:true,async simulate() {return {status:201,body:{messageId:'<sandbox.synthetic@brevo.test>'}};}};
check('fixed domain',()=>assert.equal(D06D_BREVO_DOMAIN,'mail.notebook.recruit.kro.kr'));
check('sender',()=>assert.equal(D06D_BREVO_SENDER,'noreply@mail.notebook.recruit.kro.kr'));
check('new hard lock',()=>assert.equal(P108_D06D_REAL_DELIVERY_LOCKED,true));
const safe=evaluateD06D1Safety({config:base,transport:approvedMock});
for(const [k,v] of Object.entries({canRunMock:true,canPerformVendorSandboxCall:false,canSendRealMail:false,liveSendingReady:false})){
  check(`gate ${k}`,()=>assert.equal(safe[k],v));
}
check('blockers empty',()=>assert.deepEqual(safe.blockers,[]));
for(const [field,val,blocker] of [
  ['environment','production','staging_or_test_only'],
  ['provider','resend','brevo_only'],
  ['enabled',false,'brevo_only'],
  ['sender','noreply@notebook.recruit.kro.kr','fixed_verified_sender_required'],
  ['domainVerified',false,'fixed_verified_sender_required'],
  ['liveSendingReady',true,'app_live_delivery_not_locked'],
  ['dailyLimit',301,'brevo_free_quota_guard_invalid'],
  ['dailyLimit',0,'brevo_free_quota_guard_invalid'],
  ['monthlyLimit',9301,'brevo_free_quota_guard_invalid'],
  ['monthlyLimit',0,'brevo_free_quota_guard_invalid'],
  ['allowlist',new Set(),'staging_allowlist_required'],
  ['allowlist',null,'staging_allowlist_required'],
]) {
 const result=evaluateD06D1Safety({config:{...base,[field]:val},transport:approvedMock});
 check(`reject ${field}:${String(val)}`,()=>assert.equal(result.canRunMock,false));
 check(`blocker ${field}:${String(val)}`,()=>assert.ok(result.blockers.includes(blocker)));
}
for(const tr of [undefined,{}, {simulate(){}}, {isMock:true}, {isMock:false,simulate(){}}]){
 check('mock requirement',()=>assert.ok(evaluateD06D1Safety({config:base,transport:tr}).blockers.includes('explicit_mock_transport_required')));
 check('cannot construct without mock',()=>assert.throws(()=>createD06D1OfflineSandbox({config:base,transport:tr}),/explicit_mock_transport_required/));
}
for(const env of ['local','test','development','staging']) {
 check(`environment ${env}`,()=>assert.equal(evaluateD06D1Safety({config:{...base,environment:env},transport:approvedMock}).canRunMock,true));
}
check('reject wrong sender in new module',()=>assert.throws(()=>prepareD06D1SyntheticSandbox({config:{...base,sender:'bad@example.com'},recipient:allowed}),/fixed_verified_sender_required/));
for(const recipient of ['someone@example.org','',null,'a@evil.test\nBCC:other@bad.test','a@example.com, b@example.com']) {
 check('reject unlisted recipient',()=>assert.throws(()=>prepareD06D1SyntheticSandbox({config:base,recipient}),/recipient_not_allowlisted/));
}
const req=prepareD06D1SyntheticSandbox({config:base,recipient:allowed});
for(const [desc,fn] of [
 ['url',()=>assert.equal(req.url,'https://api.brevo.com/v3/smtp/email')],
 ['method',()=>assert.equal(req.method,'POST')],
 ['sandbox header in body',()=>assert.equal(req.payload.headers['X-Sib-Sandbox'],'drop')],
 ['not HTTP header',()=>assert.equal(req.publicHeaders['X-Sib-Sandbox'],undefined)],
 ['sender email',()=>assert.equal(req.payload.sender.email,D06D_BREVO_SENDER)],
 ['recipient one',()=>assert.deepEqual(req.payload.to,[{email:allowed}])],
 ['no cc/bcc',()=>assert.equal(req.payload.cc,undefined)],
 ['no attachments',()=>assert.equal(req.payload.attachment,undefined)],
 ['synthetic subject',()=>assert.ok(req.payload.subject.startsWith('[SANDBOX]'))],
 ['synthetic content',()=>assert.ok(req.payload.textContent.includes('synthetic'))],
 ['no HTML injection',()=>assert.equal(req.payload.htmlContent,undefined)],
 ['no message ID',()=>assert.equal(req.payload.id,undefined)],
 ['no api key',()=>assert.ok(!JSON.stringify(req).includes('api-key'))],
 ['no authorization',()=>assert.ok(!JSON.stringify(req).includes('Authorization'))],
 ['read-only frozen request',()=>assert.equal(Object.isFrozen(req),true)],
 ['frozen payload',()=>assert.equal(Object.isFrozen(req.payload),true)],
 ['frozen recipients',()=>assert.equal(Object.isFrozen(req.payload.to),true)],
 ['frozen headers',()=>assert.equal(Object.isFrozen(req.payload.headers),true)],
 ]) check(desc,fn);
const harness=createD06D1OfflineSandbox({config:base,transport:approvedMock});
await checkAsync('mock 201',async()=>{
 const result=await harness.testSynthetic({recipient:allowed});
 assert.equal(result.sandboxAccepted,true);
 assert.equal(result.realVendorRequests,0);
 assert.equal(result.realEmailsSent,0);
 assert.equal(result.canSendRealMail,false);
 assert.equal(result.recipientEmailDelivered,false);
 assert.equal(result.mode,'OFFLINE_BREVO_SANDBOX_MOCK');
});
await checkAsync('live function always denied',async()=>assert.rejects(()=>harness.sendLive(),/d06d_real_delivery_locked/));
const failMock=(status,body={})=>({isMock:true,async simulate(){return {status,body};}});
for (const [status,code] of [[400,'provider_rejected'],[401,'provider_rejected'],[403,'provider_rejected'],
 [404,'provider_rejected'],[422,'provider_rejected'],[429,'provider_rate_limited'],[500,'provider_outcome_uncertain'],
 [502,'provider_outcome_uncertain'],[408,'provider_outcome_uncertain'],[200,'provider_outcome_uncertain']]) {
 await checkAsync(`status ${status}`,async()=>assert.rejects(
  ()=>createD06D1OfflineSandbox({config:base,transport:failMock(status)}).testSynthetic({recipient:allowed}),
  err=>err?.code===code));
}
for(const body of [{},{messageId:''},{messageId:'a'},{messageId:null},{messageIds:['hey']},null]){
 await checkAsync('invalid acceptance',async()=>assert.rejects(
  ()=>createD06D1OfflineSandbox({config:base,transport:failMock(201,body)}).testSynthetic({recipient:allowed}),
  err=>err?.code==='provider_outcome_uncertain'));
}
for(const err of [{status:429},{status:403},{status:500},new Error('network timeout')]){
 await checkAsync('mock throw classification',async()=>{
  const transport={isMock:true,async simulate(){throw err;}};
  await assert.rejects(()=>createD06D1OfflineSandbox({config:base,transport}).testSynthetic({recipient:allowed}),
   value=>value?.code===(err.status===429?'provider_rate_limited':err.status===403?'provider_rejected':'sandbox_response_uncertain'));
 });
}
let requests=0;
await checkAsync('mock request never contains credentials',async()=>{
 const cfg={...base,apiKey:'xkeysib-THIS_SHOULD_NEVER_BE_EXPOSED'};
 const transport={isMock:true,async simulate(input){
  requests++;
  assert.ok(!JSON.stringify(input).includes('xkeysib-'));
  assert.ok(!JSON.stringify(input).includes('apiKey'));
  assert.equal(input.payload.headers['X-Sib-Sandbox'],'drop');
  return {status:201,body:{messageId:'<mock.sandbox@brevo.test>'}};
 }};
 const result=await createD06D1OfflineSandbox({config:cfg,transport}).testSynthetic({recipient:allowed});
 assert.equal(result.sandboxAccepted,true);
});
check('exactly one mock simulated request',()=>assert.equal(requests,1));
for(const file of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs']){
 const src=readFileSync(file,'utf8');
 check(`not wired into runtime: ${file}`,()=>assert.ok(!src.includes('mail-p108-d06d1-brevo-sandbox')));
}
for(const [file,pat] of [
 ['server/src/mail/mail-dynoweb-dispatcher.mjs',/export const P103_REAL_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-p108-protected-bridge.mjs',/export const P108_REAL_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-p108-preflight-control.mjs',/export const P108_D06_LIVE_DELIVERY_LOCKED = true/],
 ['server/src/mail/mail-provider-config.mjs',/liveSendingReady: false/],
]){
 check(`hard lock ${file}`,()=>assert.match(readFileSync(file,'utf8'),pat));
}
check('no unapproved migration',()=>assert.equal(readdirSync('server/migrations').filter(x=>/^05[1-9]_/.test(x)).length,0));
console.log(`[phase34-p1-08-d06d1-brevo-sandbox] PASS (${tests} assertions; synthetic sandbox mock; vendor calls 0; real mail 0; locks intact)`);
