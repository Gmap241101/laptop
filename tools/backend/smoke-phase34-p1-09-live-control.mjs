import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createP109RuntimeControl } from '../../server/src/mail/mail-p109-runtime-control.mjs';
import { createP109Dispatcher, classifyP109Failure, startP109WebDyno } from '../../server/src/mail/mail-p109-dispatcher.mjs';
import { createP109BrevoSender } from '../../server/src/mail/mail-p109-brevo-sender.mjs';
import { loadP101MailConfig } from '../../server/src/mail/mail-provider-config.mjs';
import { createMailDeliveryRepository } from '../../server/src/mail/mail-delivery-repository.mjs';
let checks=0;const check=(ok,msg)=>{assert.ok(ok,msg);checks++;};
const env={APP_ENV:'production',P109_OPERATOR_CONTROL_ENABLED:'true',MAIL_ENABLED:'true',MAIL_PROVIDER:'brevo',
  MAIL_DOMAIN_VERIFIED:'true',MAIL_FROM_ADDRESS:'noreply@mail.notebook.recruit.kro.kr',BREVO_API_KEY:'placeholder-NEVER-REAL'};
const cf=loadP101MailConfig(env);
check(cf.configured&&cf.enabled&&!cf.liveSendingReady,'legacy lock remains off; P109 has distinct gate');
const authority={auth:{userId:'user_12345678',sessionId:'sess_1234567890',issuedAt:1700000,expiresAt:1700090,
  reverificationId:'proof_1234567890',factorVerificationAge:[0]},adminAuth:{admin:{adminRole:'owner'}}};
let payload={revision:0,events:{},audit:[]},queued=0,processing=0,aged=0;
let approvalWrites=0, attempts=[];
const fakePool={
 async query(sql){
   if(sql.includes('SELECT payload FROM app_system_configuration'))return {rows:[{payload}]};
   if(sql.includes('COUNT(*) FILTER'))return {rows:[{queued,processing,aged}]};
   throw new Error('unhandled read '+sql.slice(0,80));
 },
 async connect(){return {async query(sql,args=[]){attempts.push(sql);
   if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(sql.includes('SELECT payload FROM app_system_configuration'))return {rows:[{payload}]};
   if(sql.includes('COUNT(*) FILTER'))return {rows:[{queued,processing,aged}]};
   if(sql.includes('INSERT INTO app_mail_runtime_approval_audit')){approvalWrites++;return {rowCount:1}};
   if(sql.includes('INSERT INTO app_system_configuration')){payload=JSON.parse(args[1]);return {rowCount:1}};
   throw new Error('unhandled transaction '+sql.slice(0,80));
 },release(){}}}
};
const control=createP109RuntimeControl(fakePool,{env,loadConfig:()=>cf});
let s=await control.status({authority});check(!s.enabled&&!s.active&&s.revision===0,'DB gate defaults OFF');
const offEnv={...env,MAIL_ENABLED:'false'};
const blocked=createP109RuntimeControl(fakePool,{env:offEnv,loadConfig:()=>loadP101MailConfig(offEnv)});
await assert.rejects(()=>blocked.change({authority,enabled:true,expectedRevision:0}),{code:'mail_delivery_environment_blocked'});checks++;
await assert.rejects(()=>control.change({authority:{auth:authority.auth,adminAuth:{admin:{adminRole:'admin'}}},enabled:true,expectedRevision:0}),{code:'mail_preflight_owner_required'});checks++;
await assert.rejects(()=>control.change({authority:{...authority,auth:{...authority.auth,factorVerificationAge:[7]}},enabled:true,expectedRevision:0}),{code:'mail_preflight_recent_reauthentication_required'});checks++;
queued=3;
await assert.rejects(()=>control.change({authority,enabled:true,expectedRevision:0}),{code:'mail_delivery_queue_review_required'});checks++;
aged=1;
await assert.rejects(()=>control.change({authority,enabled:true,allowQueued:true,expectedRevision:0}),{code:'mail_delivery_queue_review_required'});checks++;
aged=0;processing=1;
await assert.rejects(()=>control.change({authority,enabled:true,allowQueued:true,expectedRevision:0}),{code:'mail_delivery_queue_review_required'});checks++;
processing=0;
await control.change({authority,enabled:true,allowQueued:true,expectedRevision:0});
s=await control.status({authority});check(s.active&&s.enabled&&s.revision===1,'OTP activates DB gate');
check(approvalWrites===1&&payload.audit[0].eventKey==='_delivery','immutable approval audit');
await assert.rejects(()=>control.change({authority,enabled:true,expectedRevision:1}),{code:'mail_delivery_state_unchanged'});checks++;
await assert.rejects(()=>control.change({authority,enabled:false,expectedRevision:0}),{code:'mail_settings_revision_conflict'});checks++;
await control.change({authority,enabled:false,expectedRevision:1});
check((await control.status({authority})).active===false&&approvalWrites===2,'owner OFF requires no new OTP and stops gate');
const out=readFileSync('server/src/mail/mail-delivery-repository.mjs','utf8');
check(out.includes('if(requireRuntimeGate)')&&out.includes("payload?.delivery?.enabled!==true"),'claim locks against master OFF');
check(out.includes("hashtext('phase34-mail-quota-global-v1')"),'global quota serialization');
const repoPool={async connect(){return {async query(sql){if(sql.includes('SELECT payload FROM app_system_configuration'))return {rows:[{payload:{delivery:{enabled:false}}}]};
  if(sql.startsWith('SELECT id,event_key'))return {rows:[{id:5,event_key:'signup_submitted'}]};
  return {rows:[],rowCount:1};},release(){}}}};
check((await createMailDeliveryRepository(repoPool,{requireRuntimeGate:true}).claim({provider:'brevo',dailyLimit:300,monthlyLimit:9300})).state==='master_disabled','master OFF refuses durable claim');
let sent=0,gate=false;
const fakeRepository=()=>({async quarantineExpired(){return {quarantined:0};},
  async claim(){return {state:'claimed',token:'00000000-0000-4000-8000-000000000001',mail:{id:5,token:'00000000-0000-4000-8000-000000000001',attempt:1,maxAttempts:5}};},
  async conclude({outcome}){return {state:outcome};}});
const sender={async send(){sent++;return {messageId:'test-123'}}};
let d=createP109Dispatcher({repository:fakeRepository(),sender,gateRead:()=>gate});
check((await d.tick()).state==='master_disabled'&&sent===0,'OFF -> zero provider calls');
gate=true;check((await d.tick()).state==='sent'&&sent===1,'ON -> single mock dispatch');
const pend=new Promise(resolve=>{globalThis.doneTest=resolve});
d=createP109Dispatcher({repository:fakeRepository(),sender:{async send(){await pend;return {messageId:'test-123'}}},gateRead:()=>true});
const job=d.tick();check((await d.tick()).state==='busy','overlapping ticks excluded');globalThis.doneTest();await job;
check(classifyP109Failure({status:429}).outcome==='retry','429 retry');
check(classifyP109Failure({status:500}).outcome==='uncertain','500 quarantined');
check(classifyP109Failure(new Error('timeout')).outcome==='uncertain','timeout quarantined');
check(classifyP109Failure({status:400}).outcome==='rejected','400 permanently rejected');
let calls=0;
const fakeFetch=async(url,init)=>{calls++;check(url==='https://api.brevo.com/v3/smtp/email','Brevo fixed endpoint');
  check(init.redirect==='error'&&init.headers['api-key']===env.BREVO_API_KEY,'bounded transport');
  const body=JSON.parse(init.body);check(body.to.length===1&&body.to[0].email==='a@example.com','one recipient');
  return {status:201,async json(){return {messageId:'fake-receipt-123'}}};};
const brevo=createP109BrevoSender({config:cf,fetchImpl:fakeFetch});
const accepted=await brevo.send({id:15,token:'00000000-0000-4000-8000-000000000001',to:'a@example.com',
  subject:'test',text:'safe text',html:'',senderName:'System',attempt:1});
check(accepted.messageId==='fake-receipt-123'&&calls===1,'injected HTTP mock acceptance');
assert.throws(()=>createP109BrevoSender({config:{...cf,environment:'staging'}}),/p109_brevo_config_invalid/);checks++;
check(startP109WebDyno({pool:repoPool,env:offEnv}).enabled===false,'service does not schedule with env OFF');
const migration=readFileSync('server/migrations/052_phase34_p1_09_operator_control.sql','utf8');
check(migration.includes('verification_digest TEXT UNIQUE')&&migration.includes('enabled_after BOOLEAN NOT NULL'),'OTP digest uniqueness');
console.log(`[P1-09] PASS ${checks} assertions, real Brevo requests=0, no PostgreSQL mutations outside mocks`);
