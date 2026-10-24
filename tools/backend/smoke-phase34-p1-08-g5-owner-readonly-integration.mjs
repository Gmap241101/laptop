// G5 real signed JWT and PostgreSQL-authority contract, synthetic in-memory
// admin record; no cloud access, no real JWTs, no network, no outgoing emails.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createG5OwnerReadOnlyAcceptance, G5_READONLY_CHECK_PATH } from '../../server/src/mail/mail-p108-g5-owner-readonly-acceptance.mjs';
let count=0;
const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
const ok=(a)=>{assert.ok(a);count++;};
const rejects=async(fn)=>{await assert.rejects(fn);count++;};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const azp='https://mkrental.vercel.app';
const now=Math.floor(Date.now()/1000);
const cfg={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
 clerkAuthorizedParties:[azp],clerkRejectPendingSession:true,clerkClockSkewSeconds:0};
const claim={sub:'user_G5ReadonlyOwner0001',sid:'sess_g5_readonly_01',azp,
 iat:now-10,nbf:now-10,exp:now+200,sts:'active',fva:[0,0],reverification_id:'g5_readonly_approved_0001'};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=p=>{const raw=b64({typ:'JWT',alg:'RS256'})+'.'+b64(p);
 return raw+'.'+sign('RSA-SHA256',Buffer.from(raw),privateKey).toString('base64url');};
const request=(p=claim,method='GET')=>({method,headers:{authorization:'Bearer '+token(p)}});
let dbReads=0,locks=0,role='owner';
const service={async authorizeCurrent({clerkUserId}){dbReads++;
 eq(clerkUserId,claim.sub);
 return {authority:'clerk-postgresql-session',admin:{clerkUserId,adminRole:role,
   status:'active',clerkLinkState:'linked',lockUntil:locks?new Date(Date.now()+60000).toISOString():null}};}};
const gate=createG5OwnerReadOnlyAcceptance({config:cfg,adminClerkAuthService:service});
const result=await gate.check(request());
eq(result.result,'PASS');eq(result.canSend,false);eq(result.canApproveSandbox,false);
eq(result.vendorCalls,0);eq(result.emailsSent,0);eq(result.outboxMutations,0);
eq(result.schemaWrites,0);eq(result.ownerVerified,true);
for(const key of ['auth','token','email','userId','sessionId','adminRole','bodyDigest'])
 ok(!Object.hasOwn(result,key));
await rejects(()=>gate.check({method:'GET',headers:{}}));
await rejects(()=>gate.check(request({...claim,azp:'https://other.example'})));
await rejects(()=>gate.check(request({...claim,sts:'pending'})));
await rejects(()=>gate.check(request({...claim,fva:[6,0]})));
await rejects(()=>gate.check(request({...claim,reverification_id:null})));
await rejects(()=>gate.check(request(claim,'POST')));
role='admin';await rejects(()=>gate.check(request()));role='owner';
locks=1;await rejects(()=>gate.check(request()));locks=0;
await rejects(()=>gate.dispatch());
assert.throws(()=>createG5OwnerReadOnlyAcceptance({config:{...cfg,appEnv:'production'},adminClerkAuthService:service}));count++;
ok(dbReads>0);
eq(G5_READONLY_CHECK_PATH,'/api/admin/mail-delivery/g5-owner-check');
const app=readFileSync('server/src/app.mjs','utf8');
const idx=readFileSync('server/src/index.mjs','utf8');
ok(app.includes("config.appEnv !== 'staging' || !g5OwnerReadOnlyAcceptance"));
ok(app.includes("writeJson(response,403,{...basePayload,error:'g5_owner_authorization_failed'}"));
ok(idx.includes("process.env.P108_G5_OWNER_READONLY_ENABLED === 'true'"));
ok(!app.includes('mail-p108-d06d2b-g5-clerk-binding'));
ok(!idx.includes('mail-p108-d06d2b-g5-clerk-binding'));
for(const source of [app,idx,readFileSync('server/src/mail/mail-p108-g5-owner-readonly-acceptance.mjs','utf8')]) {
  ok(!source.includes('X-Sib-Sandbox')); // never call provider
}
console.log(`[G5-OWNER-READONLY] PASS (${count} assertions; signed JWT; Staging opt-in route; no external DB/vendor/email)`);
