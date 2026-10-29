import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMailPreflightControl,requireMailPreflightReverification,requireMailPreflightOwner,evaluateMailPreflightPolicy,P108_D06_LIVE_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-preflight-control.mjs';
import {P103_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED} from '../../server/src/mail/mail-p108-protected-bridge.mjs';

let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++};
const eq=(got,wanted,label)=>{assert.deepEqual(got,wanted,label);checks++};
const raises=(cb,code)=>{assert.throws(cb,e=>e.code===code);checks++};
const rejects=async(cb,code)=>{await assert.rejects(cb,e=>e.code===code);checks++};
const now=Date.parse('2026-10-23T11:55:00.000Z');
const config={enabled:true,provider:'brevo',domainVerified:true,sender:'no-reply@example.org',apiKey:'FAKE_NOT_A_REAL_KEY',
 allowlist:new Set(['test@example.org']),configured:true,liveSendingReady:false};
const auth={auth:{userId:'user_abcdefghijklm123',sessionId:'sess_1234567',reverificationId:'fresh_demo_123456789012',
 factorVerificationAge:[0,15],issuedAt:100,expiresAt:9999999999},adminAuth:{admin:{adminRole:'owner'}}};
const deniedCases=[
 [{},'mail_preflight_owner_required'],
 [{...auth,adminAuth:{admin:{adminRole:'admin'}}},'mail_preflight_owner_required'],
 [{...auth,auth:{...auth.auth,userId:'xxx'}},'mail_preflight_owner_required'],
];
for(const [value,code] of deniedCases)raises(()=>requireMailPreflightOwner(value),code);
for(const age of [-1,5,6,null,'0',undefined])raises(()=>requireMailPreflightReverification({
 ...auth,auth:{...auth.auth,factorVerificationAge:[age]}}),'mail_preflight_recent_reauthentication_required');
for(const update of [{reverificationId:''},{reverificationId:'abc'},{sessionId:''},{issuedAt:null},{expiresAt:null}])
 raises(()=>requireMailPreflightReverification({...auth,auth:{...auth.auth,...update}}),'mail_preflight_signed_reverification_required');
const proof=requireMailPreflightReverification(auth);
ok(/^[a-f0-9]{64}$/.test(proof.sessionDigest),'session stored as SHA-256');
ok(/^[a-f0-9]{64}$/.test(proof.verificationDigest),'reverification stored as SHA-256');
ok(!JSON.stringify(proof).includes('sess_1234567'),'raw session not stored');
ok(!JSON.stringify(proof).includes('fresh_demo'),'raw reverification not stored');
eq(P103_REAL_DELIVERY_LOCKED,true,'P103 remains locked');
eq(P108_REAL_DELIVERY_LOCKED,true,'P108 remains locked');
eq(P108_D06_LIVE_DELIVERY_LOCKED,true,'D06 remains locked');
const policy=evaluateMailPreflightPolicy({environment:'staging',mailConfig:config,counts:{queued:1},agedCount:1});
eq(policy.liveSendingReady,false,'no live readiness');
eq(policy.canSend,false,'no send permission');
ok(policy.blockers.includes('mail_existing_outbox_requires_review'),'existing queued entries blocker');
ok(policy.blockers.includes('mail_aged_outbox_requires_review'),'aged queued entries blocker');
ok(policy.blockers.includes('mail_real_delivery_not_authorized'),'permanent delivery blocker');
for(const env of ['production','local','development','test'])
 ok(evaluateMailPreflightPolicy({environment:env,mailConfig:config}).blockers.includes('mail_staging_environment_required'),'staging only');
for(const alternate of [{...config,enabled:false},{...config,provider:'disabled'},{...config,apiKey:''},{...config,domainVerified:false},{...config,sender:''},{...config,allowlist:new Set()},{...config,liveSendingReady:true}])
 ok(evaluateMailPreflightPolicy({environment:'staging',mailConfig:alternate}).blockers.length>1,'unready provider detected');

let inserted=[];let sqlLog=[];let failingCommit=false;
const rows=[{id:5,event_key:'admin_signup_pending',state:'queued',created_at:new Date('2026-10-23T07:50:33.871Z')}];
const query=async(sql,params=[])=>{
 sqlLog.push({sql,params});
 if(/GROUP BY state/.test(sql))return {rows:[{state:'queued',total:1},{state:'cancelled',total:4}]};
 if(/COUNT\(\*\)::integer AS total FROM app_mail_outbox/.test(sql))return {rows:[{total:0}]};
 if(/SELECT id,event_key,state,created_at FROM app_mail_outbox/.test(sql))return {rows};
 if(/SELECT id,created_at,review_result FROM app_mail_preflight_reviews/.test(sql))return {rows:inserted.at(-1)?[{id:inserted.at(-1).id,created_at:inserted.at(-1).created_at,review_result:'reviewed_locked'}]:[]};
 if(/INSERT INTO app_mail_preflight_reviews/.test(sql)){
   if(inserted.some(r=>r.digest===params[2]))throw Object.assign(new Error('duplicate'),{code:'23505'});
   const record={id:inserted.length+1,created_at:new Date(now),digest:params[2],params};inserted.push(record);
   return {rows:[{id:record.id,created_at:record.created_at,review_result:'reviewed_locked'}]};
 }
 if(sql==='COMMIT'&&failingCommit)throw new Error('simulated commit failure');
 return {rows:[{}]};
};
const pool={query,async connect(){return {query,release(){sqlLog.push({sql:'RELEASE'})}}}};
const review=createMailPreflightControl(pool,{environment:'staging',getMailConfig:()=>config,now:()=>new Date(now)});
const preview=await review.preview({authority:auth});
eq(preview.authority,'postgresql','existing DB authority');
eq(preview.readOnly,true,'read-only preview');
eq(preview.counts.queued,1,'one pending mail');
eq(preview.samples[0].id,'5','queued ID5 retained');
ok(!JSON.stringify(preview).includes('test@example.org'),'no recipient address exposed');
ok(!JSON.stringify(preview).includes(config.apiKey),'no provider key exposed');
ok(!sqlLog.some(r=>/UPDATE|DELETE|INSERT/.test(r.sql)),'preview did not mutate DB');
await rejects(()=>review.preview({authority:{...auth,adminAuth:{admin:{adminRole:'admin'}}}}),'mail_preflight_owner_required');
await rejects(()=>review.acknowledge({authority:auth,acknowledge:false}),'mail_preflight_confirmation_required');
await rejects(()=>review.acknowledge({authority:{...auth,auth:{...auth.auth,factorVerificationAge:[5]}},acknowledge:true}),'mail_preflight_recent_reauthentication_required');
const saved=await review.acknowledge({authority:auth,acknowledge:true});
eq(saved.recorded,true,'audit insert accepted');
eq(saved.canSend,false,'record never grants delivery');
eq(saved.result,'reviewed_locked','result not an authorization');
eq(inserted.length,1,'only one audit written');
ok(!JSON.stringify(inserted).includes('fresh_demo_123456789012'),'audit never persists reauth plaintext');
ok(!JSON.stringify(inserted).includes('sess_1234567'),'audit never persists session plaintext');
ok(sqlLog.some(r=>r.sql==='BEGIN')&&sqlLog.some(r=>r.sql==='COMMIT'),'transaction used');
await rejects(()=>review.acknowledge({authority:auth,acknowledge:true}),'mail_preflight_reverification_already_used');
eq(inserted.length,1,'repeat proof must not reinsert');
ok(sqlLog.some(r=>r.sql==='ROLLBACK'),'duplicate transaction rolled back');
await rejects(()=>review.dispatch(),'mail_p108_real_delivery_locked');
const production=createMailPreflightControl(pool,{environment:'production',getMailConfig:()=>config});
const productionAuth={...auth,auth:{...auth.auth,reverificationId:'production_unique_123456789'}};
const productionSaved=await production.acknowledge({authority:productionAuth,acknowledge:true});
eq(productionSaved.recorded,true,'production immutable review is permitted');
eq(productionSaved.canSend,false,'production review never grants sending');
eq(productionSaved.result,'reviewed_locked','production review remains locked');
eq(inserted.length,2,'production added exactly one audited review');
await rejects(()=>production.acknowledge({authority:productionAuth,acknowledge:true}),'mail_preflight_reverification_already_used');
eq(inserted.length,2,'production proof replay blocked');
const local=createMailPreflightControl(pool,{environment:'local',getMailConfig:()=>config});
await rejects(()=>local.acknowledge({authority:{...auth,auth:{...auth.auth,reverificationId:'local_unique_123456789'}},acknowledge:true}),'mail_preflight_environment_unsupported');
const frontend=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
ok(frontend.includes('beginAdminMailReverification'),'UI requires email reauthentication');
ok(frontend.includes('acknowledgeAdminMailPreflight'),'UI saves review');
ok(frontend.includes("deliveryControl?.active?'승인됨': '중지'"),'UI reflects independently approved P1-09 delivery state');
const app=readFileSync('server/src/app.mjs','utf8');
ok(app.includes("'/api/admin/mail-delivery/preflight'"),'read-only endpoint');
ok(app.includes("'/api/admin/mail-delivery/preflight-review'"),'review-only endpoint');
ok(!app.includes("'/api/admin/mail-delivery/send'"),'no send endpoint');
const startup=readFileSync('server/src/index.mjs','utf8');
ok(!startup.includes('createP108OfflineDispatcher('),'no sender started');
ok(!startup.includes('createBrevoProvider('),'no real sender started');
const migration=readFileSync('server/migrations/049_phase34_p1_08_mail_preflight_review_audit.sql','utf8');
ok(migration.includes('reverification_digest CHAR(64) NOT NULL UNIQUE'),'replay prevention enforced by PG unique');
ok(!migration.includes('CREATE DATABASE'),'no new database');
ok(!migration.includes('CREATE EXTENSION'),'no addon');
console.log(`[phase34-p1-08-d06ab-preflight] PASS (${checks} assertions; real email 0; real HTTP requests 0; immutable review only; v296 baseline)`);
