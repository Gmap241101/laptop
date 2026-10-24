// D06-D2B-G3: isolated, synthetic-only settlement authorization regression.
// No PostgreSQL connection, Brevo/Resend network call, or email delivery.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createD06D2BGate2LockedRepository} from '../../server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs';
let assertions=0;
const same=(a,b)=>{assert.deepEqual(a,b);assertions++;};
const ok=(v,msg)=>{assert.ok(v,msg);assertions++;};
const throws=async(p,code)=>{await assert.rejects(p,e=>e?.code===code);assertions++;};
const sha=(s)=>createHash('sha256').update(s).digest('hex');
const approvalId='00000000-0000-4000-8000-000000000001';
const recipient='local-fixture@example.test';
const authority={adminAuth:{admin:{adminRole:'owner'}},auth:{userId:'user_TESTOWNER2026',
  factorVerificationAge:[0],reverificationId:'SyntheticReverifyValid00001',
  sessionId:'sessionSynthetic00001',issuedAt:1729000000,expiresAt:1729000300}};
const config={environment:'staging',provider:'brevo',enabled:true,
 sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,liveSendingReady:false,
 allowlist:new Set([recipient]),dailyLimit:1,monthlyLimit:1};
const evidence={verifiedByServer:true,stagingRegression8of8:true,
 outboxFiveReviewedReadOnly:true,backupIndependentlyVerified:true,
 sandboxOnlyExplicitApproval:true,approvalId,production:false};
const fixture={mode:'synthetic_fixture',status:201,body:{messageId:'only-synthetic-xyz'}};
const proof=(a)=>({actorId:a.auth.userId,sessionDigest:sha(`p108.session.v1:${a.auth.sessionId}`),
 reauthDigest:sha(`p108.reverify.v1:${a.auth.userId}:${a.auth.sessionId}:${a.auth.reverificationId}`)});
function pool({failOn}={}) {
 const state={reservations:[],audit:[],logs:[],nextId:1,rollbacks:0,commits:0,liveNetwork:0};
 let serial=Promise.resolve();
 return {state, async connect(){let unlock;const prev=serial;serial=new Promise(r=>unlock=r);await prev;
   let txRows=state.reservations.map(r=>({...r})), txAudit=state.audit.map(r=>({...r})), nextId=state.nextId;
   let finished=false;
   return {async query(query,args=[]){
     const q=query.trim();state.logs.push({query:q,args});
     if(failOn&&q.includes(failOn))throw new Error('forced_query_error');
     if(q==='BEGIN'||q.startsWith('SET LOCAL')||q.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
     if(q.startsWith('INSERT INTO app_mail_sandbox_review_reservations')){
       const [approval,actor,reauth,session,body]=args;
       if(txRows.some(x=>x.approval===approval||x.reauth===reauth))return {rows:[]};
       const id=String(nextId++);txRows.push({id,approval,actor,reauth,session,body,state:'held_locked'});
       return {rows:[{id}]};
     }
     if(q.startsWith('UPDATE app_mail_sandbox_review_reservations')){
       const [id,nextState,verdict,providerHash,actor,reauth,session]=args;
       const r=txRows.find(r=>r.id===id&&r.state==='held_locked'&&r.actor===actor&&r.reauth===reauth&&r.session===session);
       if(!r)return {rows:[]};
       Object.assign(r,{state:nextState,verdict,providerHash});
       return {rows:[{id:r.id,actor_clerk_user_id:r.actor,body_digest:r.body}]};
     }
     if(q.startsWith('INSERT INTO app_mail_sandbox_review_audit')){
       const [reservationId,event,actor,digest]=args;txAudit.push({reservationId,event,actor,digest});return {rows:[]};
     }
     if(q==='COMMIT'){state.reservations=txRows;state.audit=txAudit;state.nextId=nextId;state.commits++;finished=true;return {rows:[]};}
     if(q==='ROLLBACK'){state.rollbacks++;finished=true;return {rows:[]};}
     throw new Error('unexpected_sql:'+q);
   },release(){unlock();}};
 }};
}
function service(db,options={}) {
 return createD06D2BGate2LockedRepository(db,{
  verifyServerAuthority:async(ctx)=>options.authFn?options.authFn(ctx):(options.authority??authority),
  verifyIndependentEvidence:async()=>options.evidence??evidence,
  getServerMailConfig:async()=>options.config??config,
  verifySyntheticFixture:async(args)=>options.fixtureFn?options.fixtureFn(args):
   ({verifiedByServer:true,source:'trusted_offline_registry',reservationId:args.reservationId,
     provider:'brevo',mode:'synthetic_fixture',status:args.fixture.status,body:args.fixture.body}),
 });
}
async function reserve(s,options={}){return s.reserveReviewOnly({requestContext:{local:true},approvalId,recipient,...options});}
async function settle(s,id,options={}){return s.settleMockOnly({requestContext:{local:true},reservationId:id,fixture,...options});}
const baseline=pool(), svc=service(baseline), held=await reserve(svc);
same(held.state,'held_locked');same(held.canDeliverEmail,false);same(held.approvalGrantedForVendorCall,false);
const done=await settle(svc,held.reservationId);
same(done.state,'simulated_accepted');same(done.realNetworkCallsExecuted,0);same(done.canDeliverEmail,false);
same(baseline.state.reservations.length,1);same(baseline.state.audit.length,2);
same(baseline.state.commits,2);same(baseline.state.rollbacks,0);
const update=baseline.state.logs.find(e=>e.query.startsWith('UPDATE app_mail_sandbox_review_reservations'));
ok(update.query.includes('AND actor_clerk_user_id=$5'));
ok(update.query.includes('AND reauth_digest=$6'));
ok(update.query.includes('AND session_digest=$7'));
same(update.args[4],authority.auth.userId);same(update.args[5],proof(authority).reauthDigest);
same(update.args[6],proof(authority).sessionDigest);
await throws(settle(svc,held.reservationId),'gate2_reservation_missing_owner_or_terminal');
same(baseline.state.audit.length,2);
const differentAuthorities=[
 {...authority,auth:{...authority.auth,userId:'user_OTHERPERSON2026'}},
 {...authority,auth:{...authority.auth,sessionId:'anotherSessionSynthetic'}},
 {...authority,auth:{...authority.auth,reverificationId:'differentVerification123'}},
];
for(const other of differentAuthorities){
 const db=pool();const ownerService=service(db);const r=await reserve(ownerService);
 const otherService=service(db,{authority:other});
 await throws(settle(otherService,r.reservationId),'gate2_reservation_missing_owner_or_terminal');
 same(db.state.reservations[0].state,'held_locked');same(db.state.audit.length,1);same(db.state.rollbacks,1);
}
for(const auth of [null,{},
 {...authority,adminAuth:{admin:{adminRole:'admin'}}},
 {...authority,auth:{...authority.auth,factorVerificationAge:[10]}},
 {...authority,auth:{...authority.auth,reverificationId:'x'}},
]){
 const db=pool();const s=service(db);const r=await reserve(s);
 const other=service(db,{authFn:async()=>auth});
 await assert.rejects(settle(other,r.reservationId));assertions++;
 same(db.state.audit.length,1);same(db.state.reservations[0].state,'held_locked');
}
for(const result of [null,{},
 {verifiedByServer:false,source:'trusted_offline_registry',reservationId:'1',provider:'brevo',mode:'synthetic_fixture',status:201,body:fixture.body},
 {verifiedByServer:true,source:'operator_attestation',reservationId:'1',provider:'brevo',mode:'synthetic_fixture',status:201,body:fixture.body},
 {verifiedByServer:true,source:'trusted_offline_registry',reservationId:'999',provider:'brevo',mode:'synthetic_fixture',status:201,body:fixture.body},
 {verifiedByServer:true,source:'trusted_offline_registry',reservationId:'1',provider:'resend',mode:'synthetic_fixture',status:201,body:fixture.body},
 {verifiedByServer:true,source:'trusted_offline_registry',reservationId:'1',provider:'brevo',mode:'live_response',status:201,body:fixture.body},
 {verifiedByServer:true,source:'trusted_offline_registry',reservationId:'1',provider:'brevo',mode:'synthetic_fixture',status:429,body:fixture.body},
 {verifiedByServer:true,source:'trusted_offline_registry',reservationId:'1',provider:'brevo',mode:'synthetic_fixture',status:201,body:{messageId:'substituted'}},
 ]){
 const db=pool(),s=service(db);const r=await reserve(s);
 const forged=service(db,{fixtureFn:async()=>result});
 await throws(settle(forged,r.reservationId),'gate2_trusted_fixture_required');
 same(db.state.audit.length,1);same(db.state.reservations[0].state,'held_locked');
}
for(const invalid of [{mode:'actual_response',status:201,body:fixture.body},
 {mode:'synthetic_fixture',status:'201',body:fixture.body},
 {mode:'synthetic_fixture',status:201,body:fixture.body,liveTransport:true},
 {mode:'synthetic_fixture',status:201}, null]){
 const db=pool(),s=service(db),r=await reserve(s);
 await throws(settle(s,r.reservationId,{fixture:invalid}),'gate2_offline_fixture_required');
 same(db.state.reservations[0].state,'held_locked');
}
for(const status of [201,400,401,403,404,408,422,429,500,502,504]){
 const db=pool(),s=service(db),r=await reserve(s),res=await settle(s,r.reservationId,
 {fixture:{mode:'synthetic_fixture',status,body:status===201?{messageId:'synthetic-response'}:{}}});
 same(res.automaticRetryAllowed,false);same(res.approvalGrantedForVendorCall,false);
 same(res.realNetworkCallsExecuted,0);same(res.canDeliverEmail,false);
 same(db.state.audit.length,2);same(db.state.reservations.length,1);
}
const failing=pool({failOn:'INSERT INTO app_mail_sandbox_review_audit'}),brokenService=service(failing);
await assert.rejects(reserve(brokenService));assertions++;
same(failing.state.rollbacks,1);same(failing.state.reservations.length,0);
const safe=pool();const guarded=service(safe),row=await reserve(guarded);
const failedFixture=service(safe,{fixtureFn:async()=>{throw new Error('fixture_registry_unavailable')}});
await assert.rejects(settle(failedFixture,row.reservationId));assertions++;
same(safe.state.audit.length,1);same(safe.state.reservations[0].state,'held_locked');
const parallel=pool(),cs=service(parallel),rr=await reserve(cs);
const [a,b]=await Promise.allSettled([settle(cs,rr.reservationId),settle(cs,rr.reservationId)]);
same([a.status,b.status].sort(),['fulfilled','rejected']);same(parallel.state.audit.length,2);
same(parallel.state.reservations[0].state,'simulated_accepted');
for(const path of ['server/src/index.mjs','server/src/app.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs','server/src/mail/mail-p108-protected-bridge.mjs']){
 const text=readFileSync(path,'utf8');ok(!text.includes('mail-p108-d06d2b-gate2-locked-reservation.mjs'));
}
const source=readFileSync('server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs','utf8');
for(const bad of ['fetch(', 'globalThis.fetch(', 'http.request(', 'https.request(', 'process.env', 'RESEND_API_KEY', 'BREVO_API_KEY'])ok(!source.includes(bad));
ok(readFileSync('server/src/mail/mail-provider-config.mjs','utf8').includes("'resend', 'brevo'"));
ok(readFileSync('server/src/mail/resend-provider.mjs','utf8').includes('Idempotency-Key'));
ok(!readdirSync('server/migrations').some(n=>/^050[._-]/.test(n)));
for(const e of [...safe.state.logs,...baseline.state.logs]){
 const str=JSON.stringify(e.args);ok(!str.includes(recipient));ok(!str.includes(approvalId));
}
console.log(`[phase34-p1-08-d06d2b-gate3] PASS (${assertions} assertions; settlement owner and session bound, trusted fixtures, locked vendors, Brevo+Resend preserved)`);
