// P1-08 D01-D05: offline-only vendor-to-Postgres claim bridge safety test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadP101MailConfig} from '../../server/src/mail/mail-provider-config.mjs';
import {MAIL_EVENTS} from '../../server/src/mail/mail-event-catalog.mjs';
import {P103_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED,evaluateP108OfflineGate,createP108OfflineDispatcher,createP108OfflineProviderSender} from '../../server/src/mail/mail-p108-protected-bridge.mjs';
let checks=0, simulated=0, recorded=[];
const ok=(condition,label)=>{assert.ok(condition,label);checks++;};
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const denied=(fn,label)=>{assert.throws(fn,undefined,label);checks++;};
const fail=(patch,code,label)=>{
 const result=evaluateP108OfflineGate({...base,...patch});
 ok(!result.readyForMock&&result.blockers.includes(code),label);
 eq(result.liveSendingReady,false,'never live');
};
const fakeEnv={APP_ENV:'staging',MAIL_ENABLED:'true',MAIL_PROVIDER:'brevo',MAIL_DOMAIN_VERIFIED:'true',
 MAIL_FROM_ADDRESS:'mail@example.org',MAIL_FROM_NAME:'Test sender',MAIL_STAGING_ALLOWLIST:'allowed@example.org',
 MAIL_FREE_DAILY_LIMIT:'3',MAIL_FREE_MONTHLY_LIMIT:'10',BREVO_API_KEY:'INERT_TEST_ONLY'};
const config=loadP101MailConfig(fakeEnv);
const transport={isMock:true,async simulate({provider,payload}){
 simulated++;recorded.push({provider,payload});
 return provider==='brevo'?{status:201,body:{messageId:`mock-message-${simulated}`}}:{status:200,body:{id:`mock-id-${simulated}`}};
}};
const base={config,offlineTransport:transport,operatorRole:'owner',mockApproval:true};
const msg={id:5,token:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',attempt:1,
 to:'ALLOWED@example.org',subject:'승인 확인',html:'<p>테스트 내용</p>',text:'테스트 내용',senderName:'발신자 이름'};
const makeRepository=(message=msg)=>{
 const log={claim:[],conclude:[],recover:0};
 const repository={async quarantineExpired(){log.recover++;return {quarantined:0}},
 async claim(options){log.claim.push(options);return {state:'claimed',token:message.token,mail:message}},
 async conclude(entry){log.conclude.push(entry);return {state:entry.outcome==='accepted'?'sent':entry.outcome==='retry'?'retry':entry.outcome==='rejected'?'failed':'uncertain'}}};
 return {repository,log};
};
eq(P103_REAL_DELIVERY_LOCKED,true,'P103 hardlock');
eq(P108_REAL_DELIVERY_LOCKED,true,'P108 hardlock');
eq(MAIL_EVENTS.length,19,'all email event names');
ok(evaluateP108OfflineGate(base).readyForMock,'explicit Mock gate ready');
fail({operatorRole:'admin'},'offline_owner_approval_required','admin not owner');
fail({operatorRole:'owner',mockApproval:false},'offline_owner_approval_required','owner approval needed');
fail({operatorRole:undefined},'offline_owner_approval_required','unknown operator');
fail({offlineTransport:{async simulate(){}}},'explicit_mock_transport_required','transport marker needed');
fail({offlineTransport:{isMock:true}},'explicit_mock_transport_required','transport implementation needed');
fail({config:{...config,environment:'production'}},'offline_environment_only','production Mock forbidden');
fail({config:{...config,enabled:false}},'provider_not_configured_for_mock','mail disabled');
fail({config:{...config,domainVerified:false}},'provider_not_configured_for_mock','mock domain disabled');
fail({config:{...config,sender:'invalid'}},'provider_not_configured_for_mock','sender missing');
fail({config:{...config,allowlist:new Set()}},'offline_recipient_allowlist_missing','empty allowlist');
fail({config:{...config,liveSendingReady:true}},'unlocked_config_not_allowed','forged ready flag');
fail({config:{...config,dailyLimit:301}},'quota_limit_invalid','cannot exceed day cap');
fail({config:{...config,monthlyLimit:9301}},'quota_limit_invalid','cannot exceed month cap');
for (const environment of ['local','development','test','staging']) ok(evaluateP108OfflineGate({...base,config:{...config,environment}}).readyForMock,`${environment} Mock`);
for (const unsafe of [undefined,null,{}, {isMock:true,simulate:0}]) {
 denied(()=>createP108OfflineProviderSender({config,offlineTransport:unsafe}),'reject absent transport');
}
const first=makeRepository();
const dispatch=createP108OfflineDispatcher({...base,repository:first.repository});
eq(dispatch.status(),{mockReady:true,liveSendingReady:false},'status metadata');
await assert.rejects(()=>dispatch.tickLive(),e=>e.code==='p108_real_delivery_locked');checks++;
eq(first.log.claim.length,0,'live attempt does not claim');
eq(simulated,0,'live attempt cannot simulate');
eq((await dispatch.tickMock()).state,'sent','claim to Mock vendor to conclude');
eq(first.log.claim[0].provider,'brevo','provider claim attached');
eq(first.log.claim[0].dailyLimit,3,'custom lower free daily limit honored');
eq(first.log.claim[0].monthlyLimit,10,'custom lower monthly limit honored');
eq(first.log.conclude[0].outcome,'accepted','provider acceptance concluded');
eq(first.log.conclude[0].providerMessageId,'mock-message-1','acceptance ID recorded');
eq(first.log.recover,1,'expired processing leases quarantined before claim');
eq(recorded[0].payload.sender,{email:'mail@example.org',name:'발신자 이름'},'Outbox sender snapshot used');
eq(recorded[0].payload.to,[{email:'allowed@example.org'}],'normalized single recipient');
eq(recorded[0].payload.subject,'승인 확인','subject snapshot');
eq(recorded[0].payload.htmlContent,msg.html,'HTML snapshot');
ok(!JSON.stringify(recorded).includes('INERT_TEST_ONLY'),'API key never passed to Mock');
ok(!JSON.stringify(recorded).includes(msg.token),'claim token never passed to Mock');

const cases=[
 {status:429,expected:'retry',code:'provider_rate_limited'},
 {status:400,expected:'failed',code:'provider_rejected'},
 {status:401,expected:'failed',code:'provider_rejected'},
 {status:403,expected:'failed',code:'provider_rejected'},
 {status:422,expected:'failed',code:'provider_rejected'},
 {status:500,expected:'uncertain',code:'provider_outcome_uncertain'},
 {status:502,expected:'uncertain',code:'provider_outcome_uncertain'},
 {status:503,expected:'uncertain',code:'provider_outcome_uncertain'},
 {status:408,expected:'uncertain',code:'provider_outcome_uncertain'},
 {status:202,expected:'uncertain',code:'provider_outcome_uncertain'},
 {status:201,body:{},expected:'uncertain',code:'provider_outcome_uncertain'},
 {throw:new Error('network secret'),expected:'uncertain',code:'provider_outcome_uncertain'},
 {throw:{status:429},expected:'retry',code:'provider_rate_limited'},
 {throw:{status:500},expected:'uncertain',code:'provider_outcome_uncertain'},
];
for (const item of cases){
 const mock={isMock:true,async simulate(){if(item.throw)throw item.throw;return {status:item.status,body:item.body??{messageId:'fake.123'}}}};
 const {repository,log}=makeRepository();
 const output=await createP108OfflineDispatcher({...base,offlineTransport:mock,repository}).tickMock();
 eq(output.state,item.expected,`status ${item.status??'exception'} output`);
 eq(log.conclude[0].errorCode,item.code,`status ${item.status??'exception'} safe error`);
 eq(log.conclude.length,1,'one result per claim');
}
for(const to of ['outside@example.org','nobody@example.net','bad\r\nBcc:steal@example.org']){
 const {repository,log}=makeRepository({...msg,to});
 const before=simulated;
 const outcome=await createP108OfflineDispatcher({...base,repository}).tickMock();
 eq(outcome.state,'uncertain','bad recipient quarantined');
 eq(log.conclude[0].errorCode,'provider_outcome_uncertain','never expose sensitive recipient in errors');
 eq(simulated,before,'no transport use for invalid recipient');
}

const resend=loadP101MailConfig({...fakeEnv,MAIL_PROVIDER:'resend',RESEND_API_KEY:'INERT_TEST_ONLY',
 MAIL_FREE_DAILY_LIMIT:'2',MAIL_FREE_MONTHLY_LIMIT:'8'});
ok(evaluateP108OfflineGate({...base,config:resend}).readyForMock,'resend Mock enabled');
const r=makeRepository();
eq((await createP108OfflineDispatcher({...base,config:resend,repository:r.repository}).tickMock()).state,'sent','resend simulated acceptance');
eq(recorded.at(-1).payload.idempotencyKey,'outbox-5','stable outbox idempotency marker');
eq(recorded.at(-1).payload.to,['allowed@example.org'],'resend normalized recipient');
ok(!JSON.stringify(recorded.at(-1)).includes('INERT_TEST_ONLY'),'resend key never shared');
for (const item of cases) {
 const mock={isMock:true,async simulate(){if(item.throw)throw item.throw;return {status:item.status,body:item.body??{id:'resend-test-123'}}}};
 const {repository,log}=makeRepository();
 const result=await createP108OfflineDispatcher({...base,config:resend,offlineTransport:mock,repository}).tickMock();
 eq(result.state,item.expected=== 'sent' ? 'sent' : item.expected,'resend fault outcome');
 eq(log.conclude[0].errorCode,item.code,'resend fault error');
}
for (const missing of ['MAIL_ENABLED','MAIL_FROM_ADDRESS','MAIL_STAGING_ALLOWLIST']) {
 const altered={...fakeEnv,[missing]:''};
 const checkConfig=loadP101MailConfig(altered);
 ok(!evaluateP108OfflineGate({...base,config:checkConfig}).readyForMock,`${missing} fails closed`);
}

// Every catalog event can move through the same approved-configuration Mock bridge.
for (const [index, event] of MAIL_EVENTS.entries()) {
 const {repository,log}=makeRepository({...msg,id:100+index,subject:event.key});
 const result=await createP108OfflineDispatcher({...base,repository}).tickMock();
 eq(result.state,'sent',`catalog event ${event.key} offline`);
 eq(log.conclude.length,1,`catalog event ${event.key} single conclusion`);
}
const startup=readFileSync('server/src/index.mjs','utf8');
for (const marker of ['createP103Dispatcher','createP108OfflineDispatcher','createP108OfflineProviderSender','executeBrevoTransaction']) {
 ok(!startup.includes(marker),`${marker} NOT started in web dyno`);
}
const app=readFileSync('server/src/app.mjs','utf8');
ok(!app.includes('/api/admin/mail-dispatch'),'no live dispatch endpoint');
ok(!app.includes('/api/admin/mail-send'),'no live send endpoint');
ok(!readFileSync('server/src/mail/mail-p108-protected-bridge.mjs','utf8').includes('globalThis.fetch'),'no default global HTTP transport');
eq(simulated,2+MAIL_EVENTS.length,'only intended successful Mock simulations');
console.log(`[phase34-p1-08-d01-d05-safe-delivery] PASS (${checks} assertions; 19 events; PostgreSQL claim mock; both vendors; Mock only; REAL PROVIDER REQUESTS=0; REAL EMAILS=0)`);
