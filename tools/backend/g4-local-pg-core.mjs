// D06-D2B G4: isolated, opt-in LOCAL restore-database integration only.
// NEVER import in the web server, worker, email provider or Outbox dispatcher.
import {randomBytes} from 'node:crypto';
import {createD06D2BGate2LockedRepository} from '../../server/src/mail/mail-p108-d06d2b-gate2-locked-reservation.mjs';

export const G4_LIVE_VENDOR_CALL_LOCKED=true;
export const G4_LOCAL_ONLY=true;
export const G4_CONFIRM='I_APPROVE_LOCAL_SCHEMA_CREATE_AND_DROP';
const namePattern=/^p34g4_[a-f0-9]{16}$/;
const allowedDb=/^rental_(?:staging_)?restore_\d{8}(?:_\d{6})?$/;
const qid=s=>{if(!namePattern.test(s))throw Error('g4_schema_name_invalid');return '"'+s+'"';};
export function validateLocalConnection(raw,{mode='plan',confirm='',requestedExecution=false}={}){
  if(mode!=='plan' && mode!=='execute-local')throw Error('g4_unknown_mode');
  if(mode==='execute-local' && (!requestedExecution||confirm!==G4_CONFIRM))throw Error('g4_explicit_local_consent_required');
  if(typeof raw!=='string' || !raw)throw Error('g4_local_restore_connection_not_supplied');
  let u;try{u=new URL(raw);}catch{throw Error('g4_invalid_database_url');}
  if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('g4_invalid_postgres_protocol');
  if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname.toLowerCase()))throw Error('g4_remote_host_forbidden');
  if(u.username==='')throw Error('g4_database_username_required');
  const db=decodeURIComponent(u.pathname.slice(1));
  if(!allowedDb.test(db))throw Error('g4_not_existing_named_restore_database');
  if(u.searchParams.has('host')||u.searchParams.has('service')||u.searchParams.has('hostaddr'))throw Error('g4_host_override_forbidden');
  // A locally forwarded socket/connection option can silently redirect the driver.
  // No query options, fragments, or Unix-socket overrides are permitted.
  if(u.search||u.hash)throw Error('g4_connection_options_forbidden');
  return Object.freeze({host:u.hostname,port:u.port||'5432',database:db,mode,
    createsDatabase:false,canConnect:mode==='execute-local'&&requestedExecution&&confirm===G4_CONFIRM,
    realMailAllowed:false,provider:'brevo',retainedProviders:['brevo','resend']});
}
export function createG4SchemaName(bytes=randomBytes(8)){
  if(bytes?.length!==8)throw Error('g4_schema_entropy_required');
  return 'p34g4_'+Buffer.from(bytes).toString('hex');
}
// New schema is disposable and always unique to a local restore DB. The DRAFT NOT DEPLOY
// SQL is NEVER executed. No existing tables/functions/triggers are modified.
export function localFixtureStatements(schema){
  const s=qid(schema);
  return [
    `CREATE SCHEMA ${s}`,
    `CREATE TABLE ${s}.app_mail_sandbox_review_reservations (
      id BIGSERIAL PRIMARY KEY,
      approval_digest CHAR(64) NOT NULL UNIQUE CHECK (approval_digest ~ '^[a-f0-9]{64}$'),
      actor_clerk_user_id TEXT NOT NULL CHECK (actor_clerk_user_id ~ '^user_[A-Za-z0-9]{8,}$'),
      reauth_digest CHAR(64) NOT NULL UNIQUE CHECK (reauth_digest ~ '^[a-f0-9]{64}$'),
      session_digest CHAR(64) NOT NULL CHECK (session_digest ~ '^[a-f0-9]{64}$'),
      body_digest CHAR(64) NOT NULL CHECK (body_digest ~ '^[a-f0-9]{64}$'),
      provider TEXT NOT NULL CHECK (provider='brevo'),
      state TEXT NOT NULL DEFAULT 'held_locked' CHECK (state IN ('held_locked','simulated_accepted','manual_review','uncertain_quarantine')),
      verdict TEXT, provider_id_digest CHAR(64),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),settled_at TIMESTAMPTZ,
      -- Structural check in addition to the transition trigger. A pending review
      -- cannot carry a provider response, and manual/quarantined responses may
      -- never masquerade as a simulated acceptance. No external email proof.
      CONSTRAINT g4_mock_outcome_consistency CHECK ((
        (state='held_locked' AND verdict IS NULL AND settled_at IS NULL AND provider_id_digest IS NULL)
        OR (state='simulated_accepted' AND verdict='sandbox_simulated_acceptance'
            AND settled_at IS NOT NULL AND provider_id_digest ~ '^[a-f0-9]{64}$')
        OR (state='manual_review' AND verdict IN ('rate_limited_manual_review','rejected_manual_review')
            AND settled_at IS NOT NULL AND provider_id_digest IS NULL)
        OR (state='uncertain_quarantine' AND verdict='uncertain_quarantine'
            AND settled_at IS NOT NULL AND provider_id_digest IS NULL)
      ) IS TRUE)
    )`,
    `CREATE TABLE ${s}.app_mail_sandbox_review_audit (
      id BIGSERIAL PRIMARY KEY,
      reservation_id BIGINT NOT NULL REFERENCES ${s}.app_mail_sandbox_review_reservations(id),
      event TEXT NOT NULL CHECK (event IN ('review_held','simulated_accepted','manual_review','uncertain_quarantine')),
      actor_clerk_user_id TEXT NOT NULL,
      payload_digest CHAR(64) NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE FUNCTION ${s}.g4_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'g4_audit_immutable' USING ERRCODE='P0001'; END $$`,
    `CREATE TRIGGER g4_audit_immutable BEFORE UPDATE OR DELETE ON ${s}.app_mail_sandbox_review_audit
      FOR EACH ROW EXECUTE FUNCTION ${s}.g4_audit_immutable()`,
    `CREATE FUNCTION ${s}.g4_terminal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.state <> 'held_locked' OR NEW.id <> OLD.id OR NEW.approval_digest <> OLD.approval_digest
          OR NEW.actor_clerk_user_id <> OLD.actor_clerk_user_id OR NEW.reauth_digest <> OLD.reauth_digest
          OR NEW.session_digest <> OLD.session_digest OR NEW.body_digest <> OLD.body_digest
          OR NEW.provider <> OLD.provider OR NEW.created_at <> OLD.created_at THEN
          RAISE EXCEPTION 'g4_terminal_mutation_forbidden' USING ERRCODE='P0001';
        END IF;
        IF NEW.state NOT IN ('simulated_accepted','manual_review','uncertain_quarantine') THEN
          RAISE EXCEPTION 'g4_invalid_transition' USING ERRCODE='P0001';
        END IF;
        -- Trust only the local fixture format; the SQL-level constraint checks
        -- the exact state/verdict/hash tuple, including forged/missing digests.
        IF NEW.settled_at IS NULL OR
           (
             (NEW.state='simulated_accepted' AND NEW.verdict='sandbox_simulated_acceptance'
               AND NEW.provider_id_digest ~ '^[a-f0-9]{64}$')
             OR (NEW.state='manual_review' AND NEW.verdict IN
                ('rate_limited_manual_review','rejected_manual_review') AND NEW.provider_id_digest IS NULL)
             OR (NEW.state='uncertain_quarantine' AND NEW.verdict='uncertain_quarantine'
                AND NEW.provider_id_digest IS NULL)
           ) IS NOT TRUE THEN
          RAISE EXCEPTION 'g4_mock_outcome_mismatch' USING ERRCODE='P0001';
        END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER g4_terminal_guard BEFORE UPDATE ON ${s}.app_mail_sandbox_review_reservations
      FOR EACH ROW EXECUTE FUNCTION ${s}.g4_terminal_guard()`,
    `CREATE FUNCTION ${s}.g4_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'g4_reservation_delete_forbidden' USING ERRCODE='P0001'; END $$`,
    `CREATE TRIGGER g4_no_delete BEFORE DELETE ON ${s}.app_mail_sandbox_review_reservations
      FOR EACH ROW EXECUTE FUNCTION ${s}.g4_no_delete()`,
  ];
}

const recipient='only-synthetic@example.test';
const config=()=>({environment:'staging',provider:'brevo',enabled:true,
  sender:'noreply@mail.notebook.recruit.kro.kr',domainVerified:true,
  liveSendingReady:false,allowlist:new Set([recipient]),dailyLimit:1,monthlyLimit:1});
const authority={adminAuth:{admin:{adminRole:'owner'}},auth:{userId:'user_ABCDEFGHIJK',
  factorVerificationAge:[0],reverificationId:'secureSyntheticReverify001',
  sessionId:'sessSynthetic12345',issuedAt:1729000000,expiresAt:1729000300}};
const approvalId='00000000-0000-4000-8000-000000000001';
const evidence=id=>({verifiedByServer:true,stagingRegression8of8:true,
  outboxFiveReviewedReadOnly:true,backupIndependentlyVerified:true,
  sandboxOnlyExplicitApproval:true,approvalId:id,production:false});
// Scope the scratch schema ONLY for the current G2 transaction. A session-level
// SET search_path can persist in a reusable pg Pool connection and misroute
// later statements; SET LOCAL automatically disappears on COMMIT/ROLLBACK.
export function createG4WrappedPool(pool,schema){
  const ident=qid(schema);
  if(typeof pool?.connect!=='function')throw Error('g4_pool_connect_required');
  return {async connect(){
    const client=await pool.connect();
    let active=false;
    return {
      async query(sql,...args){
        if(typeof sql!=='string')throw Error('g4_query_string_required');
        const cmd=sql.trim().toUpperCase();
        if(cmd==='BEGIN'){
          if(active)throw Error('g4_nested_transaction_forbidden');
          const result=await client.query(sql,...args);
          active=true;
          try{await client.query(`SET LOCAL search_path TO ${ident}, pg_catalog`);}
          catch(error){
            try{await client.query('ROLLBACK');active=false;}catch{}
            throw error;
          }
          return result;
        }
        if(!active)throw Error('g4_outside_transaction_forbidden');
        try {
          const result=await client.query(sql,...args);
          if(cmd==='COMMIT'||cmd==='ROLLBACK')active=false;
          return result;
        }catch(error){
          // On a commit/rollback error, release must discard a potentially
          // aborted connection instead of returning it to the shared pool.
          throw error;
        }
      },
      release(error){client.release(active ? true : error);}
    };
  }};
}
export function createG4Repository(pool,schema,{overrideAuthority,overrideEvidence}={}){
  return createD06D2BGate2LockedRepository(createG4WrappedPool(pool,schema),{
    verifyServerAuthority:async()=>overrideAuthority||authority,
    verifyIndependentEvidence:async({approvalId:id})=>overrideEvidence||evidence(id),
    getServerMailConfig:async()=>config(),
    verifySyntheticFixture:async({reservationId,fixture})=>({verifiedByServer:true,
      source:'trusted_offline_registry',provider:'brevo',reservationId,
      mode:'synthetic_fixture',status:fixture.status,body:fixture.body})
  });
}

// This runner is never called by default, never given external Staging credentials,
// and has no Brevo/Resend HTTP APIs. Any fixture operation stays in scratch schema.
export async function runLocalG4({connectionString,Pool,confirm,requestedExecution,trace=()=>{}}){
  const gate=validateLocalConnection(connectionString,{mode:'execute-local',confirm,requestedExecution});
  if(!gate.canConnect||typeof Pool!=='function')throw Error('g4_missing_explicit_local_driver');
  const schema=createG4SchemaName();const ident=qid(schema);const checks=[];
  const pool=new Pool({connectionString,max:4,connectionTimeoutMillis:3000,
    idleTimeoutMillis:1000,statement_timeout:5000,query_timeout:6000});
  let created=false,cleaned=false,cleanupError=null;
  const ok=(label,condition)=>{if(!condition)throw Error('g4_assertion_failed:'+label);checks.push(label);};
  const rejects=async(label,job,code)=>{
    let error;try{await job();}catch(e){error=e;}
    ok(label,Boolean(error) && (!code||error.code===code));
  };
  const counts=()=>pool.query(`SELECT
    (SELECT count(*)::int FROM ${ident}.app_mail_sandbox_review_reservations) AS reservations,
    (SELECT count(*)::int FROM ${ident}.app_mail_sandbox_review_audit) AS audits`);
  const reserve=(repo,id=approvalId)=>repo.reserveReviewOnly({requestContext:{test:'LOCAL_G4_SYNTHETIC'},approvalId:id,recipient});
  try{
    // host(inet) removes /32 or /128; ::text retains the mask and falsely blocks localhost.
    // Keep the existing strict loopback allowlist; do not broaden to private/network IPs.
    const meta=await pool.query('SELECT current_database() AS db, pg_catalog.host(pg_catalog.inet_server_addr()) AS address');
    ok('actual_db_name',meta.rows[0]?.db===gate.database);
    ok('server_loopback', ['127.0.0.1','::1'].includes(meta.rows[0]?.address));
    trace('connected_to_approved_local_restore');
    for(const sql of localFixtureStatements(schema)) {await pool.query(sql);if(sql.startsWith('CREATE SCHEMA'))created=true;}
    trace('created_isolated_local_scratch_schema');
    const repo=createG4Repository(pool,schema);
    const valid=await reserve(repo);ok('first_reservation',valid.state==='held_locked' && valid.canDeliverEmail===false);
    let c=(await counts()).rows[0];ok('initial_one_reservation_one_audit',c.reservations===1&&c.audits===1);
    await rejects('duplicate_same_approval_blocked',()=>reserve(repo),'gate2_approval_or_reauth_already_reserved');
    const cAfter=(await counts()).rows[0];ok('duplicate_rollback',cAfter.reservations===1&&cAfter.audits===1);
    const variant='00000000-0000-4000-8000-000000000002';
    await rejects('reauth_unique_even_if_approval_diff',()=>reserve(repo,variant),'gate2_approval_or_reauth_already_reserved');
    await rejects('independent_evidence_failure_rollback',()=>reserve(createG4Repository(pool,schema,{overrideEvidence:{...evidence(variant),verifiedByServer:false}}),variant),'gate2_independent_approval_missing');
    c=(await counts()).rows[0];ok('failed_evidence_no_writes',c.reservations===1&&c.audits===1);
    await rejects('different_session_cannot_settle',()=>createG4Repository(pool,schema,{overrideAuthority:{...authority,auth:{...authority.auth,sessionId:'sessDifferent0987'}}}).settleMockOnly({reservationId:valid.reservationId,
      fixture:{mode:'synthetic_fixture',status:504,body:{}}}),'gate2_reservation_missing_owner_or_terminal');
    const outcome=await repo.settleMockOnly({reservationId:valid.reservationId,fixture:{mode:'synthetic_fixture',status:504,body:{}}});
    ok('uncertain_result_quarantined',outcome.state==='uncertain_quarantine'&&!outcome.automaticRetryAllowed);
    await rejects('double_settlement_rejected',()=>repo.settleMockOnly({reservationId:valid.reservationId,fixture:{mode:'synthetic_fixture',status:201,body:{messageId:'synthetic'}}}),'gate2_reservation_missing_owner_or_terminal');
    c=(await counts()).rows[0];ok('settlement_audit_atomic',c.reservations===1&&c.audits===2);
    await rejects('immutable_audit_update',()=>pool.query(`UPDATE ${ident}.app_mail_sandbox_review_audit SET event='manual_review'`),'P0001');
    await rejects('immutable_audit_delete',()=>pool.query(`DELETE FROM ${ident}.app_mail_sandbox_review_audit`),'P0001');
    await rejects('terminal_reservation_guard',()=>pool.query(`UPDATE ${ident}.app_mail_sandbox_review_reservations SET state='manual_review'`),'P0001');
    // Validate the actual PostgreSQL CHECK and trigger behavior on a fresh
    // HELD synthetic row inside savepoints. A deliberate invalid UPDATE must
    // never leave a terminal state or an audit row behind.
    const unsentApproval='00000000-0000-4000-8000-000000000004';
    const unsentAuthority={...authority,auth:{...authority.auth,reverificationId:'secureSyntheticReverify004'}};
    const unsentRepo=createG4Repository(pool,schema,{overrideAuthority:unsentAuthority});
    const unsent=await reserve(unsentRepo,unsentApproval);
    const rejectedUpdate=async(label,state,verdict,providerIdDigest)=>{
      const db=await pool.connect();
      try{
        await db.query('BEGIN');
        await rejects(label,()=>db.query(`UPDATE ${ident}.app_mail_sandbox_review_reservations
          SET state=$2,verdict=$3,provider_id_digest=$4,settled_at=NOW()
          WHERE id=$1::bigint`,[unsent.reservationId,state,verdict,providerIdDigest]),'P0001');
      }finally {await db.query('ROLLBACK'); db.release();}
    };
    await rejectedUpdate('fake_acceptance_missing_provider_digest','simulated_accepted','sandbox_simulated_acceptance',null);
    await rejectedUpdate('fake_acceptance_wrong_verdict','simulated_accepted','rejected_manual_review','a'.repeat(64));
    await rejectedUpdate('manual_review_with_provider_digest','manual_review','rejected_manual_review','a'.repeat(64));
    await rejectedUpdate('quarantine_as_acceptance','uncertain_quarantine','sandbox_simulated_acceptance',null);
    const stillHeld=await pool.query(`SELECT state,verdict,settled_at,provider_id_digest
      FROM ${ident}.app_mail_sandbox_review_reservations WHERE id=$1::bigint`,[unsent.reservationId]);
    ok('rejected_mock_mutations_preserve_held_state',stillHeld.rows.length===1 &&
      stillHeld.rows[0].state==='held_locked' && stillHeld.rows[0].verdict===null &&
      stillHeld.rows[0].settled_at===null && stillHeld.rows[0].provider_id_digest===null);
    await rejects('reservation_delete_guard',()=>pool.query(`DELETE FROM ${ident}.app_mail_sandbox_review_reservations`),'P0001');
    await rejects('dispatch_locked',()=>repo.dispatch(),'gate2_vendor_dispatch_permanently_locked');
    await rejects('retry_locked',()=>repo.retry(),'gate2_automatic_retry_forbidden');
    // Two concurrent sessions, same approval but fresh synthetic reauth. Exactly one wins.
    const authority2={...authority,auth:{...authority.auth,reverificationId:'secureSyntheticReverify002'}};
    const repo2=createG4Repository(pool,schema,{overrideAuthority:authority2});
    const variant2='00000000-0000-4000-8000-000000000003';
    const attempts=await Promise.allSettled([reserve(repo2,variant2),reserve(repo2,variant2)]);
    ok('two_connection_duplicate_contention',attempts.filter(r=>r.status==='fulfilled').length===1 &&
      attempts.filter(r=>r.status==='rejected').length===1);
    c=(await counts()).rows[0];ok('concurrency_one_committed',c.reservations===3&&c.audits===4);
    return Object.freeze({stage:'D06-D2B-G4-LOCAL',result:'PASS',databaseType:'EXISTING_LOCAL_RESTORE',
      scratchSchemaDropped:'verified_in_finally_before_success',checks:checks.length,checkNames:checks,
      realStagingTested:false,realClerkTested:false,realMailAllowed:false,
      providersRetained:['brevo','resend'],emailSent:0,vendorCalls:0});
  }finally{
    if(created){try{
      // DROP restricted to generated schema, never public. Performed even if assertions fail.
      await pool.query(`DROP SCHEMA ${ident} CASCADE`);
      const stillThere=await pool.query('SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1',[schema]);
      if(stillThere.rows.length!==0)throw Error('g4_scratch_schema_still_present');
      cleaned=true;
    }catch(e){cleanupError=e;trace('LOCAL_SCHEMA_CLEANUP_FAILED:'+schema);}}
    await pool.end();
    if(created && (!cleaned||cleanupError)) throw Object.assign(new Error('g4_local_schema_cleanup_failed'),{code:'G4_CLEANUP_FAILED',schema});
    trace('local_scratch_cleanup_complete');
  }
}
