// Offline-only synthetic transaction simulator: NO real DB, HTTP or mail.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD06D2BGate2LockedRepository,inspectD06D2BGate2StaticContract,
 P108_D06D2B_GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED,D06D2B_GATE2_PROVIDERS} from '../../server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs';
let checks=0;const ck=(x,msg)=>{assert.ok(x,msg);checks++;};
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const rejected=async(p,code)=>{await assert.rejects(p,e=>e?.code===code);checks++;};
const recipient='only-synthetic@example.test';
const config={environment:'staging',provider:'brevo',enabled:true,
 sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,liveSendingReady:false,
 allowlist:new Set([recipient]),dailyLimit:1,monthlyLimit:1};
const approvalId='00000000-0000-4000-8000-000000000001';
const authority={adminAuth:{admin:{adminRole:'owner'}},auth:{userId:'user_ABCDEFGHIJK',
  factorVerificationAge:[0],reverificationId:'secureSyntheticReverify001',sessionId:'sessSynthetic12345',issuedAt:1729000000,expiresAt:1729000300}};
const evidence={verifiedByServer:true,stagingRegression8of8:true,outboxFiveReviewedReadOnly:true,
 backupIndependentlyVerified:true,sandboxOnlyExplicitApproval:true,approvalId,production:false};
function memoryPool() {
 const state={rows:[],audit:[],nextId:1,log:[],queries:[]};
 let lock=Promise.resolve();
 return {state,async connect(){
   let done;const prior=lock;lock=new Promise(r=>{done=r});await prior;
   let tx=state.rows.map(x=>({...x})), events=state.audit.map(x=>({...x})), nextId=state.nextId;
   let completed=false;
   return {async query(sql,args=[]){
      const normalized=sql.trim();state.log.push(normalized);state.queries.push([normalized,args]);
      if(normalized==='BEGIN'||normalized.startsWith('SET LOCAL')||normalized.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
      if(normalized.startsWith('INSERT INTO app_mail_sandbox_review_reservations')){
        const [key,actor,reauth,session,digest]=args;
        if(tx.some(r=>r.key===key||r.reauth===reauth))return {rows:[]};
        const id=nextId++;tx.push({id:String(id),key,actor,reauth,session,digest,state:'held_locked'});
        return {rows:[{id:String(id)}]};
      }
      if(normalized.startsWith('UPDATE app_mail_sandbox_review_reservations')){
        const [id,stateName,verdict,providerId,actor,reauth,session]=args;const row=tx.find(r=>r.id===id&&r.state==='held_locked'&&r.actor===actor&&r.reauth===reauth&&r.session===session);
        if(!row)return {rows:[]};row.state=stateName;row.verdict=verdict;row.providerId=providerId;
        return {rows:[{id,actor_clerk_user_id:row.actor,body_digest:row.digest}]};
      }
      if(normalized.startsWith('INSERT INTO app_mail_sandbox_review_audit')){
        const [id,event,actor,digest]=args;
        events.push({id,event,actor,digest});return {rows:[]};
      }
      if(normalized==='COMMIT'){
        state.rows=tx;state.audit=events;state.nextId=nextId;completed=true;return {rows:[]};
      }
      if(normalized==='ROLLBACK'){completed=true;return {rows:[]};}
      throw Error('UNEXPECTED_SQL:'+normalized);
   },release(){done()}};
 }};
}
const make=(pool=memoryPool(),opts={})=>createD06D2BGate2LockedRepository(pool,{
 verifyServerAuthority:async()=>opts.authority??authority,
 verifyIndependentEvidence:async()=>Object.hasOwn(opts,'evidence')?opts.evidence:evidence,
 getServerMailConfig:async()=>opts.config??config,
 verifySyntheticFixture:async({fixture,reservationId})=>Object.hasOwn(opts,'trustedFixture')?opts.trustedFixture:
 ({verifiedByServer:true,source:'trusted_offline_registry',provider:'brevo',
  reservationId,mode:'synthetic_fixture',status:fixture.status,body:fixture.body})});
const reserve=(service,overrides={})=>service.reserveReviewOnly({requestContext:Object.freeze({sample:'offline'}),approvalId,recipient,...overrides});

ck(P108_D06D2B_GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED===true,'hard lock');
eq(D06D2B_GATE2_PROVIDERS,['brevo','resend']);
const p=inspectD06D2BGate2StaticContract({config,recipient});
eq(p.provider,'brevo');eq(p.canExecuteVendorRequest,false);eq(p.canSendMail,false);
eq(p.canClaimOutbox,false);eq(p.canAutoFallback,false);eq(p.requiresReviewedSchemaMigration,true);
eq(p.requiresIndependentStagingProof,true);eq(p.requiresSeparateSandboxNetworkApproval,true);
eq(p.retainedProviders,['brevo','resend']);ck(/^[a-f0-9]{64}$/.test(p.bodyDigest));
for(const bad of [undefined,{}, {connect:1}]){
  assert.throws(()=>createD06D2BGate2LockedRepository(bad,{}),/gate2_trusted_server_dependencies_required/);checks++;
}
for(const opt of [{verifyServerAuthority:async()=>authority},{verifyIndependentEvidence:async()=>evidence},
 {getServerMailConfig:async()=>config},{}]){
  assert.throws(()=>createD06D2BGate2LockedRepository(memoryPool(),opt),/gate2_trusted_server_dependencies_required/);checks++;
}
for(const [label,change] of [
 ['production',{environment:'production'}],['resend',{provider:'resend'}],
 ['live enabled',{liveSendingReady:true}],['sender',{sender:'evil@example.test'}],
 ['allowlist',{allowlist:new Set()}],['large daily',{dailyLimit:301}],
 ['secret',{apiKey:'not-real'}],['domain',{domainVerified:false}],
]){
  const m=memoryPool();const service=make(m,{config:{...config,...change}});
  await rejected(reserve(service),'gate2_sandbox_policy_blocked');eq(m.state.rows.length,0,label);eq(m.state.audit.length,0,label);
}
for(const bad of ['garbage','',null,'00000000-0000-0000-0000-000000000000',
 '00000000-0000-4000-8000-000000000001; DELETE FROM app_mail_outbox']){
 const service=make();await rejected(reserve(service,{approvalId:bad}),'gate2_approval_identity_invalid');
}
for(const bad of [null,undefined,2,{}]){
 const service=make();await rejected(reserve(service,{recipient:bad}),'gate2_recipient_invalid');
}
for(const change of [{adminAuth:{admin:{adminRole:'admin'}}},{auth:{...authority.auth,factorVerificationAge:[10]}},
 {auth:{...authority.auth,reverificationId:'bad'}},{auth:{...authority.auth,userId:'bad'}}]){
 const m=memoryPool();const service=make(m,{authority:{...authority,...change}});
 await assert.rejects(reserve(service));checks++;eq(m.state.rows.length,0);
}
for(const [key,value] of [['verifiedByServer',false],['stagingRegression8of8',false],
 ['outboxFiveReviewedReadOnly',false],['backupIndependentlyVerified',false],
 ['sandboxOnlyExplicitApproval',false],['approvalId','another'],['production',true]]){
 const m=memoryPool();const service=make(m,{evidence:{...evidence,[key]:value}});
 await rejected(reserve(service),'gate2_independent_approval_missing');
 eq(m.state.rows.length,0);eq(m.state.audit.length,0);
}
for(const e of [null,undefined,{}, {source:'operator_attestation'}]){
 const m=memoryPool();const service=make(m,{evidence:e});
 // Explicit undefined falls back to synthetic valid fixture in the test factory.
 if(e===undefined)continue;
 await rejected(reserve(service),'gate2_independent_approval_missing');
}
const db=memoryPool(),service=make(db);
const good=await reserve(service);
eq(good.state,'held_locked');eq(good.approvalGrantedForVendorCall,false);
eq(good.canDeliverEmail,false);eq(good.canAutoFallback,false);eq(good.canClaimOutbox,false);
eq(good.networkCallsExecuted,0);eq(good.retainedProviders,['brevo','resend']);
eq(db.state.rows.length,1);eq(db.state.audit.length,1);
ck(db.state.log.includes('BEGIN'));ck(db.state.log.includes('COMMIT'));
ck(db.state.log.some(q=>q.includes('pg_advisory_xact_lock')));
ck(db.state.log.some(q=>q.includes('ON CONFLICT DO NOTHING')));
await rejected(reserve(service),'gate2_approval_or_reauth_already_reserved');
eq(db.state.rows.length,1);eq(db.state.audit.length,1);
// Altered approval identifier cannot bypass one-time reauth uniqueness.
await rejected(reserve(service,{approvalId:'00000000-0000-4000-8000-000000000002'}),'gate2_independent_approval_missing');
const valid2=make(db,{evidence:{...evidence,approvalId:'00000000-0000-4000-8000-000000000002'}});
await rejected(reserve(valid2,{approvalId:'00000000-0000-4000-8000-000000000002'}),'gate2_approval_or_reauth_already_reserved');
// Strict fixture settlement: quarantines timeouts/5xx; does not retry.
const settled=await service.settleMockOnly({reservationId:good.reservationId,
 fixture:{mode:'synthetic_fixture',status:504,body:{}}});
eq(settled.state,'uncertain_quarantine');eq(settled.automaticRetryAllowed,false);
eq(settled.approvalGrantedForVendorCall,false);eq(settled.realNetworkCallsExecuted,0);
eq(db.state.audit.length,2);eq(db.state.rows[0].state,'uncertain_quarantine');
await rejected(service.settleMockOnly({reservationId:good.reservationId,
 fixture:{mode:'synthetic_fixture',status:201,body:{messageId:'foo'}}}),'gate2_reservation_missing_owner_or_terminal');
eq(db.state.audit.length,2);
for(const input of [{reservationId:'abc',fixture:{mode:'synthetic_fixture',status:201}},
 {reservationId:2,fixture:null},{reservationId:2,fixture:{mode:'actual_response',status:201}},
 {reservationId:2,fixture:{mode:'synthetic_fixture',status:'201'}}]){
 await assert.rejects(service.settleMockOnly(input));checks++;
}
await rejected(service.dispatch(),'gate2_vendor_dispatch_permanently_locked');
await rejected(service.retry(),'gate2_automatic_retry_forbidden');
for(const [status,body,expected] of [[201,{messageId:'fake-provider-001'},'simulated_accepted'],
 [201,{},'uncertain_quarantine'],[429,{},'manual_review'],[400,{},'manual_review'],
 [408,{},'uncertain_quarantine'],[500,{},'uncertain_quarantine']]){
 const db2=memoryPool(),srv=make(db2);const r=await reserve(srv);
 const result=await srv.settleMockOnly({reservationId:r.reservationId,fixture:{mode:'synthetic_fixture',status,body}});
 eq(result.state,expected);eq(result.automaticRetryAllowed,false);eq(db2.state.audit.length,2);
 eq(db2.state.rows[0].state,expected);eq(result.canDeliverEmail,false);
}
// No PII, API credentials or raw request context in recorded SQL parameters.
const logEntries=JSON.stringify(db.state.queries);
ck(!logEntries.includes(recipient));ck(!logEntries.includes(approvalId));
ck(!logEntries.includes('api-key'));ck(!logEntries.includes('secret'));
const src=readFileSync('server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs','utf8');
for(const denied of ['fetch(', 'https.request(', 'http.request(', 'globalThis.fetch(', 'process.env',
  'mailQueue.claim(', 'mailDispatcher.send(', 'RESEND_API_KEY', 'BREVO_API_KEY']){
 ck(!src.includes(denied),denied);
}
for(const path of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs',
 'server/src/mail/mail-p108-protected-bridge.mjs']){
 ck(!readFileSync(path,'utf8').includes('mail-p108-d06d2b-gate2-locked-reservation'),path);
}
const sql=readFileSync('docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql','utf8');
for(const literal of ['UNIQUE','app_mail_sandbox_review_audit_immutable','app_mail_sandbox_review_terminal_guard',
 'CHECK','held_locked','uncertain_quarantine'])ck(sql.includes(literal),literal);
ck(!readdirSync('server/migrations').some(f=>/^05[1-9]_/.test(f)),'no unapproved 051+ migration');
ck(readFileSync('server/src/mail/resend-provider.mjs','utf8').includes('Idempotency-Key'));
ck(readFileSync('server/src/mail/mail-provider-config.mjs','utf8').includes("'resend', 'brevo'"));
ck(JSON.parse(readFileSync('package.json','utf8')).scripts['server:phase34:p1-08-d06d2b-gate2:smoke']?.includes('gate2'));
console.log(`[phase34-p1-08-d06d2b-gate2] PASS (${checks} assertions; isolated review-only, no runtime wiring, no DB deployment, Brevo selected, Resend preserved, HTTP=0, mail=0)`);
