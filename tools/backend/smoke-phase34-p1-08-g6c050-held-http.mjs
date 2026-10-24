// G6-C default-OFF held-only write tests. Real RS256 tokens, mocked SQL.
// No network, vendor call, actual mail, Heroku, or physical DB connection.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createG6C050HeldReservationApi,G6C050_HELD_PATH,G6C050_HELD_PROVIDER_NETWORK_LOCKED}
 from '../../server/src/mail/mail-p108-g6c050-held-reservation-api.mjs';
import {G6C_050_CHECKSUM} from '../../server/src/mail/mail-p108-g6c-postmigration-readonly.mjs';
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++};
const ok=x=>{assert.ok(x);n++};
const fail=async(fn,status)=>{await assert.rejects(fn,e=>e?.status===status);n++};
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const origin='https://mkrental.vercel.app';
const config={appEnv:'staging',clerkJwtKey:publicKey.export({format:'pem',type:'spki'}),
 clerkAuthorizedParties:[origin],clerkRejectPendingSession:true,clerkClockSkewSeconds:5};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const ts=Math.floor(Date.now()/1000);
function token(patch={}){
 const payload={sub:'user_HeldOwner1234',sid:'sess_held_123456789',azp:origin,
  iat:ts-3,nbf:ts-3,exp:ts+130,sts:'active',fva:[0,0],
  reverification_id:'recent_reverify_12345',...patch};
 const content=b64({alg:'RS256',typ:'JWT'})+'.'+b64(payload);
 return content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
}
function request(jwt=token(),other={}){return {method:'POST',headers:{authorization:'Bearer '+jwt,
 origin,'content-type':'application/json',...other}};}
const id='123e4567-e89b-42d3-a456-426614174000';
const body={approvalId:id,confirmHeldOnly:true};
const recipient='synthetic-allowlisted@example.test';
const mail=()=>({environment:'staging',provider:'brevo',enabled:false,
 liveSendingReady:false,sender:'noreply@mail.notebook.recruit.kro.kr',
 configured:true,domainVerified:true,apiKey:'SECRET_SENTINEL',
 allowlist:new Set([recipient]),dailyLimit:30,monthlyLimit:900});
let role='owner';
const admins={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
 admin:{clerkUserId,adminRole:role,status:'active',clerkLinkState:'linked',lockUntil:null}})};
function fakePool({outboxState='queued',attempts=0,preflight='reviewed_locked',
 triggers=5,migration=1,sqlFail='',slow=false}={}){
 const state={reservations:[],audits:[],statements:[],nextId:1,commits:0,rollbacks:0};
 let queue=Promise.resolve();
 return {state,async connect(){let unlock;const before=queue;
 queue=new Promise(resolve=>unlock=resolve);await before;
 const reservation=state.reservations.map(x=>({...x}));
 const audit=state.audits.map(x=>({...x}));let nextId=state.nextId;
 return {async query(sql,params=[]){
  state.statements.push(sql); const s=sql.trim();
  if(sqlFail && s.includes(sqlFail))throw Error('synthetic pg failure');
  if(s==='BEGIN'||s.startsWith('SET LOCAL')||s.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(s==='ROLLBACK'){state.rollbacks++;return {rows:[]};}
  if(s==='COMMIT'){state.reservations=reservation;state.audits=audit;state.nextId=nextId;
   state.commits++;return {rows:[]};}
  if(s.includes('FROM public.schema_migrations')){
   eq(params[0],'050_phase34_p1_08_mail_sandbox_review_ledger.sql');
   eq(params[1],G6C_050_CHECKSUM);return {rows:[{total:migration}]};
  }
  if(s.includes('FROM pg_trigger'))return {rows:[{total:triggers}]};
  if(s.includes('FROM public.app_mail_outbox'))return {rows:outboxState==='missing'?[]:
   [{id:5,state:outboxState,attempt_count:0,lease_owner:null,
      lease_expires_at:null,provider_message_id:null}]};
  if(s.includes('FROM public.app_mail_delivery_attempts'))return {rows:[{total:attempts}]};
  if(s.includes('FROM public.app_mail_preflight_reviews'))return {rows:[{review_result:preflight}]};
  if(s.startsWith('INSERT INTO public.app_mail_sandbox_review_reservations')){
   if(slow)await new Promise(r=>setTimeout(r,2));
   const [approval,actor,reauth,session,digest]=params;
   if(reservation.some(x=>x.approval===approval||x.reauth===reauth))return {rows:[]};
   const newId=nextId++;reservation.push({id:newId,approval,actor,reauth,session,digest});
   return {rows:[{id:newId}]};
  }
  if(s.startsWith('INSERT INTO public.app_mail_sandbox_review_audit')){
   audit.push({id:params[0],actor:params[1],digest:params[2]});return {rows:[]};
  }
  throw Error('UNEXPECTED_SQL:'+s);
 },release(){unlock()}};
 }};
}
const make=(pool,configPatch={},mailPatch={})=>createG6C050HeldReservationApi({
 config:{...config,...configPatch},adminClerkAuthService:admins,pool,
 getServerMailConfig:()=>({...mail(),...mailPatch})});
const run=(api,auth=token(),payload=body,headers={})=>api.reserve({
 httpRequest:request(auth,headers),body:payload});
eq(G6C050_HELD_PATH,'/api/admin/mail-delivery/g6c-held-reservations');
eq(G6C050_HELD_PROVIDER_NETWORK_LOCKED,true);
const app=readFileSync('server/src/app.mjs','utf8');
const index=readFileSync('server/src/index.mjs','utf8');
const sql=readFileSync('server/migrations/050_phase34_p1_08_mail_sandbox_review_ledger.sql','utf8');
ok(app.includes('g6c050HeldReservationApi.reserve({httpRequest:request,body:input})'));
ok(app.includes("url.pathname === '/api/admin/mail-delivery/g6c-held-reservations'"));
ok(app.includes('readJsonBody(request,{maxBytes:512})'));
ok(app.includes('writeJson(response,201'));
ok(index.includes("process.env.P108_G6C_050_HELD_WRITE_ENABLED === 'true'"));
ok(!index.includes('g6c050HeldReservationApi = createG6C050HeldReservationApi('));
ok(sql.includes('app_mail_sandbox_review_audit_immutable_trigger'));
const source=readFileSync('server/src/mail/mail-p108-g6c050-held-reservation-api.mjs','utf8');
for(const re of [/\bfetch\s*\(/,/https\.request\s*\(/,/\bBREVO_API_KEY\b/,/UPDATE\s+public\.app_mail_outbox/i])ok(!re.test(source));
for(const dep of [{},{config:{appEnv:'production'}},{config,adminClerkAuthService:admins,pool:{}}]){
 assert.throws(()=>createG6C050HeldReservationApi(dep));n++;
}
const db=fakePool();const api=make(db);
const success=await run(api);eq(success.state,'held_locked');eq(success.schema050Verified,true);
eq(success.reviewOnly,true);eq(success.canInvokeBrevo,false);eq(success.canSendMail,false);
eq(success.canApprove,false);eq(success.canRetry,false);eq(success.dbWrites,2);
eq(success.networkRequests,0);eq(success.realEmailsSent,0);
eq(db.state.reservations.length,1);eq(db.state.audits.length,1);eq(db.state.commits,1);
eq(db.state.rollbacks,0);
for(const s of ['SECRET_SENTINEL',recipient,id,'user_HeldOwner1234','Bearer'])
 ok(!JSON.stringify(success).includes(s));
ok(db.state.statements.includes('BEGIN'));
ok(db.state.statements.includes('COMMIT'));
ok(db.state.statements.some(q=>q.includes('ON CONFLICT DO NOTHING RETURNING id')));
ok(!db.state.statements.some(q=>/UPDATE\s+public\.app_mail_outbox/i.test(q)));
await fail(()=>run(api),409);eq(db.state.reservations.length,1);eq(db.state.audits.length,1);
for(const bad of [null,{},[],{approvalId:id},{approvalId:id,confirmHeldOnly:false},
 {approvalId:id,confirmHeldOnly:true,recipient},{approvalId:'bad',confirmHeldOnly:true},
 {approvalId:'00000000-0000-0000-0000-000000000000',confirmHeldOnly:true}]){
 await fail(()=>run(make(fakePool()),token(),bad),400);
}
await fail(()=>run(make(fakePool()),token(),body,{origin:'https://attacker.invalid'}),403);
await fail(()=>run(make(fakePool()),token(),body,{'content-type':'text/plain'}),415);
await fail(()=>run(make(fakePool()),token({fva:[5,0]})),403);
await fail(()=>run(make(fakePool()),token({sts:'pending'})),403);
await fail(()=>run(make(fakePool()),token({azp:'https://attacker.invalid'})),403);
await fail(()=>run(make(fakePool()),token({exp:ts-10})),403);
const forged=token();await fail(()=>run(make(fakePool()),forged.slice(0,-4)+'zzzz'),403);
role='admin';await fail(()=>run(make(fakePool())),403);role='owner';
for(const mp of [{enabled:true},{provider:'resend'},{environment:'production'},
 {domainVerified:false},{configured:false},{allowlist:new Set()},
 {allowlist:new Set([recipient,'other@invalid.test'])},{apiKey:''}]){
 const p=fakePool();await fail(()=>run(make(p,{},mp)),403);eq(p.state.statements.length,0);
}
for(const [options,status] of [[{migration:0},503],[{triggers:4},503],
 [{outboxState:'missing'},403],[{outboxState:'sent'},403],
 [{attempts:1},403],[{preflight:'unreviewed'},403],
 [{sqlFail:'INSERT INTO public.app_mail_sandbox_review_audit'},503]]){
 const p=fakePool(options);await fail(()=>run(make(p)),status);
 eq(p.state.commits,0);eq(p.state.reservations.length,0);eq(p.state.audits.length,0);
 eq(p.state.rollbacks,1);
}
const pool=fakePool({slow:true}),concurrent=make(pool);
const responses=await Promise.allSettled([run(concurrent),run(concurrent)]);
eq(responses.filter(x=>x.status==='fulfilled').length,1);
eq(responses.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
eq(pool.state.reservations.length,1);eq(pool.state.audits.length,1);
for(const method of ['dispatch','approveNetwork','retry'])await fail(()=>concurrent[method](),403);
console.log(`[G6C050 HELD HTTP MOCK CONTRACT] PASS ${n} assertions; RS256 + server PG gate; no vendor, mail, or live DB`);
