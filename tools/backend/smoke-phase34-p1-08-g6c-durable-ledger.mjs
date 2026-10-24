// G6-C durable SQL *contract* tests with deterministic mocked DB and signed
// Clerk tokens. No real PostgreSQL, Brevo, or Outbox calls.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createG6CHeldLockedLedger,G6C_DURABLE_REVIEW_VENDOR_LOCKED,
  G6C_DURABLE_REVIEW_SCHEMA_DEPLOYED} from '../../server/src/mail/mail-p108-g6c-durable-review-ledger.mjs';
let count=0;const ck=(v,m)=>{assert.ok(v,m);count++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++};
const deny=async(p,code)=>{await assert.rejects(p,e=>e?.code===code);count++};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicKeyPem=publicKey.export({type:'spki',format:'pem'});
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const jwt=(override={})=>{
 const head=b64({alg:'RS256',typ:'JWT'});
 const payload=b64({sub:'user_ABCDEFGHIJK',sid:'sess_test_one_123',sts:'active',
   iat:now-3,nbf:now-3,exp:now+300,azp:'https://mkrental.vercel.app',
   fva:[0,0],reverification_id:'reauthCodeOnce12345',...override});
 const content=`${head}.${payload}`;
 return `${content}.${sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url')}`;
};
const clerkJwtConfig={appEnv:'staging',clerkJwtKey:publicKeyPem,
 clerkAuthorizedParties:['https://mkrental.vercel.app'],clerkRejectPendingSession:true,
 clerkClockSkewSeconds:5};
const adminClerkAuthService={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
 admin:{clerkUserId,adminRole:'owner',status:'active',clerkLinkState:'linked',lockUntil:null}})};
const recipient='synthetic-allowlisted@example.test';
const getServerMailConfig=()=>({environment:'staging',provider:'brevo',enabled:false,
 liveSendingReady:false,sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
 apiKey:'SECRET-CANARY',allowlist:new Set([recipient]),dailyLimit:30,monthlyLimit:900});
const uuid='123e4567-e89b-42d3-a456-426614174000';
const request=token=>({method:'POST',headers:{authorization:`Bearer ${token}`}});
const createPool=({outboxState='queued',attemptCount=0,attempts=0,review='reviewed_locked',onInsert,throwSql}={})=>{
 const state={reservations:[],audits:[],log:[],nextId:1};let chain=Promise.resolve();
 return {state,async connect(){let unlock;const before=chain;chain=new Promise(r=>unlock=r);await before;
  let reservations=state.reservations.map(x=>({...x})),audits=state.audits.map(x=>({...x}));
  let nextId=state.nextId;
  return {async query(sql,args=[]){
   const s=sql.trim();state.log.push(s);
   if(throwSql?.(s))throw Object.assign(new Error('mock_db_failed'),{code:'XX001'});
   if(['BEGIN','COMMIT','ROLLBACK'].includes(s)){
    if(s==='COMMIT'){state.reservations=reservations;state.audits=audits;state.nextId=nextId;}
    return {rows:[]};
   }
   if(s.startsWith('SET LOCAL')||s.includes('pg_advisory_xact_lock'))return {rows:[]};
   if(s.startsWith('SELECT id,state,attempt_count'))return {rows:outboxState==='missing'?[]:
    [{id:'5',state:outboxState,attempt_count:attemptCount,lease_owner:null,lease_expires_at:null,provider_message_id:null}]};
   if(s.startsWith('SELECT COUNT(*)::integer'))return {rows:[{total:attempts}]};
   if(s.startsWith('SELECT review_result'))return {rows:review==='missing'?[]:[{review_result:review}]};
   if(s.startsWith('INSERT INTO app_mail_sandbox_review_reservations')){
    const [key,actor,reauth,session,body]=args;
    if(reservations.some(x=>x.key===key||x.reauth===reauth))return {rows:[]};
    const id=String(nextId++);reservations.push({id,key,actor,reauth,session,body});
    onInsert?.();return {rows:[{id}]};
   }
   if(s.startsWith('INSERT INTO app_mail_sandbox_review_audit')){
    audits.push({id:String(args[0]),actor:args[1],digest:args[2]});return {rows:[]};
   }
   throw Error('UNEXPECTED_SQL:'+s);
  },release(){unlock()}};
 }};
};
const goodEvidence=({approvalId,bodyDigest})=>({verifiedByServer:true,stagingOnly:true,
 backupVerified:true,brevoConsoleReviewed:true,explicitSandboxOnlyReview:true,
 approvalId,bodyDigest});
const create=(pool,options={})=>createG6CHeldLockedLedger({pool,
 clerkJwtConfig:{...clerkJwtConfig,...options.jwtConfig},
 adminClerkAuthService:options.admin||adminClerkAuthService,
 getServerMailConfig:options.config||getServerMailConfig,
 verifyIndependentEvidence:options.evidence||goodEvidence});
const reserve=(svc,token=jwt(),approval=uuid)=>svc.reserveHeldLocked({
 httpRequest:request(token),proposedApprovalId:approval});
eq(G6C_DURABLE_REVIEW_VENDOR_LOCKED,true);eq(G6C_DURABLE_REVIEW_SCHEMA_DEPLOYED,false);
const runtime=readFileSync('server/src/app.mjs','utf8')+readFileSync('server/src/index.mjs','utf8');
ck(!runtime.includes('mail-p108-g6c-durable-review-ledger.mjs'));
const source=readFileSync('server/src/mail/mail-p108-g6c-durable-review-ledger.mjs','utf8');
for(const unsafe of [/\bfetch\s*\(/,/https\.request\s*\(/,/\bprocess\.env\b/,/app_mail_outbox\s+SET/i])ck(!unsafe.test(source),'no transport or mutation');
ck(readFileSync('docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql','utf8').includes('NOT AN APPLIED MIGRATION'));
ck(!readFileSync('server/scripts/migrate.mjs','utf8').includes('DRAFT_NOT_DEPLOY'));
for(const bad of [{},{pool:{}},{clerkJwtConfig:{appEnv:'production'}}]){
 assert.throws(()=>createG6CHeldLockedLedger(bad),/g6c_staging_trusted_dependencies_required/);count++;
}
const pool=createPool(),svc=create(pool);
const settled=await reserve(svc);eq(settled.state,'held_locked');eq(settled.reviewOnly,true);
for(const field of ['canExecuteVendorRequest','canSendMail','canAutoRetry','canUseResendFallback','canModifyOutbox'])eq(settled[field],false);
eq(settled.networkRequests,0);eq(settled.realEmailsSent,0);
eq(pool.state.reservations.length,1);eq(pool.state.audits.length,1);
ck(pool.state.log.includes('BEGIN'));ck(pool.state.log.includes('COMMIT'));
ck(pool.state.log.some(q=>q.includes('advisory_xact_lock')));
ck(pool.state.log.some(q=>q.includes('ON CONFLICT DO NOTHING')));
for(const secret of ['SECRET-CANARY',recipient,uuid,'user_ABCDEFGHIJK'])ck(!JSON.stringify(settled).includes(secret));
await deny(reserve(svc),'g6c_review_replay_or_reauth_reused');
eq(pool.state.reservations.length,1);eq(pool.state.audits.length,1);
await deny(reserve(svc,jwt(),'not-uuid'),'g6c_review_uuid_invalid');
await deny(reserve(svc,jwt(), '00000000-0000-0000-0000-000000000000'),'g6c_review_uuid_invalid');
await deny(reserve(svc,jwt({fva:[5,0]})),'g5_recent_reauthentication_required');
await deny(reserve(svc,jwt({sts:'pending'})),'g5_clerk_jwt_verification_failed');
await deny(reserve(svc,jwt({azp:'https://attacker.example'})),'g5_clerk_jwt_verification_failed');
await deny(reserve(svc,jwt({exp:now-60})),'g5_clerk_jwt_verification_failed');
const forged=jwt();await deny(reserve(svc,forged.slice(0,-10)+'aaaaaaaaaa'),'g5_clerk_jwt_verification_failed');
const notOwner={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
 admin:{clerkUserId,adminRole:'admin',status:'active',clerkLinkState:'linked'}})};
await deny(reserve(create(createPool(),{admin:notOwner})),'g5_postgresql_owner_authorization_failed');
for(const config of [{enabled:true},{environment:'production'},{provider:'resend'},{allowlist:new Set()},{allowlist:new Set([recipient,'extra@example.test'])},{apiKey:''}]){
 const testPool=createPool();const service=create(testPool,{config:()=>({...getServerMailConfig(),...config})});
 await deny(reserve(service),'g6c_review_mail_safety_blocked');eq(testPool.state.log.length,0);
}
for(const [opt,code] of [[{outboxState:'failed'},'g6c_outbox_five_lock_invalid'],
 [{outboxState:'missing'},'g6c_outbox_five_lock_invalid'],
 [{attemptCount:1},'g6c_outbox_five_lock_invalid'],
 [{attempts:1},'g6c_outbox_five_attempts_detected'],
 [{review:'pending'},'g6c_preflight_not_reviewed_locked']]){
 const db=createPool(opt);await deny(reserve(create(db)),code);eq(db.state.reservations.length,0);eq(db.state.audits.length,0);
 ck(db.state.log.includes('ROLLBACK'));
}
for(const patch of [{verifiedByServer:false},{stagingOnly:false},{backupVerified:false},
 {brevoConsoleReviewed:false},{explicitSandboxOnlyReview:false},{approvalId:'wrong'},{bodyDigest:'wrong'}]){
 const db=createPool();const service=create(db,{evidence:args=>({...goodEvidence(args),...patch})});
 await deny(reserve(service),'g6c_independent_evidence_not_approved');eq(db.state.reservations.length,0);
}
const sqlFail=createPool({throwSql:s=>s.startsWith('INSERT INTO app_mail_sandbox_review_audit')});
await assert.rejects(reserve(create(sqlFail)));count++;eq(sqlFail.state.reservations.length,0);
eq(sqlFail.state.audits.length,0);ck(sqlFail.state.log.includes('ROLLBACK'));
const cpool=createPool(),parallel=create(cpool);
const pair=await Promise.allSettled([reserve(parallel),reserve(parallel)]);
eq(pair.filter(x=>x.status==='fulfilled').length,1);
eq(pair.filter(x=>x.status==='rejected').length,1);
eq(cpool.state.reservations.length,1);eq(cpool.state.audits.length,1);
for(const p of [svc.approveNetwork(),svc.dispatch(),svc.retry(),svc.changeOutbox()]){
 await assert.rejects(p);count++;
}
ck(!pool.state.log.some(sql=>/UPDATE\s+app_mail_outbox|DELETE\s+FROM\s+app_mail_outbox/i.test(sql)));
console.log(`[G6-C DURABLE HELD REVIEW CONTRACT] PASS ${count} assertions; mock DB only; vendor=0 emails=0; schema NOT DEPLOYED`);
