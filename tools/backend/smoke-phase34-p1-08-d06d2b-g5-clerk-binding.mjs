// No network and no private credentials: ephemeral synthetic RSA key + signed JWTs.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign as signSignature,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {requireMailPreflightReverification} from '../../server/src/mail/mail-p108-preflight-control.mjs';
import {createD06D2BG5TrustedClerkAuthority,P108_D06D2B_G5_PREP_VENDOR_AND_DELIVERY_LOCKED,
 P108_D06D2B_G5_RETAINED_PROVIDERS} from '../../server/src/mail/mail-p108-d06d2b-g5-clerk-binding.mjs';
let checks=0;
const ok=(predicate,label)=>{assert.ok(predicate,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const rejects=async(fn,code)=>{let caught;try{await fn();}catch(e){caught=e;}ok(Boolean(caught),`blocked: ${code}`);if(code)eq(caught.code,code);};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const NOW= Math.floor(Date.now()/1000);
const user='user_G5Offline123456789';
const azp='https://mkrental.vercel.app';
const header={alg:'RS256',typ:'JWT'};
const payload={sub:user,sid:'sess_g5_signed_123',iat:NOW-15,nbf:NOW-15,exp:NOW+120,
 azp,fva:[0,0],reverification_id:'g5SyntheticReauth001',sts:'active'};
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt=(p=payload,h=header)=>{const data=`${b64(h)}.${b64(p)}`;return `${data}.${signSignature('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;};
const clerkJwtConfig={clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
 clerkAuthorizedParties:[azp],clerkClockSkewSeconds:0,clerkRejectPendingSession:true};
let calls=0;let record={clerkUserId:user,adminRole:'owner',status:'active',clerkLinkState:'linked',lockUntil:null};
const adminClerkAuthService={async authorizeCurrent({clerkUserId}){calls++;
 if(clerkUserId!==user)throw Error('identity mismatch');
 return {authority:'clerk-postgresql-session',admin:{...record}};
}};
const gate=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig,adminClerkAuthService});
const ctx=(token=jwt(),body={adminRole:'owner',auth:{userId:'user_forged'},send:true})=>({httpRequest:{headers:{authorization:`Bearer ${token}`},body},approvalId:randomUUID()});
const verified=await gate.verifyServerAuthority(ctx());
eq(verified.auth.userId,user);eq(verified.adminAuth.admin.adminRole,'owner');
const digests=requireMailPreflightReverification(verified);
ok(/^[a-f0-9]{64}$/.test(digests.verificationDigest),'rehash_signed_id');
ok(/^[a-f0-9]{64}$/.test(digests.sessionDigest),'hash_signed_session');
ok(!('email' in verified.adminAuth.admin),'no_pii_registry_leak');
ok(calls===1,'server_authority_lookup');
await rejects(()=>gate.verifyServerAuthority({auth:verified,adminAuth:verified.adminAuth}), 'g5_authenticated_http_request_required');
await rejects(()=>gate.verifyServerAuthority({httpRequest:{headers:{},body:{auth:verified.auth}}}), 'g5_authenticated_http_request_required');
await rejects(()=>gate.verifyServerAuthority(ctx('not-a-token')), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,sub:'user_AnotherUserXYZ'}))), 'g5_postgresql_owner_authorization_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,exp:NOW-2}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,nbf:NOW+100}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,iat:NOW+360}))), 'g5_signed_session_not_current');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,sts:'pending'}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,azp:'https://evil.example'}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,fva:[7,0]}))), 'g5_recent_reauthentication_required');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,fva:[]}))), 'g5_recent_reauthentication_required');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,reverification_id:null}))), 'g5_recent_reauthentication_required');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,sid:''}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt({...payload,exp:NOW-20,iat:NOW-15}))), 'g5_clerk_jwt_verification_failed');
await rejects(()=>gate.verifyServerAuthority(ctx(jwt(payload,{alg:'HS256',typ:'JWT'}))), 'g5_clerk_jwt_verification_failed');
// Valid signature but altered payload must fail signature verification.
const validJwt=jwt();const bits=validJwt.split('.');const tampered=`${bits[0]}.${b64({...payload,sub:'user_Injected999'})}.${bits[2]}`;
await rejects(()=>gate.verifyServerAuthority(ctx(tampered)), 'g5_clerk_jwt_verification_failed');
for(const [variation,description] of [
 [{...record,adminRole:'admin'},'nonowner'],
 [{...record,status:'retired'},'retired'],
 [{...record,clerkLinkState:'unlinked'},'unlinked'],
 [{...record,lockUntil:new Date(Date.now()+60000).toISOString()},'locked'],
 [{...record,clerkUserId:'user_MismatchedOwner'},'mismatch'],
 ]){
 record=variation;await rejects(()=>gate.verifyServerAuthority(ctx()),'g5_postgresql_owner_authorization_failed');
 ok(Boolean(description),'case');
}
record={clerkUserId:user,adminRole:'owner',status:'active',clerkLinkState:'linked',lockUntil:null};
const stale={...payload,iat:NOW-1000,exp:NOW+120};
const forged=jwt({...stale,reverification_id:'a'.repeat(8)});
await rejects(()=>gate.verifyServerAuthority(ctx(forged)),'g5_recent_reauthentication_required');
await rejects(()=>gate.dispatch(),'g5_vendor_dispatch_locked');
await rejects(()=>gate.retry(),'g5_automatic_retry_locked');
ok(P108_D06D2B_G5_PREP_VENDOR_AND_DELIVERY_LOCKED,'no_vendor_delivery');
eq(P108_D06D2B_G5_RETAINED_PROVIDERS,['brevo','resend']);
for(const bad of [{}, {authenticateRequest:async()=>({userId:user}),adminClerkAuthService}, {adminClerkAuthService}, {clerkJwtConfig:null,adminClerkAuthService}]){
 assert.throws(()=>createD06D2BG5TrustedClerkAuthority(bad),/g5_existing_server_auth_dependencies_required/);checks++;
}
// Untrusted verifier injection is not a constructor option.
assert.throws(()=>createD06D2BG5TrustedClerkAuthority({clerkJwtConfig:{...clerkJwtConfig,clerkJwtKey:null},adminClerkAuthService}),/CLERK_JWT_KEY/);checks++;
// Inspection: this file must not be imported by active runtime routes/worker.
for(const path of ['server/src/app.mjs','server/src/index.mjs','server/src/mail/mail-dynoweb-dispatcher.mjs']){
 ok(!readFileSync(path,'utf8').includes('mail-p108-d06d2b-g5-clerk-binding'),'not_directly_wired_to_live_server');
}
for(const name of ['RESEND_API_KEY','BREVO_API_KEY','fetch(','CREATE DATABASE','DROP SCHEMA']){
 ok(!readFileSync('server/src/mail/mail-p108-d06d2b-g5-clerk-binding.mjs','utf8').includes(name),`no_vendor_resource_${name}`);
}
ok(readFileSync('server/src/mail/resend-provider.mjs','utf8').includes('Idempotency-Key'),'resend_preserved');
console.log(`[Phase34 D06-D2B G5-PREP] PASS (${checks} assertions; real RS256 signature path with synthetic RSA key; zero HTTP/DB/Clerk provider calls; Brevo+Resend retained)`);
