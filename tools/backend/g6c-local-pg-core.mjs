// PHASE34 G6-C - LOCAL RESTORED DATABASE / isolated scratch schema ONLY.
// Nothing is imported by app.mjs, index.mjs, mail providers, or the dispatcher.
// Do not use on staging/production. No new database, no external network.
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createG6CHeldLockedLedger} from '../../server/src/mail/mail-p108-g6c-durable-review-ledger.mjs';
export const G6C_LOCAL_CONFIRM='I_APPROVE_EXISTING_LOCAL_RESTORE_SCRATCH_SCHEMA';
const dbPattern=/^rental_(?:staging_)?restore_\d{8}(?:_\d{6})?$/;
const schemaPattern=/^p34g6c_[0-9a-f]{16}$/;
const ident=s=>{if(!schemaPattern.test(s))throw Error('g6c_local_bad_scratch_name');return `"${s}"`;};
const sha=s=>createHash('sha256').update(s).digest('hex');
export function validateG6CLocalConnection(raw,{execute=false,confirm=''}={}){
  if(typeof raw!=='string'||!raw)throw Error('g6c_local_connection_missing');
  let u;try{u=new URL(raw);}catch{throw Error('g6c_local_url_invalid');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||
     !['localhost','127.0.0.1','[::1]'].includes(u.hostname.toLowerCase())||
     (u.port&&u.port!=='5432')||!u.username||u.search||u.hash)
    throw Error('g6c_only_local_port5432_restore_database_allowed');
  const db=decodeURIComponent(u.pathname.slice(1));
  if(!dbPattern.test(db))throw Error('g6c_existing_named_restore_db_required');
  if(execute&&confirm!==G6C_LOCAL_CONFIRM)throw Error('g6c_local_explicit_consent_required');
  return Object.freeze({database:db,localOnly:true,execute,createsDatabase:false});
}
const makeSchema=()=>`p34g6c_${randomBytes(8).toString('hex')}`;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const makeJWT=(key,now,changes={})=>{
  const header=b64({alg:'RS256',typ:'JWT'});
  const body=b64({sub:'user_ABCDEFGHIJK',sid:'sessLocalPG18test01',sts:'active',
    iat:now-2,nbf:now-2,exp:now+180,azp:'https://mkrental.vercel.app',
    fva:[0,0],reverification_id:'g6cLocalReauthOne001',...changes});
  const data=`${header}.${body}`;
  return `${data}.${sign('RSA-SHA256',Buffer.from(data),key).toString('base64url')}`;
};
export async function runG6CLocalPG18({connectionString,Pool,confirm,trace=()=>{}}={}){
  const gate=validateG6CLocalConnection(connectionString,{execute:true,confirm});
  if(typeof Pool!=='function')throw Error('g6c_pg_driver_required');
  const schema=makeSchema(),s=ident(schema);let created=false,cleaned=false;
  const checks=[];
  const ck=(condition,label)=>{if(!condition)throw Error('g6c_check_failed:'+label);checks.push(label);};
  const denied=async(label,fn,code)=>{let error;
    try{await fn();}catch(e){error=e;}
    ck(Boolean(error)&&(!code||error.code===code),label);
  };
  const pool=new Pool({connectionString,max:4,connectionTimeoutMillis:4000,ssl:false});
  // Fail-closed connection verifier: the URL host is not sufficient if a driver
  // or environment overrides the actual remote endpoint.
  let failure=null;
  try{
    const r=await pool.query("SELECT current_database() AS database, pg_catalog.host(pg_catalog.inet_server_addr()) AS addr, current_setting('server_version_num')::integer AS v");
    const actual=r.rows[0]||{};
    ck(actual.database===gate.database,'connected_to_requested_restore_db');
    ck(['127.0.0.1','::1'].includes(actual.addr),'actual_server_is_loopback');
    ck(actual.v>=180000&&actual.v<190000,'actual_postgresql_server_version18');
    const draft=readFileSync(new URL('../../docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql',import.meta.url),'utf8');
    ck(/NOT AN APPLIED MIGRATION/i.test(draft),'draft_never_auto_migrated');
    ck(/^BEGIN;\s*$/m.test(draft)&&/^COMMIT;\s*$/m.test(draft),'draft_explicit_transaction');
    const body=draft.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    ck(!/\b(?:CREATE DATABASE|CREATE EXTENSION|DROP DATABASE)\b/i.test(body),'no_db_or_extension_create');
    await pool.query(`CREATE SCHEMA ${s}`);created=true;
    trace('isolated_local_scratch_created');
    const client=await pool.connect();let inTx=false;
    try{
      await client.query('BEGIN');inTx=true;
      await client.query('SET LOCAL lock_timeout = 2000');
      await client.query('SET LOCAL statement_timeout = 10000');
      await client.query(`SET LOCAL search_path TO ${s}, public`);
      await client.query(body); // execute the ACTUAL DRAFT, not an invented fixture
      // Minimal synthetic Outbox / attempt / preflight fixture IN SCRATCH SCHEMA.
      await client.query(`CREATE TABLE ${s}.app_mail_outbox (id BIGINT PRIMARY KEY,
        state TEXT NOT NULL,attempt_count INTEGER NOT NULL,lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ, provider_message_id TEXT)`);
      await client.query(`CREATE TABLE ${s}.app_mail_delivery_attempts (id BIGSERIAL PRIMARY KEY,mail_outbox_id BIGINT NOT NULL)`);
      await client.query(`CREATE TABLE ${s}.app_mail_preflight_reviews (id BIGSERIAL PRIMARY KEY,
        review_result TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await client.query(`INSERT INTO ${s}.app_mail_outbox (id,state,attempt_count) VALUES (5,'queued',0)`);
      await client.query(`INSERT INTO ${s}.app_mail_preflight_reviews (review_result) VALUES ('reviewed_locked')`);
      await client.query('COMMIT');inTx=false;
    }finally{if(inTx)await client.query('ROLLBACK').catch(()=>{});client.release();}
    ck(true,'actual_draft_ddl_and_fixture_committed_in_scratch');
    const cfg=()=>({environment:'staging',provider:'brevo',enabled:false,liveSendingReady:false,
      sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
      apiKey:'SYNTHETIC_CANARY_NOT_REAL',allowlist:new Set(['synthetic-only@example.test']),
      dailyLimit:30,monthlyLimit:900});
    const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
    const clerkJwtConfig={appEnv:'staging',clerkJwtKey:publicKey.export({type:'spki',format:'pem'}),
      clerkAuthorizedParties:['https://mkrental.vercel.app'],clerkRejectPendingSession:true,
      clerkClockSkewSeconds:5};
    const adminClerkAuthService={authorizeCurrent:async({clerkUserId})=>({authority:'clerk-postgresql-session',
      admin:{clerkUserId,adminRole:'owner',status:'active',clerkLinkState:'linked',lockUntil:null}})};
    const goodEvidence=({approvalId,bodyDigest})=>({verifiedByServer:true,stagingOnly:true,
      backupVerified:true,brevoConsoleReviewed:true,explicitSandboxOnlyReview:true,
      approvalId,bodyDigest});
    // Each transaction sets LOCAL search_path so it cannot leak to a reused pool connection.
    const scratchPool={async connect(){const db=await pool.connect();return {
      async query(sql,args){if(sql==='BEGIN'){
        await db.query('BEGIN');await db.query(`SET LOCAL search_path TO ${s}, public`);
        return {rows:[]};}
        return db.query(sql,args);},release(){db.release()}};}};
    const makeSvc=(evidence=goodEvidence)=>createG6CHeldLockedLedger({
      pool:scratchPool,clerkJwtConfig,adminClerkAuthService,getServerMailConfig:cfg,
      verifyIndependentEvidence:evidence});
    const svc=makeSvc(),now=Math.floor(Date.now()/1000);
    const uuid1='123e4567-e89b-42d3-a456-426614174000';
    const uuid2='123e4567-e89b-42d3-a456-426614174001';
    const uuid3='123e4567-e89b-42d3-a456-426614174002';
    const request=(changes={})=>({method:'POST',headers:{authorization:`Bearer ${makeJWT(privateKey,now,changes)}`}});
    const reserve=(svc1,approvalId,claims={})=>svc1.reserveHeldLocked({httpRequest:request(claims),proposedApprovalId:approvalId});
    const counts=async()=>{const r=await pool.query(`SELECT
      (SELECT count(*)::integer FROM ${s}.app_mail_sandbox_review_reservations) AS reservations,
      (SELECT count(*)::integer FROM ${s}.app_mail_sandbox_review_audit) AS audits`);return r.rows[0];};
    const one=await reserve(svc,uuid1);ck(one.state==='held_locked'&&one.canExecuteVendorRequest===false,'first_real_pg_held_lock');
    let c=await counts();ck(c.reservations===1&&c.audits===1,'first_atomic_reservation_and_audit');
    await denied('same_approval_replay_blocked',()=>reserve(svc,uuid1),'g6c_review_replay_or_reauth_reused');
    await denied('different_approval_same_reauth_blocked',()=>reserve(svc,uuid2),'g6c_review_replay_or_reauth_reused');
    await denied('reauth_too_old',()=>reserve(svc,uuid2,{fva:[5,0]}),'g5_recent_reauthentication_required');
    await denied('bad_independent_evidence',()=>reserve(makeSvc(a=>({...goodEvidence(a),backupVerified:false})),uuid2,{reverification_id:'g6cLocalOtherReauth002'}),'g6c_independent_evidence_not_approved');
    c=await counts();ck(c.reservations===1&&c.audits===1,'all_rejections_have_no_writes');
    // Concurrent independent connections, same new UUID and a new signed reauth:
    const claims={reverification_id:'g6cLocalParallelAuth003'};
    const results=await Promise.allSettled([reserve(svc,uuid2,claims),reserve(svc,uuid2,claims)]);
    ck(results.filter(x=>x.status==='fulfilled').length===1&&results.filter(x=>x.status==='rejected').length===1,'two_real_pg_connections_only_one_wins');
    c=await counts();ck(c.reservations===2&&c.audits===2,'real_pg_unique_and_audit_atomic');
    // Scope every deliberately failing SQL to a ROLLBACK transaction.
    const sqlDenied=async(label,statement,args=[],code)=>{
      const db=await pool.connect();try{
        await db.query('BEGIN');await db.query(`SET LOCAL search_path TO ${s}, public`);
        await denied(label,()=>db.query(statement,args),code);
      }finally{await db.query('ROLLBACK').catch(()=>{});db.release();}
    };
    await sqlDenied('immutable_audit_update','UPDATE app_mail_sandbox_review_audit SET event=\'manual_review\'',[], 'P0001');
    await sqlDenied('immutable_audit_delete','DELETE FROM app_mail_sandbox_review_audit',[], 'P0001');
    await sqlDenied('immutable_audit_truncate','TRUNCATE app_mail_sandbox_review_audit',[], 'P0001');
    await sqlDenied('reservation_delete_protected','DELETE FROM app_mail_sandbox_review_reservations',[], 'P0001');
    await sqlDenied('reservation_truncate_protected','TRUNCATE app_mail_sandbox_review_reservations CASCADE',[], 'P0001');
    await sqlDenied('held_with_provider_digest_forbidden',`INSERT INTO app_mail_sandbox_review_reservations
      (approval_digest,actor_clerk_user_id,reauth_digest,session_digest,body_digest,provider,state,provider_id_digest)
      VALUES ($1,'user_ABCDEFGHIJK',$2,$3,$4,'brevo','held_locked',$5)`,
      [sha('badheld1'),sha('badreauth1'),sha('s'),sha('b'),sha('provider')], '23514');
    await sqlDenied('forged_terminal_without_digest',`UPDATE app_mail_sandbox_review_reservations
      SET state='simulated_accepted',verdict='sandbox_simulated_acceptance',settled_at=now(),provider_id_digest=NULL WHERE id=$1`,[one.reservationId], 'P0001');
    await sqlDenied('forged_manual_with_provider_digest',`UPDATE app_mail_sandbox_review_reservations
      SET state='manual_review',verdict='rejected_manual_review',settled_at=now(),provider_id_digest=$2 WHERE id=$1`,[one.reservationId,sha('synthetic')], 'P0001');
    await sqlDenied('forged_quarantine_verdict',`UPDATE app_mail_sandbox_review_reservations
      SET state='uncertain_quarantine',verdict='sandbox_simulated_acceptance',settled_at=now() WHERE id=$1`,[one.reservationId], 'P0001');
    // Audit insertion failure must cause the RESERVATION transaction to rollback.
    await pool.query(`CREATE FUNCTION ${s}.g6c_local_inject_error() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'g6c_local_test_injected_failure' USING ERRCODE='P0001';END;$$`);
    await pool.query(`CREATE TRIGGER g6c_local_inject_error BEFORE INSERT ON ${s}.app_mail_sandbox_review_audit
      FOR EACH ROW EXECUTE FUNCTION ${s}.g6c_local_inject_error()`);
    await denied('audit_failure_causes_rollback',()=>reserve(svc,uuid3,{reverification_id:'g6cLocalAuditFail004'}),'P0001');
    c=await counts();ck(c.reservations===2&&c.audits===2,'audit_failure_leaves_no_orphan_reservation');
    await pool.query(`DROP TRIGGER g6c_local_inject_error ON ${s}.app_mail_sandbox_review_audit`);
    await pool.query(`DROP FUNCTION ${s}.g6c_local_inject_error()`);
    await denied('vendor_call_locked',()=>svc.dispatch(),'g6c_vendor_dispatch_locked');
    await denied('approval_call_locked',()=>svc.approveNetwork(),'g6c_network_approval_not_implemented');
    const outbox=(await pool.query(`SELECT state,attempt_count FROM ${s}.app_mail_outbox WHERE id=5`)).rows[0];
    ck(outbox.state==='queued'&&outbox.attempt_count===0,'scratch_outbox_untouched');
    trace('local_pg18_sql_constraints_and_concurrent_transactions_pass');
  }catch(e){failure=e;}
  finally{
    if(created){try{
      // Restricted to our cryptographically generated scratch schema.
      await pool.query(`DROP SCHEMA ${s} CASCADE`);
      const v=await pool.query('SELECT count(*)::integer AS n FROM pg_catalog.pg_namespace WHERE nspname=$1',[schema]);
      cleaned=Number(v.rows[0].n)===0;
    }catch(e){trace('SCRATCH_CLEANUP_FAILED:'+schema);failure=Object.assign(new Error('g6c_scratch_cleanup_failed'),{code:'G6C_CLEANUP_FAILED',schema});}}
    await pool.end().catch(()=>{});
  }
  if(created&&!cleaned)throw Object.assign(new Error('g6c_scratch_cleanup_not_verified'),{code:'G6C_CLEANUP_FAILED',schema});
  if(failure)throw failure;
  return Object.freeze({result:'PASS',stage:'G6C_LOCAL_PG18_ACTUAL_DDL',
    verifiedPostgreSQL18:true,checks:checks.length,checkNames:checks,
    scratchSchemaDropped:true,existingLocalRestoreOnly:true,
    stagingDatabaseTouched:false,createDatabase:false,providerRequests:0,emailsSent:0,
    approvedForMigration050:false,approvedForNetwork:false});
}
