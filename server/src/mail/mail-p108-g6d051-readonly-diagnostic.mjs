// Phase34 P1-08: operator-only G6-D diagnostic. GET and SELECT ONLY.
// Independent opt-in, never opens G6-D network permission or a mail sender.
import { createD06D2BG5TrustedClerkAuthority } from './mail-p108-d06d2b-g5-clerk-binding.mjs';
import { requireMailPreflightReverification, P108_D06_LIVE_DELIVERY_LOCKED } from './mail-p108-preflight-control.mjs';
import { inspectG6SandboxReadiness, G6_VENDOR_NETWORK_LOCKED, G6_LIVE_MAIL_LOCKED } from './mail-p108-g6-brevo-readiness.mjs';
import { buildD06D2AOfflinePlan } from './mail-p108-d06d2a-sandbox-gate.mjs';
import { G6C_050_CHECKSUM } from './mail-p108-g6c-postmigration-readonly.mjs';
import { G6D051_CHECKSUM, G6D051_LIVE_DELIVERY_LOCKED, G6D051_NO_AUTO_RETRY } from './mail-p108-g6d051-brevo-one-shot.mjs';
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { P108_REAL_DELIVERY_LOCKED } from './mail-p108-protected-bridge.mjs';

export const G6D051_DIAGNOSTIC_PATH = '/api/admin/mail-delivery/g6d-one-shot-readonly-diagnostic';
export const G6D051_DIAGNOSTIC_NO_SEND = true;
const reject = (code, status=403) => Object.assign(new Error(code), { code, status });
const total = result => Number(result?.rows?.[0]?.total);
const allChecksPass = checks => Object.values(checks).every(x => x === true);

// Export a pure evaluator for independent negative-case testing. It accepts
// only server-owned, previously retrieved evidence (no JWT or client-supplied ID).
export function evaluateG6D051ReadOnlyEvidence({
  migrationCount, triggerCount, claimCount, outbox, optOutAuditCount,
  deliveryAttemptCount, latestReview, held, proof, bodyDigest, mailSafe,
} = {}) {
  const x = outbox;
  const locked = x && Number(x.id) === 5 && Number(x.attempt_count) === 0 &&
    x.lease_owner == null && x.lease_expires_at == null && x.provider_message_id == null;
  const queued = x?.state === 'queued';
  const auditedOptOut = x?.state === 'cancelled' && x?.event_key === 'admin_signup_pending' &&
    x?.last_error_code === 'mail_admin_opted_out' && Number(optOutAuditCount) === 1;
  const checks = Object.freeze({
    migrations: migrationCount === 2,
    immutableTriggers: triggerCount === 7,
    claimUnused: claimCount === 0,
    outboxSafe: Boolean(locked && (queued || auditedOptOut)),
    recipientOptOutAudited: Boolean(queued || auditedOptOut),
    deliveryAttemptsZero: deliveryAttemptCount === 0,
    preflightReviewed: latestReview === 'reviewed_locked',
    reservationHeld: Boolean(held && Number(held.id) === 1 && held.state === 'held_locked' &&
      held.provider === 'brevo' && held.verdict == null && held.settled_at == null &&
      held.provider_id_digest == null && held.body_digest?.trim() === bodyDigest),
    reservationOwnerMatches: Boolean(held && proof && held.actor_clerk_user_id === proof.actorId),
    reauthenticationDistinct: Boolean(held && proof && /^[a-f0-9]{64}$/.test(held.reauth_digest?.trim()||'') &&
      /^[a-f0-9]{64}$/.test(proof.verificationDigest||'') &&
      held.reauth_digest.trim() !== proof.verificationDigest),
    mailSafety: mailSafe === true,
  });
  return Object.freeze({readyForSeparateApproval:allChecksPass(checks), checks,
    readOnly:true, vendorRequests:0, realEmailsSent:0, outboxMutations:0,
    claimWrites:0, canApproveOrSend:false});
}

export function createG6D051ReadOnlyDiagnostic({
 config,adminClerkAuthService,pool,getServerMailConfig,now=()=>Date.now(),
}={}) {
  if(config?.appEnv !== 'staging' || typeof pool?.connect !== 'function' ||
     typeof getServerMailConfig !== 'function' ||
     typeof adminClerkAuthService?.authorizeCurrent !== 'function')
    throw new TypeError('g6d_readonly_dependencies_invalid');
  const authority = createD06D2BG5TrustedClerkAuthority({
    clerkJwtConfig:config,adminClerkAuthService,now,
  });
  return Object.freeze({
    async check(request) {
      if(request?.method !== 'GET') throw reject('g6d_readonly_get_only',405);
      const origin = request?.headers?.origin;
      if(!config.clerkAuthorizedParties.includes(origin))throw reject('g6d_readonly_origin_denied');
      // Full RS256, active-owner identity and fresh signed reverification first.
      const verified = await authority.verifyServerAuthority({httpRequest:request});
      if(verified.auth.authorizedParty !== origin)throw reject('g6d_readonly_signed_origin_denied');
      const proof = requireMailPreflightReverification(verified);
      let mail;
      try { mail=getServerMailConfig(); } catch {throw reject('g6d_readonly_mail_unavailable',503);}
      const sourceLocked = [P103_REAL_DELIVERY_LOCKED,P108_REAL_DELIVERY_LOCKED,
        P108_D06_LIVE_DELIVERY_LOCKED,G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED,
        G6D051_LIVE_DELIVERY_LOCKED,G6D051_NO_AUTO_RETRY].every(x=>x===true);
      const mailSafe = sourceLocked && mail?.environment==='staging' &&
        mail?.enabled === false && mail?.liveSendingReady === false &&
        mail?.provider === 'brevo' && mail?.configured===true &&
        mail?.domainVerified===true && mail?.allowlist instanceof Set &&
        mail.allowlist.size===1 && !!mail.apiKey?.trim() &&
        inspectG6SandboxReadiness(mail).syntheticPlanReady === true;
      let bodyDigest=null;
      if(mailSafe){
        try {
          const {apiKey:_secret,...withoutKey}=mail;
          const plan=buildD06D2AOfflinePlan({config:{...withoutKey,enabled:true,
            dailyLimit:Math.min(mail.dailyLimit,30),monthlyLimit:Math.min(mail.monthlyLimit,900)},
            recipient:[...mail.allowlist][0]});
          if(plan.body?.headers?.['X-Sib-Sandbox'] === 'drop' &&
            plan.canExecuteVendorRequest===false && plan.canDeliverEmail===false)bodyDigest=plan.bodyDigest;
        }catch{ /* diagnostics must never send or elevate configuration */ }
      }
      let db, started=false;
      try {
        db=await pool.connect();
        await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');started=true;
        await db.query('SET LOCAL statement_timeout = 5000');
        const migrations=await db.query(`SELECT COUNT(*)::integer AS total FROM public.schema_migrations
          WHERE (name=$1 AND BTRIM(checksum)=$2) OR (name=$3 AND BTRIM(checksum)=$4)`,
          ['050_phase34_p1_08_mail_sandbox_review_ledger.sql',G6C_050_CHECKSUM,
           '051_phase34_p1_08_brevo_sandbox_one_shot_claim.sql',G6D051_CHECKSUM]);
        const triggers=await db.query(`SELECT COUNT(*)::integer AS total FROM pg_trigger
          WHERE NOT tgisinternal AND tgenabled='O' AND (
            (tgrelid='public.app_mail_sandbox_one_shot_claim'::regclass AND tgname=ANY($1::text[])) OR
            (tgrelid=ANY(ARRAY['public.app_mail_sandbox_review_reservations'::regclass,
              'public.app_mail_sandbox_review_audit'::regclass]) AND tgname=ANY($2::text[])))`,[
          ['app_mail_sandbox_one_shot_claim_immutable_trigger','app_mail_sandbox_one_shot_claim_no_truncate'],
          ['app_mail_sandbox_review_audit_immutable_trigger','app_mail_sandbox_review_audit_no_truncate',
           'app_mail_sandbox_review_terminal_trigger','app_mail_sandbox_review_no_delete_trigger',
           'app_mail_sandbox_review_reservation_no_truncate']]);
        const claim=await db.query('SELECT COUNT(*)::integer AS total FROM public.app_mail_sandbox_one_shot_claim');
        const outbox=await db.query(`SELECT id,state,event_key,last_error_code,recipient_email,
          updated_at,attempt_count,lease_owner,lease_expires_at,provider_message_id
          FROM public.app_mail_outbox WHERE id=5`);
        const x=outbox.rows[0];
        let optOutAuditCount=0;
        if(x?.state==='cancelled' && x?.last_error_code==='mail_admin_opted_out' &&
           x?.recipient_email && x?.updated_at){
          const optout=await db.query(`SELECT COUNT(*)::integer AS total
            FROM public.app_admin_identity_registry a JOIN public.app_admin_mail_preference_audit p
              ON p.target_admin_key=a.firebase_uid
            WHERE lower(a.auth_email)=lower($1) AND a.status='active'
              AND a.mail_notifications_enabled=FALSE
              AND p.previous_enabled=TRUE AND p.new_enabled=FALSE
              AND p.created_at BETWEEN $2::timestamptz - INTERVAL '2 minutes'
                AND $2::timestamptz + INTERVAL '2 minutes'`,[x.recipient_email,x.updated_at]);
          optOutAuditCount=total(optout);
        }
        const attempts=await db.query(`SELECT COUNT(*)::integer AS total
          FROM public.app_mail_delivery_attempts WHERE mail_outbox_id=5`);
        const latest=await db.query(`SELECT review_result FROM public.app_mail_preflight_reviews ORDER BY id DESC LIMIT 1`);
        const held=await db.query(`SELECT id,state,provider,actor_clerk_user_id,reauth_digest,
          body_digest,verdict,settled_at,provider_id_digest
          FROM public.app_mail_sandbox_review_reservations WHERE id=1`);
        await db.query('ROLLBACK');started=false; // explicit end of READ ONLY snapshot
        // Return only booleans; no raw rows, Clerk IDs, digests or recipients.
        return evaluateG6D051ReadOnlyEvidence({migrationCount:total(migrations),
          triggerCount:total(triggers),claimCount:total(claim),outbox:x,optOutAuditCount,
          deliveryAttemptCount:total(attempts),latestReview:latest.rows[0]?.review_result,
          held:held.rows[0],proof,bodyDigest,mailSafe:Boolean(mailSafe&&bodyDigest)});
      }catch{
        if(started)await db?.query('ROLLBACK').catch(()=>{});
        throw reject('g6d_readonly_database_unavailable',503);
      }finally{db?.release();}
    },
  });
}
