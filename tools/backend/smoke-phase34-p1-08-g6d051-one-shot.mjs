// Phase34 G6-D offline isolated fake DB & fake transport. NO actual provider,
// database, secret, web request, SMTP or production context is touched.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createG6D051BrevoOneShot,G6D051_CHECKSUM,G6D051_PATH}
 from '../../server/src/mail/mail-p108-g6d051-brevo-one-shot.mjs';
import {G6C_050_CHECKSUM} from '../../server/src/mail/mail-p108-g6c-postmigration-readonly.mjs';
let assertions=0;const eq=(a,b)=>{assert.deepEqual(a,b);assertions++};
const ok=x=>{assert.ok(x);assertions++};
const fails=async(f,status)=>{await assert.rejects(f,e=>e?.status===status);assertions++};
const sha=x=>createHash('sha256').update(x).digest('hex');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const origin='https://mkrental.vercel.app';
const now=()=>Date.now();const current=Math.floor(now()/1000);
const approvalTicket='cb744376-3f91-4c9c-80ca-e26923f7f095';
const approvalDigest=sha('phase34.g6d.sandbox.one_shot.v1:'+approvalTicket);
const config={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
 clerkAuthorizedParties:[origin],clerkRejectPendingSession:true,clerkClockSkewSeconds:5};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(changes={}){
 const payload={sub:'user_HeldOwner1234',sid:'sess_held_123456789',azp:origin,
  iat:current-2,nbf:current-2,exp:current+120,sts:'active',fva:[0,0],
  reverification_id:'new_review_123456',...changes};
 const joined=b64({alg:'RS256',typ:'JWT'})+'.'+b64(payload);
 return joined+'.'+sign('RSA-SHA256',Buffer.from(joined),privateKey).toString('base64url');
}
const request=(token=jwt())=>({method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+token}});
const body={reservationId:1,approvalTicket,confirmSandboxDrop:true,operatorAttestsBrevoControlPlaneReviewed:true};
const mail=()=>({environment:'staging',provider:'brevo',enabled:false,configured:true,
 liveSendingReady:false,sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
 apiKey:'FAKE_SERVER_SIDE_ONLY',allowlist:new Set(['offline-fixture@example.test']),
 dailyLimit:300,monthlyLimit:9300});
let role='owner';
const admin={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
 admin:{clerkUserId,adminRole:role,status:'active',clerkLinkState:'linked',lockUntil:null}})};
const createState=()=>({claims:[],settlement:null,audits:[],outboxState:'queued',
 preflight:'reviewed_locked',triggers:7,migrations:2,attempts:0,
 heldOwner:'user_HeldOwner1234',failedSql:'',statements:[],rollbacks:0,commits:0});
function fakePool(state){let q=Promise.resolve();return {state,async connect(){
 let unlock;const prev=q;q=new Promise(resolve=>{unlock=resolve});await prev;
 let working={claims:[...state.claims],audits:[...state.audits],settlement:state.settlement};
 return {async query(sql,params=[]){
  const s=sql.trim();state.statements.push(s);
  if(state.failedSql&&s.includes(state.failedSql))throw Error('fake sql error');
  if(s==='BEGIN'||s.startsWith('SET LOCAL'))return {rows:[]};
  if(s==='ROLLBACK'){state.rollbacks++;return {rows:[]};}
  if(s==='COMMIT'){state.claims=working.claims;state.audits=working.audits;
    state.settlement=working.settlement;state.commits++;return {rows:[]};}
  if(s.includes('FROM public.schema_migrations')){
    eq(params[0],'050_phase34_p1_08_mail_sandbox_review_ledger.sql');eq(params[1],G6C_050_CHECKSUM);
    eq(params[2],'051_phase34_p1_08_brevo_sandbox_one_shot_claim.sql');eq(params[3],G6D051_CHECKSUM);
    return {rows:[{total:state.migrations}]};}
  if(s.includes('FROM pg_trigger'))return {rows:[{total:state.triggers}]};
  if(s.includes('FROM public.app_mail_outbox'))return {rows:[{id:5,state:state.outboxState,
    attempt_count:0,lease_owner:null,lease_expires_at:null,provider_message_id:null}]};
  if(s.includes('FROM public.app_mail_delivery_attempts'))return {rows:[{total:state.attempts}]};
  if(s.includes('FROM public.app_mail_preflight_reviews'))return {rows:[{review_result:state.preflight}]};
  if(s.includes('FROM public.app_mail_sandbox_one_shot_claim')&&s.startsWith('SELECT'))
    return {rows:working.claims.length?[{singleton_id:1}]:[]};
  if(s.includes('FROM public.app_mail_sandbox_review_reservations')&&s.startsWith('SELECT')){
    return {rows:working.settlement?[]:[{id:1,state:'held_locked',provider:'brevo',
      actor_clerk_user_id:state.heldOwner,reauth_digest:sha('prior_reauth'),
      body_digest:sha('unused'),verdict:null,settled_at:null,provider_id_digest:null}]};
  }
  if(s.startsWith('INSERT INTO public.app_mail_sandbox_one_shot_claim')){
    if(working.claims.length)return {rows:[]};
    working.claims.push({actor:params[0],approval:params[1],body:params[2]});
    return {rows:[{singleton_id:1}]};}
  if(s.startsWith('UPDATE public.app_mail_sandbox_review_reservations')){
    if(working.settlement)return {rows:[]};
    working.settlement={state:params[0],verdict:params[1],providerDigest:params[2]};
    return {rows:[{id:1}]};}
  if(s.startsWith('INSERT INTO public.app_mail_sandbox_review_audit')){
    working.audits.push({state:params[0],actor:params[1],body:params[2]});return {rows:[]};}
  throw Error('unexpected fake SQL:'+s);
 },release(){unlock()}};
 }};
}
// Need the actual SHA-256 digest of the *same locked synthetic offline payload*
// as the held reservation. Compute through the frozen offline builder.
const {buildD06D2AOfflinePlan}=await import('../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs');
const m=mail();const {apiKey:_key,...offline}=m;
const plan=buildD06D2AOfflinePlan({config:{...offline,enabled:true,dailyLimit:30,monthlyLimit:900},recipient:[...m.allowlist][0]});
const actualDigest=plan.bodyDigest;
// fake DB reservation query emits body digest from fixed fixture: override by
// wrapping held query as necessary, without using the real PostgreSQL.
function fixedPool(state){
 const original=fakePool(state);
 return {state,async connect(){const db=await original.connect();const base=db.query.bind(db);
   return {...db,async query(sql,params){const result=await base(sql,params);
     if(sql.trim().startsWith('SELECT id,state,provider,actor_clerk_user_id')){
       if(result.rows[0])result.rows[0].body_digest=actualDigest;
     }return result;}};
 }};
}
function make(state,transport,{mailPatch={},configPatch={},expire=current+300,ticket=approvalDigest}={}){
 const pool=fixedPool(state);let invoked=0;
 const mockedFetch=async(...args)=>{invoked++;return transport(...args)};
 const api=createG6D051BrevoOneShot({config:{...config,...configPatch},
  adminClerkAuthService:admin,pool,getServerMailConfig:()=>({...mail(),...mailPatch}),
  approvalDigest:ticket,approvalExpiresAt:expire,fetchImpl:mockedFetch,now});
 return {api,getCalls:()=>invoked};
}
const reply=(status,data)=>({status,async text(){return JSON.stringify(data)}});
const providerId='<fake-sandbox.20261024@local.invalid>';
const successMock=async(url,options)=>{
 eq(url,'https://api.brevo.com/v3/smtp/email');eq(options.method,'POST');
 eq(options.redirect,'error');eq(options.headers['api-key'],'FAKE_SERVER_SIDE_ONLY');
 ok(typeof options.signal?.aborted==='boolean');
 const payload=JSON.parse(options.body);eq(payload.headers,{'X-Sib-Sandbox':'drop'});
 eq(payload.to,[{email:'offline-fixture@example.test'}]);
 ok(!Object.hasOwn(options.headers,'X-Sib-Sandbox'));
 return reply(201,{messageId:providerId});
};
const run=(api,token=jwt(),requestBody=body)=>api.execute({httpRequest:request(token),body:requestBody});
eq(G6D051_PATH,'/api/admin/mail-delivery/g6d-brevo-sandbox-one-shot');
const migration=readFileSync('server/migrations/051_phase34_p1_08_brevo_sandbox_one_shot_claim.sql');
eq(sha(migration),G6D051_CHECKSUM);
ok(migration.toString().includes('singleton_id = 1'));
ok(migration.toString().includes('app_mail_sandbox_one_shot_claim_no_truncate'));
const appSource=readFileSync('server/src/app.mjs','utf8');
ok(appSource.includes('g6d051SandboxOneShot.execute({httpRequest:request,body:input})'));
const indexSource=readFileSync('server/src/index.mjs','utf8');
ok(indexSource.includes("process.env.P108_G6D_051_NETWORK_ENABLED === 'true'"));
ok(indexSource.includes('P108_G6D_051_APPROVAL_DIGEST'));
const s=createState(),instance=make(s,successMock);
const accepted=await run(instance.api);
eq(accepted.state,'simulated_accepted');eq(accepted.verdict,'sandbox_simulated_acceptance');
eq(accepted.providerIdDigest,sha(providerId));eq(accepted.canRetry,false);
eq(accepted.canSendMail,false);eq(accepted.canUseResendFallback,false);
eq(accepted.providerCallsAttempted,1);eq(accepted.realEmailsSent,0);
eq(s.claims.length,1);eq(s.audits.length,1);eq(s.settlement.state,'simulated_accepted');
eq(s.commits,2);eq(instance.getCalls(),1);
await fails(()=>run(instance.api),409);eq(instance.getCalls(),1);eq(s.claims.length,1);
for(const [status,expectedState,expectedVerdict] of [
 [429,'manual_review','rate_limited_manual_review'],
 [401,'manual_review','rejected_manual_review'],
 [503,'uncertain_quarantine','uncertain_quarantine'],
]){
 const st=createState(),gate=make(st,async()=>reply(status,{}));
 const result=await run(gate.api);
 eq(result.state,expectedState);eq(result.verdict,expectedVerdict);
 eq(gate.getCalls(),1);eq(st.claims.length,1);eq(st.audits.length,1);
 await fails(()=>run(gate.api),409);eq(gate.getCalls(),1);
}
const timeoutState=createState(),timed=make(timeoutState,async()=>{throw Error('synthetic timeout')});
const quarantined=await run(timed.api);
eq(quarantined.state,'uncertain_quarantine');eq(timeoutState.claims.length,1);
eq(timed.getCalls(),1);await fails(()=>run(timed.api),409);
const crashState=createState();crashState.failedSql='UPDATE public.app_mail_sandbox_review_reservations';
const crash=make(crashState,successMock);
await fails(()=>run(crash.api),503);eq(crash.getCalls(),1);
eq(crashState.claims.length,1);eq(crashState.audits.length,0);
crashState.failedSql='';await fails(()=>run(crash.api),409);eq(crash.getCalls(),1);
for(const [bad,code] of [
 [{...body,reservationId:2},400],
 [{...body,confirmSandboxDrop:false},400],
 [{...body,recipient:'intruder@example.invalid'},400],
 [{...body,approvalTicket:'not-a-uuid'},400],
 [{...body,operatorAttestsBrevoControlPlaneReviewed:false},400],
]){const state=createState(),x=make(state,successMock);await fails(()=>run(x.api,jwt(),bad),code);
 eq(x.getCalls(),0);eq(state.claims.length,0);}
for(const [patch,code] of [
 [{enabled:true},403],[{provider:'resend'},403],[{liveSendingReady:true},403],
 [{allowlist:new Set()},403],[{apiKey:''},403],
]){const state=createState(),x=make(state,successMock,{mailPatch:patch});
 await fails(()=>run(x.api),code);eq(x.getCalls(),0);}
for(const [patch,code] of [[{sts:'pending'},403],[{fva:[9,0]},403],[{azp:'https://example.invalid'},403]]){
 const st=createState(),x=make(st,successMock);await fails(()=>run(x.api,jwt(patch)),code);
 eq(x.getCalls(),0);}
role='admin';{const st=createState(),x=make(st,successMock);await fails(()=>run(x.api),403);eq(x.getCalls(),0);}role='owner';
for(const [patch,status] of [
 [{preflight:'not_reviewed'},403],[{outboxState:'sent'},403],
 [{attempts:1},403],[{migrations:1},503],[{triggers:6},503],
 [{heldOwner:'user_OtherPerson999'},403],
]){const st=Object.assign(createState(),patch),x=make(st,successMock);
 await fails(()=>run(x.api),status);eq(x.getCalls(),0);eq(st.claims.length,0);}
for(const options of [{expire:current-1},{expire:current+900},{ticket:sha('different')}]){
 const st=createState(),x=make(st,successMock,options);await fails(()=>run(x.api),403);
 eq(x.getCalls(),0);eq(st.claims.length,0);}
const a=createState(),competition=make(a,successMock);
const raced=await Promise.allSettled([run(competition.api),run(competition.api)]);
eq(raced.filter(x=>x.status==='fulfilled').length,1);
eq(raced.filter(x=>x.status==='rejected'&&x.reason?.status===409).length,1);
eq(competition.getCalls(),1);eq(a.claims.length,1);
await fails(()=>competition.api.retry(),403);
await fails(()=>competition.api.sendLive(),403);
console.log(`[G6D051 ONE-SHOT OFFLINE CONTRACT] PASS ${assertions} assertions; fake PG + fake Brevo only; no network or real DB`);
// Actual Node HTTP handler routing, with mock sandbox service; localhost only.
{
 const {createServer}=await import('node:http');
 const {createRequestHandler}=await import('../../server/src/app.mjs');
 let simulatedCalls=0;
 const fakeApi={async execute({body:requestBody}){simulatedCalls++;eq(requestBody.reservationId,1);
   return {claimConsumed:true,verdict:'sandbox_simulated_acceptance',realEmailsSent:0}}};
 const service=new Proxy({}, {get:()=>async()=>({})});
 const required={authenticateRequest:async()=>({}),
  ...Object.fromEntries(['userIdentityService','firebaseLinkService','memberAuthorityService',
  'adminClerkAuthService','accountRecoveryService','accountLifecycleService','systemConfigService',
  'systemDataService','rentalRestrictionService','rentalRequestService','rentalRequestWriteService',
  'rentalRequestUserActionService','adminRentalRequestService','assetService','siteContentService',
  'boardService','inquiryService','secureAttachmentService'].map(k=>[k,service]))};
 const handler=createRequestHandler({...required,config:{appEnv:'staging',serviceName:'qa',
   serviceVersion:'g6d051',corsAllowedOrigins:[origin]},
   databaseCheck:async()=>({latencyMs:0}),g6d051SandboxOneShot:fakeApi});
 const srv=createServer(handler);await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${srv.address().port}${G6D051_PATH}`;
 try{
  const get=await fetch(base,{method:'GET'});eq(get.status,405);
  const bad=await fetch(base,{method:'POST',headers:{origin,'content-type':'application/json'},body:'notjson'});
  eq(bad.status,400);eq(simulatedCalls,0);
  const good=await fetch(base,{method:'POST',headers:{origin,'content-type':'application/json'},
    body:JSON.stringify(body)});eq(good.status,200);
  const output=await good.json();eq(output.g6dSandboxOneShot.claimConsumed,true);eq(simulatedCalls,1);
 }finally{await new Promise(resolve=>srv.close(resolve));}
 const disabled=createServer(createRequestHandler({...required,config:{appEnv:'staging',serviceName:'qa',
   serviceVersion:'g6d051',corsAllowedOrigins:[origin]},databaseCheck:async()=>({latencyMs:0})}));
 await new Promise(resolve=>disabled.listen(0,'127.0.0.1',resolve));
 try{const r=await fetch(`http://127.0.0.1:${disabled.address().port}${G6D051_PATH}`,
  {method:'POST',headers:{'content-type':'application/json'},body:'{}'});eq(r.status,404);}
 finally{await new Promise(resolve=>disabled.close(resolve));}
}
console.log(`[G6D051 HTTP ROUTER MOCK] PASS ${assertions} total assertions; HTTP localhost only, no vendor or live DB`);
