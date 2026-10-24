// D06-D2B-PREP: Brevo selection MUST NOT delete or disable the Resend pathway.
// Entire test uses synthetic input and injected in-memory HTTP fakes only.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {inspectD06D2BProviderPlan, P108_D06D2B_PREP_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-d06d2b-provider-preservation.mjs';
import {loadP101MailConfig} from '../../server/src/mail/mail-provider-config.mjs';
import {createResendProvider, MailProviderError} from '../../server/src/mail/resend-provider.mjs';
import {createBrevoProvider} from '../../server/src/mail/brevo-provider.mjs';
import {createP108OfflineProviderSender, evaluateP108OfflineGate, P108_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-protected-bridge.mjs';
import {P103_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import {P108_D06_LIVE_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-preflight-control.mjs';
import {P108_D06D_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-d06d1-brevo-sandbox.mjs';
import {P108_D06D2A_REAL_DELIVERY_LOCKED, validateD06D2ASandboxPayload} from '../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs';

let checks = 0;
function check(label,fn){try {fn();checks++;}catch(error){throw new Error(`FAIL ${label}: ${error.message}`,{cause:error});}}
async function checkAsync(label,fn){try {await fn();checks++;}catch(error){throw new Error(`FAIL ${label}: ${error.message}`,{cause:error});}}
function blockedResult(p){return p.canAutoFallback === false && p.canSwitchProvider === false &&
  p.canExecuteVendorRequest === false && p.canDeliverEmail === false && p.canReadOrModifyOutbox === false &&
  p.canChangeHerokuConfig === false && p.networkRequestsExecuted === 0 && p.realEmailsSent === 0;}

const to='offline-test@example.net';
const config={environment:'staging',provider:'brevo',enabled:true,
  sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
  liveSendingReady:false,dailyLimit:3,monthlyLimit:30,allowlist:new Set([to])};
const active=inspectD06D2BProviderPlan({config,recipient:to});
check('Brevo selected',()=>assert.equal(active.selectedProvider,'brevo'));
check('both providers available',()=>assert.deepEqual(active.availableProviders,['brevo','resend']));
check('Resend explicitly retained',()=>assert.equal(active.retainedStandbyProvider,'resend'));
check('active plan usable for synthetic preview',()=>assert.equal(active.canBuildBrevoSandboxPreview,true));
check('active never authorizes sending',()=>assert.equal(blockedResult(active),true));
check('active mode',()=>assert.equal(active.mode,'OFFLINE_PROVIDER_PRESERVATION'));
check('preview cannot send',()=>assert.equal(active.preview.canExecuteVendorRequest,false));
check('preview cannot deliver',()=>assert.equal(active.preview.canDeliverEmail,false));
check('correct sandbox payload',()=>assert.equal(validateD06D2ASandboxPayload(active.preview.body,to),true));
check('Brevo sandbox marker in body',()=>assert.equal(active.preview.body.headers['X-Sib-Sandbox'],'drop'));
check('no HTTP headers embedded',()=>assert.equal('authorization' in active.preview,false));
check('plan immutable',()=>assert.equal(Object.isFrozen(active),true));
check('providers immutable',()=>assert.equal(Object.isFrozen(active.availableProviders),true));
check('preflight lock remains',()=>assert.equal(P108_D06D2B_PREP_REAL_DELIVERY_LOCKED,true));
const standby=inspectD06D2BProviderPlan({requestedProvider:'resend',config:{...config,provider:'resend'},recipient:to});
check('standby listed',()=>assert.equal(standby.requestedProvider,'resend'));
check('standby no Brevo preview',()=>assert.equal(standby.preview,null));
check('standby mock interface can be retained',()=>assert.equal(standby.canUseRetainedResendOfflineMock,true));
check('standby needs approval',()=>assert.ok(standby.blockers.includes('separate_provider_switch_approval_required')));
check('no automatic fallback',()=>assert.equal(blockedResult(standby),true));
check('standby plan frozen',()=>assert.equal(Object.isFrozen(standby),true));
for (const choice of ['disabled','none','Brevo','RESEND','smtp','',null,0,false,{},[]]){
  check(`unknown provider rejected ${String(choice)}`,()=>assert.throws(
    ()=>inspectD06D2BProviderPlan({requestedProvider:choice}),e=>e?.code==='unsupported_provider'));
}
for(const input of [
  {...config,environment:'production'},
  {...config,provider:'resend'},
  {...config,enabled:false},
  {...config,liveSendingReady:true},
  {...config,domainVerified:false},
  {...config,allowlist:new Set()},
  {...config,sender:'not-authorized@example.net'},
  {...config,dailyLimit:31},
  {...config,monthlyLimit:901},
  {...config,apiKey:'SHOULD_NEVER_APPEAR'},
]){
  const result=inspectD06D2BProviderPlan({config:input,recipient:to});
  check('unsafe Brevo preview denied',()=>assert.equal(result.preview,null));
  check('unsafe result remains locked',()=>assert.equal(blockedResult(result),true));
}
for(const recipient of ['wrong@example.org','other@example.net','bad\r\nBcc:e@example.net',null]){
  const result=inspectD06D2BProviderPlan({config,recipient});
  check('invalid recipient lacks preview',()=>assert.equal(result.preview,null));
}
const fakeEnv={APP_ENV:'staging',MAIL_ENABLED:'true',MAIL_PROVIDER:'resend',MAIL_DOMAIN_VERIFIED:'true',
  MAIL_FROM_ADDRESS:'sender@example.net',MAIL_FROM_NAME:'Rental System',MAIL_STAGING_ALLOWLIST:to,
  MAIL_FREE_DAILY_LIMIT:'3',MAIL_FREE_MONTHLY_LIMIT:'30',RESEND_API_KEY:'LOCAL_FAKE_RESEND_KEY',RESEND_DOMAIN_ID:'dom-test1234'};
const resend=loadP101MailConfig(fakeEnv);
check('existing Resend provider still supported',()=>assert.equal(resend.provider,'resend'));
check('Resend still configured',()=>assert.equal(resend.configured,true));
check('Resend daily setting read',()=>assert.equal(resend.dailyLimit,3));
check('Resend monthly setting read',()=>assert.equal(resend.monthlyLimit,30));
check('Resend staging allowlist retained',()=>assert.equal(resend.allowlist.has(to),true));
check('Resend configured liveSendingReady false',()=>assert.equal(resend.liveSendingReady,false));
check('Resend key parsed exclusively from RESEND_API_KEY',()=>assert.equal(resend.apiKey,'LOCAL_FAKE_RESEND_KEY'));
for (const prop of ['getDomainStatus','send']){
  check(`Resend provider method ${prop} still exists`,()=>assert.equal(typeof createResendProvider({config:resend,fetchImpl:async()=>{throw Error('unexpected')}})[prop],'function'));
}
let sends=0;
const trap=async()=>{sends++;throw Error('network_called_unexpectedly');};
const resendSender=createResendProvider({config:resend,fetchImpl:trap});
await checkAsync('Resend nonready send blocked before network',()=>assert.rejects(
  resendSender.send({to,subject:'synthetic',text:'offline',idempotencyKey:'offline-only'}),
  e=>e instanceof MailProviderError && e.code==='outbox_and_quota_ledger_not_ready'));
await checkAsync('Resend forged readiness blocked before network',()=>assert.rejects(
  createResendProvider({config:{...resend,liveSendingReady:true},fetchImpl:trap}).send({to,subject:'synthetic',text:'offline',idempotencyKey:'offline-only'}),
  e=>e instanceof MailProviderError && e.code==='p103_real_delivery_locked'));
check('no Resend send network calls',()=>assert.equal(sends,0));
const brevo=loadP101MailConfig({...fakeEnv,MAIL_PROVIDER:'brevo',BREVO_API_KEY:'LOCAL_FAKE_BREVO_KEY',MAIL_FROM_ADDRESS:config.sender});
check('Brevo still selected by config',()=>assert.equal(brevo.provider,'brevo'));
await checkAsync('Brevo forged readiness blocked before network',()=>assert.rejects(
 createBrevoProvider({config:{...brevo,liveSendingReady:true},fetchImpl:trap}).send({to,subject:'synthetic',text:'offline'}),
 e=>e instanceof MailProviderError && e.code==='p103_real_delivery_locked'));
check('no Brevo send network calls',()=>assert.equal(sends,0));
let get=0;
const domainProvider=createResendProvider({config:resend,fetchImpl:async(url,options)=>{
  get++; assert.match(url,/^https:\/\/api\.resend\.com\/domains\/dom-test1234$/);
  assert.equal(options.method,'GET'); return {ok:true,json:async()=>({name:'example.net',status:'verified'})};
}});
await checkAsync('Resend read-only domain status remains supported',async()=>{
  const state=await domainProvider.getDomainStatus();
  assert.equal(state.verified,true);assert.equal(state.matchedSenderDomain,true);
});
check('read-only Resend mock GET exactly once',()=>assert.equal(get,1));
check('no send calls while reading status',()=>assert.equal(sends,0));

let simulations=0;
let captured=null;
const offlineTransport={isMock:true,simulate:async(request)=>{
  simulations++;captured=request;return {status:200,body:{id:'resend-offline-test-001'}};
}};
const mockConfig={...resend,apiKey:'INERT_NOT_FOR_TRANSPORT',liveSendingReady:false};
check('shared P108 gateway supports Resend mock',()=>assert.equal(evaluateP108OfflineGate({config:mockConfig,operatorRole:'owner',mockApproval:true,offlineTransport}).readyForMock,true));
const offlineSender=createP108OfflineProviderSender({config:mockConfig,offlineTransport});
const syntheticMessage={id:5,token:'e3fb0286-2cbb-4af3-8ed9-c71e398262c6',attempt:1,to,subject:'synthetic only',text:'mock',html:''};
await checkAsync('Resend common Outbox mock retained',async()=>{
  const result=await offlineSender.send(syntheticMessage);assert.equal(result.messageId,'resend-offline-test-001');
});
check('exactly one in-memory simulation',()=>assert.equal(simulations,1));
check('mock provider Resend',()=>assert.equal(captured.provider,'resend'));
check('Resend Idempotency-Key logic preserved',()=>assert.equal(captured.payload.idempotencyKey,'outbox-5'));
check('Resend recipient normalization',()=>assert.deepEqual(captured.payload.to,[to]));
check('key not shared with mock transport',()=>assert.equal(JSON.stringify(captured).includes('INERT_NOT_FOR_TRANSPORT'),false));
check('no vendor network requests',()=>assert.equal(sends,0));
check('all delivery locks on',()=>assert.deepEqual([P103_REAL_DELIVERY_LOCKED,P108_REAL_DELIVERY_LOCKED,
 P108_D06_LIVE_DELIVERY_LOCKED,P108_D06D_REAL_DELIVERY_LOCKED,P108_D06D2A_REAL_DELIVERY_LOCKED,
 P108_D06D2B_PREP_REAL_DELIVERY_LOCKED],[true,true,true,true,true,true]));
for(const f of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs',
 'server/src/mail/mail-p108-protected-bridge.mjs','server/src/mail/mail-p108-preflight-control.mjs']){
  check(`new module never imported in runtime ${f}`,()=>assert.equal(readFileSync(f,'utf8').includes('mail-p108-d06d2b-provider-preservation'),false));
}
for(const [name,match] of [
 ['server/src/mail/resend-provider.mjs',/createResendProvider/],
 ['server/src/mail/resend-provider.mjs',/Idempotency-Key/],
 ['server/src/mail/mail-provider-config.mjs',/['"]resend['"],\s*['"]brevo['"]/],
 ['server/src/mail/mail-p108-protected-bridge.mjs',/\['brevo','resend'\]/],
 ['server/src/mail/brevo-provider.mjs',/createBrevoProvider/],
 ['tools/backend/smoke-phase34-p1-08-gate-c-provider-contract.mjs',/createResendProvider/],
 ['tools/backend/smoke-phase34-p1-08-d01-d05-safe-delivery.mjs',/provider==='brevo'/],
]) {
  check(`compat source ${name}: ${match}`,()=>assert.match(readFileSync(name,'utf8'),match));
}
check('no migration 050+',()=>assert.equal(readdirSync('server/migrations').some(x=>/^0(?:5\d|[6-9]\d)_/.test(x)),false));
const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
check('new smoke script configured',()=>assert.ok(scripts['server:phase34:p1-08-d06d2b-preserve:smoke']));
check('Resend can still be selected in mail config CLI',()=>assert.ok(readFileSync('tools/ops/check-phase34-p1-08-d06c-offline.mjs','utf8').includes("resend")));
const moduleSource=readFileSync('server/src/mail/mail-p108-d06d2b-provider-preservation.mjs','utf8');
for(const sourceNeedle of ['fetch(', 'process.env', 'pool.query(', 'http.request(', 'https.request(', 'require(']){
  check('offline module prohibits side effect '+sourceNeedle,()=>assert.equal(moduleSource.includes(sourceNeedle),false));
}
console.log(`[phase34-p1-08-d06d2b-provider-preservation] PASS (${checks} assertions; brevo selected; resend retained; vendor HTTP=0; real mail=0; DB=0)`);
