// G6: signed owner + server-only readiness + mock response. NO live I/O.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createG6SandboxReadiness, inspectG6SandboxReadiness,
 simulateG6BrevoFixture,G6_SANDBOX_READINESS_PATH,G6_VENDOR_NETWORK_LOCKED,
 G6_LIVE_MAIL_LOCKED} from '../../server/src/mail/mail-p108-g6-brevo-readiness.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const origin='https://mkrental.vercel.app';
const now=Math.floor(Date.now()/1000);
const jwtCfg={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
 clerkAuthorizedParties:[origin],clerkRejectPendingSession:true,clerkClockSkewSeconds:5};
let assertions=0,dbQueries=0,mockCalls=0;
function equal(x,y){assert.deepEqual(x,y); assertions++;}
function truth(x){assert.ok(x);assertions++;}
async function reject(f){await assert.rejects(f);assertions++;}
function claims(extra={}){return {sub:'user_G6OwnerSandbox0001',sid:'sess_g6_sandbox_01',azp:origin,
 iat:now-10,nbf:now-10,exp:now+150,sts:'active',fva:[0,0],
 reverification_id:'g6_sandbox_reverified_001',...extra};}
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function makeToken(claim){const part=b64({typ:'JWT',alg:'RS256'})+'.'+b64(claim);
 return part+'.'+sign('RSA-SHA256',Buffer.from(part),privateKey).toString('base64url');}
function req(c=claims(),method='GET'){return {method,headers:{authorization:'Bearer '+makeToken(c)}};}
let role='owner',status='active';
const adminSvc={async authorizeCurrent({clerkUserId}){dbQueries++;
 return {authority:'clerk-postgresql-session',admin:{clerkUserId,adminRole:role,
 status,clerkLinkState:'linked',lockUntil:null}};}};
const goodConfig={environment:'staging',provider:'brevo',enabled:true,
 sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
 apiKey:'test-key-MUST-NEVER-LEAK',liveSendingReady:false,allowlist:new Set(['sandbox@example.test']),
 dailyLimit:10,monthlyLimit:200};
let current=goodConfig;
const gate=createG6SandboxReadiness({config:jwtCfg,adminClerkAuthService:adminSvc,
 getServerMailConfig:()=>current});
const ready=await gate.check(req());
equal(ready.mode,'G6_STAGING_OWNER_READONLY_REVIEW');
equal(ready.syntheticPlanReady,true);
equal(ready.canInvokeBrevo,false);
equal(ready.canSendMail,false);
equal(ready.canApproveSandbox,false);
equal(ready.requiresExplicitOneTimeNetworkApproval,true);
equal(ready.independentBrevoSenderVerified,false);
equal(ready.operatorClaimedDomainVerified,true);
equal(ready.credentialPresent,true);
equal(ready.allowlistCount,1);
equal(ready.sandboxHeaderPlacement,'JSON_BODY_HEADERS');
equal(ready.sandboxHeaderValue,'drop');
equal(ready.blockers.length,0);
equal(ready.realVendorRequests,0);
equal(ready.realEmailsSent,0);
equal(ready.dbWrites,0);
equal(ready.outboxMutations,0);
const serialized=JSON.stringify(ready);
for(const fragment of [goodConfig.apiKey,'sandbox@example.test','user_G6OwnerSandbox0001','sess_g6_sandbox_01','reverification_id'])
 truth(!serialized.includes(fragment));
await reject(()=>gate.check({method:'GET',headers:{}}));
await reject(()=>gate.check(req(claims({azp:'https://attacker.invalid'}))));
await reject(()=>gate.check(req(claims({sts:'pending'}))));
await reject(()=>gate.check(req(claims({fva:[5,0]}))));
await reject(()=>gate.check(req(claims({reverification_id:null}))));
await reject(()=>gate.check(req(claims(),'POST')));
role='admin';await reject(()=>gate.check(req()));role='owner';
status='disabled';await reject(()=>gate.check(req()));status='active';
const changed=x=>inspectG6SandboxReadiness({...goodConfig,...x});
truth(changed({provider:'resend'}).blockers.includes('g6_brevo_provider_required'));
truth(changed({environment:'production'}).blockers.includes('g6_staging_required'));
truth(changed({enabled:false}).blockers.includes('g6_mail_config_disabled'));
truth(changed({apiKey:''}).blockers.includes('g6_api_key_missing'));
truth(changed({domainVerified:false}).blockers.includes('g6_domain_verification_claim_missing'));
truth(changed({sender:'test@example.test'}).blockers.includes('g6_sender_not_configured'));
truth(changed({allowlist:new Set()}).blockers.includes('g6_allowlist_1_to_5_required'));
truth(changed({allowlist:new Set(['a@example.test','b@example.test','c@example.test','d@example.test','e@example.test','f@example.test'])}).blockers.includes('g6_allowlist_1_to_5_required'));
truth(changed({allowlist:new Set(['wrong-address'])}).blockers.some(b=>b.includes('recipient_not_approved')));
truth(changed({liveSendingReady:true}).blockers.includes('g6_live_send_config_must_be_off'));
equal(changed({dailyLimit:300,monthlyLimit:9300}).syntheticPlanReady,true);
truth(changed({dailyLimit:0}).blockers.includes('offline_trial_limits_invalid'));
truth(changed({monthlyLimit:0}).blockers.includes('offline_trial_limits_invalid'));
equal(inspectG6SandboxReadiness(null).canInvokeBrevo,false);
current={...goodConfig,apiKey:''};equal((await gate.check(req())).syntheticPlanReady,false);
current=goodConfig;
await reject(()=>gate.dispatch());await reject(()=>gate.approve());await reject(()=>gate.retry());
await reject(()=>simulateG6BrevoFixture({config:goodConfig,recipient:'sandbox@example.test',mockTransport:()=>{throw new Error('must-not-call');}}));
const fixture=async call=>{mockCalls++;
 equal(call.endpoint,'https://api.brevo.com/v3/smtp/email');
 equal(call.method,'POST');
 equal(call.body.headers['X-Sib-Sandbox'],'drop');
 equal(call.body.to.length,1);
 equal(JSON.stringify(call).includes(goodConfig.apiKey),false);
 return {status:201,body:{messageId:'sandbox-id-test-001'}};
};fixture.isMock=true;
const success=await simulateG6BrevoFixture({config:goodConfig,recipient:'sandbox@example.test',mockTransport:fixture});
equal(success.syntheticAccepted,true);equal(success.vendorRequestsExecuted,0);
equal(success.realEmailsSent,0);equal(success.automaticRetryAllowed,false);
equal(success.outboxMutations,0);equal(mockCalls,1);
const rejectMock=async()=>({status:429,body:{}});rejectMock.isMock=true;
equal((await simulateG6BrevoFixture({config:goodConfig,recipient:'sandbox@example.test',mockTransport:rejectMock})).verdict,'rate_limited_manual_review');
const unknown=async()=>{throw new Error('offline timeout fixture');};unknown.isMock=true;
equal((await simulateG6BrevoFixture({config:goodConfig,recipient:'sandbox@example.test',mockTransport:unknown})).verdict,'uncertain_quarantine');
await reject(()=>simulateG6BrevoFixture({config:goodConfig,recipient:'not-authorized@example.test',mockTransport:fixture}));
assert.throws(()=>createG6SandboxReadiness({config:{...jwtCfg,appEnv:'production'},adminClerkAuthService:adminSvc,getServerMailConfig:()=>goodConfig}));assertions++;
equal(G6_SANDBOX_READINESS_PATH,'/api/admin/mail-delivery/g6-sandbox-readiness');
equal(G6_VENDOR_NETWORK_LOCKED,true);equal(G6_LIVE_MAIL_LOCKED,true);
truth(dbQueries>0);
const idx=readFileSync('server/src/index.mjs','utf8');
const app=readFileSync('server/src/app.mjs','utf8');
truth(idx.includes("process.env.P108_G6_SANDBOX_READINESS_ENABLED === 'true'"));
truth(app.includes("config.appEnv !== 'staging' || !g6SandboxReadiness"));
truth(app.includes("writeJson(response,405,{...basePayload,error:'method_not_allowed'}"));
truth(app.includes("writeJson(response,403,{...basePayload,error:'g6_owner_authorization_failed'}"));
truth(!idx.includes('G6_VENDOR_NETWORK_LOCKED=false'));
console.log(`[G6 SANDBOX READINESS] PASS (${assertions} assertions; mock calls ${mockCalls}; vendor 0; email 0; writes 0)`);
