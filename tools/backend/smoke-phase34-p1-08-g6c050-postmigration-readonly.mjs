import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {readG6C050LedgerStatusInReadOnlyTransaction,createG6C050OwnerReadOnlyStatus,
  G6C_050_CHECKSUM,G6C_POSTMIGRATION_REVIEW_PATH,G6C_POSTMIGRATION_NETWORK_LOCKED}
  from '../../server/src/mail/mail-p108-g6c-postmigration-readonly.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
let assertions=0;
const check=(value,expected)=>{assert.deepEqual(value,expected);assertions++;};
const sql=await readFile(resolve(root,'server/migrations/050_phase34_p1_08_mail_sandbox_review_ledger.sql'));
check(createHash('sha256').update(sql).digest('hex'),G6C_050_CHECKSUM);
check(G6C_050_CHECKSUM,'88d4ee347bbba133f7a0df6e3a88d93ece332bff774b2e8650f8b962bfb28826');
check(G6C_POSTMIGRATION_NETWORK_LOCKED,true);
check(G6C_POSTMIGRATION_REVIEW_PATH,'/api/admin/mail-delivery/g6c-ledger-status');
const app=await readFile(resolve(root,'server/src/app.mjs'),'utf8');
const index=await readFile(resolve(root,'server/src/index.mjs'),'utf8');
check(index.includes("process.env.P108_G6C_050_READONLY_ENABLED === 'true'"),true);
check(index.includes('createG6C050OwnerReadOnlyStatus('),true);
check(app.includes("url.pathname === '/api/admin/mail-delivery/g6c-ledger-status'"),true);
check(app.includes("request.method !== 'GET'"),true);
check(app.includes('g6c050OwnerReadOnlyStatus.check(request)'),true);
check(app.includes('g6cLedgerStatus:status'),true);
check(app.includes("error:'not_found'"),true);
check(app.includes('g6c_owner_authorization_failed'),true);
check(app.includes('g6c_ledger_unavailable'),true);
const procfile=await readFile(resolve(root,'Procfile'),'utf8');
check(procfile.includes('release: npm --prefix server run db:migrate'),true);
const migrator=await readFile(resolve(root,'server/scripts/migrate.mjs'),'utf8');
check(migrator.includes('Migration checksum mismatch'),true);
const names=[];
const fakeDb={async query(sql,params){
  names.push(sql);
  if(sql.includes('schema_migrations')){
    check(params?.[0],'050_phase34_p1_08_mail_sandbox_review_ledger.sql');
    check(params?.[1],G6C_050_CHECKSUM);
    return {rows:[{total:1}]};
  }
  if(sql.includes('to_regclass'))return {rows:[{reservations:true,audit:true}]};
  if(sql.includes('COUNT(*)') && sql.includes('sandbox_review_reservations'))return {rows:[{total:0}]};
  if(sql.includes('COUNT(*)') && sql.includes('sandbox_review_audit'))return {rows:[{total:0}]};
  if(sql.includes('app_mail_outbox'))return {rows:[{total:1}]};
  if(sql.includes('app_mail_delivery_attempts'))return {rows:[{total:0}]};
  if(sql.includes('app_mail_preflight_reviews'))return {rows:[{review_result:'reviewed_locked'}]};
  throw Error('unexpected SELECT');
}};
const snapshot=await readG6C050LedgerStatusInReadOnlyTransaction(fakeDb);
check(snapshot.schema050Verified,true);check(snapshot.reservationCount,0);check(snapshot.auditCount,0);
check(snapshot.outbox5Locked,true);check(snapshot.preflightReviewedLocked,true);
check(snapshot.canReserve,false);check(snapshot.canApprove,false);check(snapshot.canInvokeBrevo,false);
check(snapshot.canSendMail,false);check(snapshot.canRetry,false);check(snapshot.dbWrites,0);
check(snapshot.networkRequests,0);check(snapshot.realEmailsSent,0);
check(names.length,7);
for(const statement of names){
  check(statement.trimStart().startsWith('SELECT'),true);
  check(/\b(INSERT|DELETE|UPDATE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i.test(statement),false);
}
let noAuthFailed=false;
try{createG6C050OwnerReadOnlyStatus({config:{appEnv:'production'},pool:{connect:async()=>{}},getServerMailConfig:()=>({})});}
catch{noAuthFailed=true;}check(noAuthFailed,true);
let noPoolFailed=false;
try{createG6C050OwnerReadOnlyStatus({config:{appEnv:'staging'},adminClerkAuthService:{authorizeCurrent:async()=>({})},getServerMailConfig:()=>({})});}
catch{noPoolFailed=true;}check(noPoolFailed,true);
let noConfigFailed=false;
try{createG6C050OwnerReadOnlyStatus({config:{appEnv:'staging'},pool:{connect:async()=>{}},getServerMailConfig:()=>({})});}
catch{noConfigFailed=true;}check(noConfigFailed,true);
const oldModule=await readFile(resolve(root,'server/src/mail/mail-p108-g6c-durable-review-ledger.mjs'),'utf8');
check(oldModule.includes('G6C_DURABLE_REVIEW_SCHEMA_DEPLOYED=false'),true);
check(oldModule.includes('async approveNetwork(){throw'),true);
check(oldModule.includes('async dispatch(){throw'),true);
check(oldModule.includes('async retry(){throw'),true);

// Signed RS256 owner JWT + PG authority integration against a fake DB.
// NEVER calls Clerk, Heroku, Brevo, or a real database.
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const origin='https://mkrental.vercel.app';
const now=Math.floor(Date.now()/1000);
const jwtConfig={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
 clerkAuthorizedParties:[origin],clerkRejectPendingSession:true,clerkClockSkewSeconds:5};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(claims={}){
 const payload={sub:'user_G6C050Owner0001',sid:'sess_g6c050_owner_01',azp:origin,
 iat:now-10,nbf:now-10,exp:now+130,sts:'active',fva:[0,0],
 reverification_id:'g6c050_recent_reauth_01',...claims};
 const signingInput=b64({typ:'JWT',alg:'RS256'})+'.'+b64(payload);
 return signingInput+'.'+sign('RSA-SHA256',Buffer.from(signingInput),privateKey).toString('base64url');
}
function httpRequest(extra={},method='GET'){
 return {method,headers:{authorization:'Bearer '+jwt(extra)}};
}
let dbBorrowCount=0,adminLookupCount=0,adminRole='owner',mailEnabled=false;
const clientStatements=[];
const pool={async connect(){dbBorrowCount++;return {
 async query(text,params){
  clientStatements.push(text);
  if(/^(BEGIN READ ONLY|SET LOCAL|ROLLBACK)/.test(text))return {rows:[]};
  return fakeDb.query(text,params);
 },release(){clientStatements.push('RELEASE');}};}};
const admins={async authorizeCurrent({clerkUserId}){
 adminLookupCount++;
 return {authority:'clerk-postgresql-session',admin:{clerkUserId,adminRole,
 status:'active',clerkLinkState:'linked',lockUntil:null}};
}};
const service=createG6C050OwnerReadOnlyStatus({config:jwtConfig,
 adminClerkAuthService:admins,pool,getServerMailConfig:()=>({environment:'staging',
 enabled:mailEnabled,liveSendingReady:false,apiKey:'NEVER_LEAK_SECRET',
 allowlist:new Set(['recipient@invalid.test'])})});
const checked=await service.check(httpRequest());
check(checked.schema050Verified,true);
check(checked.canReserve,false);check(checked.canInvokeBrevo,false);
check(checked.canSendMail,false);check(checked.outbox5Locked,true);
check(dbBorrowCount,1);check(adminLookupCount,1);
check(clientStatements[0],'BEGIN READ ONLY');
check(clientStatements.at(-2),'ROLLBACK');check(clientStatements.at(-1),'RELEASE');
const safeResponse=JSON.stringify(checked);
check(safeResponse.includes('NEVER_LEAK_SECRET'),false);
check(safeResponse.includes('recipient@invalid.test'),false);
check(safeResponse.includes('user_G6C050Owner0001'),false);
check(clientStatements.some(q=>/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/i.test(q)),false);
await assert.rejects(()=>service.check({method:'GET',headers:{}}));assertions++;
check(dbBorrowCount,1);
await assert.rejects(()=>service.check(httpRequest({azp:'https://malicious.invalid'})));assertions++;
await assert.rejects(()=>service.check(httpRequest({fva:[7,0]})));assertions++;
await assert.rejects(()=>service.check(httpRequest({sts:'pending'})));assertions++;
await assert.rejects(()=>service.check(httpRequest({},'POST')));assertions++;
check(dbBorrowCount,1);
adminRole='admin';await assert.rejects(()=>service.check(httpRequest()));assertions++;
adminRole='owner';mailEnabled=true;
await assert.rejects(()=>service.check(httpRequest()));assertions++;
check(dbBorrowCount,1);
mailEnabled=false;
await assert.rejects(()=>service.reserve());assertions++;
await assert.rejects(()=>service.dispatch());assertions++;
await assert.rejects(()=>service.retry());assertions++;

console.log(`[G6C050 STAGING READONLY HTTP CONTRACT] PASS ${assertions} assertions; 050 SHA matches approved, no DB/vendor/mail in smoke`);
