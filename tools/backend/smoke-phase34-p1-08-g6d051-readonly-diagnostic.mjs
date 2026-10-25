import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createG6D051ReadOnlyDiagnostic,evaluateG6D051ReadOnlyEvidence,
  G6D051_DIAGNOSTIC_PATH} from '../../server/src/mail/mail-p108-g6d051-readonly-diagnostic.mjs';
import {buildD06D2AOfflinePlan} from '../../server/src/mail/mail-p108-d06d2a-sandbox-gate.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++};
const ok=x=>{assert.ok(x);checks++};
const fail=async(f,status)=>{await assert.rejects(f,e=>e?.status===status);checks++};
const digest=x=>createHash('sha256').update(x).digest('hex');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const origin='https://mkrental.vercel.app';
const current=Math.floor(Date.now()/1000);
const config={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
  clerkAuthorizedParties:[origin],clerkRejectPendingSession:true,clerkClockSkewSeconds:5};
const actor='user_ReadOnlyOwner123';const sid='sess_readonly_4567';const fresh='new_verified_token_3456';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(payload={}){
 const p={sub:actor,sid,azp:origin,iat:current-1,nbf:current-1,exp:current+180,
  sts:'active',fva:[0,0],reverification_id:fresh,...payload};
 const joined=b64({alg:'RS256',typ:'JWT'})+'.'+b64(p);
 return joined+'.'+sign('RSA-SHA256',Buffer.from(joined),privateKey).toString('base64url');
}
const mail=()=>({environment:'staging',provider:'brevo',enabled:false,configured:true,
  liveSendingReady:false,sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
  apiKey:'fake_just_for_offline_test',allowlist:new Set(['offline@example.test']),
  dailyLimit:300,monthlyLimit:9300});
const email=mail();const {apiKey:_s,...without}=email;
const bodyDigest=buildD06D2AOfflinePlan({config:{...without,enabled:true,dailyLimit:30,monthlyLimit:900},
 recipient:[...email.allowlist][0]}).bodyDigest;
const proofDigest=digest(`p108.reverify.v1:${actor}:${sid}:${fresh}`);
const priorDigest=digest('different_earlier_reauth');
const baseEvidence=()=>({migrationCount:2,triggerCount:7,claimCount:0,
 outbox:{id:5,state:'cancelled',event_key:'admin_signup_pending',last_error_code:'mail_admin_opted_out',
  attempt_count:0,lease_owner:null,lease_expires_at:null,provider_message_id:null},optOutAuditCount:1,
 deliveryAttemptCount:0,latestReview:'reviewed_locked',held:{id:1,state:'held_locked',provider:'brevo',
 actor_clerk_user_id:actor,reauth_digest:priorDigest,body_digest:bodyDigest,
 verdict:null,settled_at:null,provider_id_digest:null},proof:{actorId:actor,verificationDigest:proofDigest},
 bodyDigest,mailSafe:true});
eq(evaluateG6D051ReadOnlyEvidence(baseEvidence()).readyForSeparateApproval,true);
for(const patch of [
 {claimCount:1},{triggerCount:6},{migrationCount:1},{optOutAuditCount:0},
 {deliveryAttemptCount:1},{latestReview:'anything_else'},{mailSafe:false},
 {held:{...baseEvidence().held,reauth_digest:proofDigest}},
 {held:{...baseEvidence().held,actor_clerk_user_id:'user_not_the_owner_123'}},
 {held:{...baseEvidence().held,body_digest:'incorrect_digest'}},
 {outbox:{...baseEvidence().outbox,last_error_code:'mail_owner_cancelled'}},
])eq(evaluateG6D051ReadOnlyEvidence({...baseEvidence(),...patch}).readyForSeparateApproval,false);
let writes=0,network=0,queries=[],role='owner';
const state={...baseEvidence(),failed:false};
const admin={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
 admin:{clerkUserId,adminRole:role,status:'active',clerkLinkState:'linked',lockUntil:null}})};
const fakePool={async connect(){return {async query(sql,params=[]){
 const query=sql.trim();queries.push(query);
 if(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(query)) {writes++;throw Error('WRITE FORBIDDEN');}
 if(query==='BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'||
    query==='ROLLBACK'||query.startsWith('SET LOCAL'))return {rows:[]};
 if(query.includes('FROM public.schema_migrations'))return {rows:[{total:state.migrationCount}]};
 if(query.includes('FROM pg_trigger'))return {rows:[{total:state.triggerCount}]};
 if(query.includes('FROM public.app_mail_sandbox_one_shot_claim'))return {rows:[{total:state.claimCount}]};
 if(query.includes('FROM public.app_mail_outbox'))return {rows:[{...state.outbox,
  recipient_email:'offline@example.test',updated_at:'2026-10-25T09:57:37Z'}]};
 if(query.includes('FROM public.app_admin_identity_registry'))return {rows:[{total:state.optOutAuditCount}]};
 if(query.includes('FROM public.app_mail_delivery_attempts'))return {rows:[{total:state.deliveryAttemptCount}]};
 if(query.includes('FROM public.app_mail_preflight_reviews'))return {rows:[{review_result:state.latestReview}]};
 if(query.includes('FROM public.app_mail_sandbox_review_reservations'))return {rows:[state.held]};
 throw Error('unknown fake SQL:'+query);
},release(){}};}};
const gate=createG6D051ReadOnlyDiagnostic({config,adminClerkAuthService:admin,pool:fakePool,
 getServerMailConfig:mail,now:()=>Date.now()});
const request=(jwt=token(),pathOrigin=origin)=>({method:'GET',headers:{origin:pathOrigin,authorization:'Bearer '+jwt}});
const accepted=await gate.check(request());
eq(G6D051_DIAGNOSTIC_PATH,'/api/admin/mail-delivery/g6d-one-shot-readonly-diagnostic');
eq(accepted.readyForSeparateApproval,true);eq(accepted.claimWrites,0);
eq(accepted.vendorRequests,0);eq(accepted.realEmailsSent,0);eq(accepted.outboxMutations,0);
ok(queries.some(q=>q.includes('REPEATABLE READ READ ONLY')));
ok(queries.every(q=>!q.includes('FOR UPDATE')&&!q.includes('FOR SHARE')));
eq(writes,0);eq(network,0);
// In a still-valid session a repeated reverification digest MUST block approval.
state.held={...state.held,reauth_digest:proofDigest};
const repeated=await gate.check(request());eq(repeated.readyForSeparateApproval,false);
eq(repeated.checks.reauthenticationDistinct,false);
state.held={...state.held,reauth_digest:priorDigest};state.claimCount=1;
const consumed=await gate.check(request());eq(consumed.readyForSeparateApproval,false);
eq(consumed.checks.claimUnused,false);state.claimCount=0;
await fail(()=>gate.check(request(token({fva:[6,0]}))),403);
await fail(()=>gate.check(request(token(), 'https://untrusted.example.test')),403);
role='admin';await fail(()=>gate.check(request()),403);role='owner';
await fail(()=>gate.check({...request(),method:'POST'}),405);
const routes=readFileSync('server/src/app.mjs','utf8');
ok(routes.includes('g6d051ReadOnlyDiagnostic.check(request)'));
const init=readFileSync('server/src/index.mjs','utf8');
ok(init.includes("P108_G6D_051_READONLY_DIAGNOSTIC_ENABLED === 'true'"));
const ui=readFileSync('src/admin/AdminMailNotificationsPanel.jsx','utf8');
ok(ui.includes('{g5Available&&<div'));
ok(ui.includes('getAdminG5Availability()'));
console.log(`[G6D051 READONLY DIAGNOSTIC MOCK] PASS ${checks} assertions; mocked RS256/PG, writes=0, vendor=0`);
// Verify the actual HTTP router stays default-OFF and GET-only, with no request
// body parsing, DB modifications, claim creation, or vendor transport.
{
 const {createServer}=await import('node:http');
 const {createRequestHandler}=await import('../../server/src/app.mjs');
 let called=0;
 const diagnostic={async check(request){called++;eq(request.method,'GET');return accepted}};
 const fakeServices=new Proxy({},{get:()=>async()=>({})});
 const services=Object.fromEntries(['userIdentityService','firebaseLinkService','memberAuthorityService',
  'adminClerkAuthService','accountRecoveryService','accountLifecycleService','systemConfigService',
  'systemDataService','rentalRestrictionService','rentalRequestService','rentalRequestWriteService',
  'rentalRequestUserActionService','adminRentalRequestService','assetService','siteContentService',
  'boardService','inquiryService','secureAttachmentService'].map(k=>[k,fakeServices]));
 const settings={authenticateRequest:async()=>({}),...services,config:{appEnv:'staging',serviceName:'qa',serviceVersion:'readonly',
   corsAllowedOrigins:[origin]},databaseCheck:async()=>({latencyMs:0})};
 async function serve(handler,method){
  const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {return await fetch(`http://127.0.0.1:${server.address().port}${G6D051_DIAGNOSTIC_PATH}`,
    {method,headers:{origin}});}
  finally{await new Promise(resolve=>server.close(resolve));}
 }
 const {response}={response:await serve(createRequestHandler({...settings,g6d051ReadOnlyDiagnostic:diagnostic}),'GET')};
 eq(response.status,200);eq((await response.json()).g6dReadOnlyDiagnostic.readOnly,true);eq(called,1);
 const method=await serve(createRequestHandler({...settings,g6d051ReadOnlyDiagnostic:diagnostic}),'POST');
 eq(method.status,405);eq(called,1);
 const disabled=await serve(createRequestHandler(settings),'GET');
 eq(disabled.status,404);eq(called,1);
}
console.log(`[G6D051 READONLY HTTP ROUTE] PASS ${checks} total assertions; localhost-only; provider calls=0`);
