// G5 owner-only auth boundary regression; synthetic RSA tokens, zero network/DB.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createD06D2BG5TrustedClerkAuthority,
  P108_D06D2B_G5_BOUND_ORIGIN_REQUIRED,
  P108_D06D2B_G5_RETAINED_PROVIDERS } from '../../server/src/mail/mail-p108-d06d2b-g5-clerk-binding.mjs';
import { createClerkSessionAuthenticator } from '../../server/src/auth/clerk-session.mjs';

let checks=0;
const ok=(v,message)=>{assert.ok(v,message);checks++;};
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const reject=async(fn,code)=>{let error;try{await fn();}catch(e){error=e;}ok(error,`must reject ${code}`);equal(error?.code,code);};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const baseTime=Date.now();const clockSeconds=Math.floor(baseTime/1000);
const azp='https://mkrental.vercel.app';
const user='user_G5OriginBound123';
const payload={sub:user,sid:'sess_origin_bound_001',iat:clockSeconds-10,nbf:clockSeconds-10,
  exp:clockSeconds+90,sts:'active',fva:[0,0],reverification_id:'G5OriginReverified2026',azp};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=(data=payload)=>{const prefix=`${b64({alg:'RS256',typ:'JWT'})}.${b64(data)}`;
 return `${prefix}.${sign('RSA-SHA256',Buffer.from(prefix),privateKey).toString('base64url')}`;};
const cfg={clerkJwtKey:publicKey.export({format:'pem',type:'spki'}),
  clerkAuthorizedParties:[azp],clerkClockSkewSeconds:0,clerkRejectPendingSession:true};
let dbCount=0;let time=baseTime;let advanceOnDb=false;
const admin={async authorizeCurrent({clerkUserId}) {dbCount++;equal(clerkUserId,user);
  if(advanceOnDb)time+=120_000;
  return {authority:'clerk-postgresql-session',admin:{clerkUserId:user,adminRole:'owner',status:'active',clerkLinkState:'linked',lockUntil:null}};}};
const ctx=token=>({httpRequest:{headers:{authorization:`Bearer ${token}`}}});
const gate=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:cfg,adminClerkAuthService:admin,now:()=>time});
equal((await gate.verifyServerAuthority(ctx(jwt()))).adminAuth.admin.adminRole,'owner');
ok(dbCount===1,'only trusted SQL authority is consulted after JWT verification');
// The generic shared authenticator permits absent azp, but elevated owner mail
// operations require it. This is the regression that motivated this fix.
const noOrigin={...payload};delete noOrigin.azp;
equal((await createClerkSessionAuthenticator(cfg)(ctx(jwt(noOrigin)).httpRequest)).authorizedParty,null);
await reject(()=>gate.verifyServerAuthority(ctx(jwt(noOrigin))),'g5_verified_claims_invalid');
for(const p of [
 {...payload,azp:null},{...payload,azp:''},{...payload,azp:undefined},
 {...payload,azp:'https://other.example'},
 {...payload,azp:'http://mkrental.vercel.app'},
 {...payload,sts:'pending'},{...payload,sts:'complete'},
 {...payload,sts:null},{...payload,sts:undefined},
]){
 const before=dbCount;
 const code=(p.azp && p.azp!==azp) || p.sts==='pending' ? 'g5_clerk_jwt_verification_failed' : 'g5_verified_claims_invalid';
 await reject(()=>gate.verifyServerAuthority(ctx(jwt(p))),code);
 equal(dbCount,before,'no registry call after boundary failure');
}
for(const update of [
 {clerkRejectPendingSession:false},{clerkRejectPendingSession:undefined},
 {clerkClockSkewSeconds:31},{clerkClockSkewSeconds:-1},
 {clerkClockSkewSeconds:undefined},{clerkClockSkewSeconds:2.5},
 {clerkAuthorizedParties:[]},{clerkAuthorizedParties:['http://mkrental.vercel.app']},
 {clerkAuthorizedParties:['https://mkrental.vercel.app/path']},
 {clerkAuthorizedParties:['https://mkrental.vercel.app?x=1']},
]){
 assert.throws(()=>createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:{...cfg,...update},adminClerkAuthService:admin}),
  /g5_strict_clerk_config_required/);checks++;
}
// Mixed production/staging config with localhost developer origin remains usable,
// but no signed HTTP-localhost session can authorize a mail owner operation.
const mixedConfig={...cfg,clerkAuthorizedParties:[azp,'http://localhost:5173']};
const mixedGate=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:mixedConfig,adminClerkAuthService:admin,now:()=>time});
equal((await mixedGate.verifyServerAuthority(ctx(jwt()))).auth.userId,user);
await reject(()=>mixedGate.verifyServerAuthority(ctx(jwt({...payload,azp:'http://localhost:5173'}))),'g5_verified_claims_invalid');
advanceOnDb=true;time=baseTime;
await reject(()=>gate.verifyServerAuthority(ctx(jwt())),'g5_signed_session_expired_during_lookup');
advanceOnDb=false;time=baseTime;
const badSig=jwt().split('.');badSig[2]='m'.repeat(350);
await reject(()=>gate.verifyServerAuthority(ctx(badSig.join('.'))),'g5_clerk_jwt_verification_failed');
equal(P108_D06D2B_G5_RETAINED_PROVIDERS,['brevo','resend']);
ok(P108_D06D2B_G5_BOUND_ORIGIN_REQUIRED,'strict origin gate is pinned');
for(const file of ['server/src/app.mjs','server/src/index.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs']){
 ok(!readFileSync(file,'utf8').includes('mail-p108-d06d2b-g5-clerk-binding'),'not directly imported by routes (guarded read-only wrapper only)');
}
for(const name of ['BREVO_API_KEY','RESEND_API_KEY','fetch(','CREATE DATABASE','DROP TABLE']){
 ok(!readFileSync('server/src/mail/mail-p108-d06d2b-g5-clerk-binding.mjs','utf8').includes(name),'no delivery/writes');
}
console.log(`[Phase34 P1-08 G5-ORIGIN-HARDEN] PASS (${checks} assertions, synthetic signed JWT only, no DB/HTTP, Brevo and Resend retained)`);
