// G6-C Stage 1: database-backed HELD-LOCKED review ledger.
// This module is deliberately NOT wired to app.mjs, index.mjs, a scheduled job,
// an Outbox, or a provider. A reservation is NOT a Brevo send authorization.
// The schema remains DRAFT_NOT_DEPLOY and must be approved separately.
import {createHash} from 'node:crypto';
import {createD06D2BG5TrustedClerkAuthority} from './mail-p108-d06d2b-g5-clerk-binding.mjs';
import {requireMailPreflightReverification} from './mail-p108-preflight-control.mjs';
import {inspectG6SandboxReadiness} from './mail-p108-g6-brevo-readiness.mjs';
import {buildD06D2AOfflinePlan,validateD06D2ASandboxPayload} from './mail-p108-d06d2a-sandbox-gate.mjs';

export const G6C_DURABLE_REVIEW_VENDOR_LOCKED=true;
export const G6C_DURABLE_REVIEW_SCHEMA_DEPLOYED=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=value=>createHash('sha256').update(value).digest('hex');
const reject=(code,status=403)=>Object.assign(new Error(code),{code,status});

// verifyIndependentEvidence must be a SERVER-OWNED callback. No evidence from
// request JSON is accepted. In the future, a reviewer-approved evidence store
// can implement this callback; no such store is wired in this deployment.
export function createG6CHeldLockedLedger({pool,clerkJwtConfig,adminClerkAuthService,
  getServerMailConfig,verifyIndependentEvidence}={}) {
  if(clerkJwtConfig?.appEnv!=='staging' || typeof pool?.connect!=='function' ||
     typeof getServerMailConfig!=='function' || typeof verifyIndependentEvidence!=='function')
    throw new TypeError('g6c_staging_trusted_dependencies_required');
  const owner=createD06D2BG5TrustedClerkAuthority({clerkJwtConfig,adminClerkAuthService});
  async function transaction(action) {
    const db=await pool.connect();let active=false;
    try {
      await db.query('BEGIN');active=true;
      await db.query('SET LOCAL statement_timeout = 5000');
      await db.query("SELECT pg_advisory_xact_lock(hashtext('phase34-p108-g6c-review-held-lock'))");
      const value=await action(db);
      await db.query('COMMIT');active=false;
      return value;
    } catch(error) {
      if(active)await db.query('ROLLBACK').catch(()=>{});
      if(error?.code==='23505')throw reject('g6c_review_replay_or_reauth_reused',409);
      throw error;
    } finally {db.release();}
  }
  return Object.freeze({
    async reserveHeldLocked({httpRequest,proposedApprovalId}={}) {
      if(typeof proposedApprovalId!=='string'||!UUID.test(proposedApprovalId))
        throw reject('g6c_review_uuid_invalid',400);
      const verified=await owner.verifyServerAuthority({httpRequest});
      const proof=requireMailPreflightReverification(verified);
      const config=getServerMailConfig();
      const readiness=inspectG6SandboxReadiness(config);
      if(config?.environment!=='staging' || config?.enabled!==false ||
         config?.liveSendingReady!==false || !readiness.syntheticPlanReady ||
         !(config?.allowlist instanceof Set) || config.allowlist.size!==1)
        throw reject('g6c_review_mail_safety_blocked');
      const recipient=[...config.allowlist][0];
      const {apiKey:_redacted,...safeConfig}=config;
      const trial={...safeConfig,enabled:true,
        dailyLimit:Math.min(config.dailyLimit,30),
        monthlyLimit:Math.min(config.monthlyLimit,900)};
      const plan=buildD06D2AOfflinePlan({config:trial,recipient});
      validateD06D2ASandboxPayload(plan.body,recipient);
      if(plan.canExecuteVendorRequest!==false||plan.canDeliverEmail!==false)
        throw reject('g6c_review_synthetic_plan_unsafe');
      const approvalDigest=sha('phase34.g6c.held_review.v1:'+proposedApprovalId);
      // The one-shot property protects the ledger from repeated reservations.
      // It does not authorize a subsequent external API call.
      return transaction(async db=>{
        const outbox=await db.query(`SELECT id,state,attempt_count,lease_owner,lease_expires_at,
          provider_message_id FROM app_mail_outbox WHERE id=5 FOR SHARE`);
        const record=outbox.rows[0];
        if(outbox.rows.length!==1 || String(record.id)!=='5' || record.state!=='queued' ||
           Number(record.attempt_count)!==0 || record.lease_owner!=null ||
           record.lease_expires_at!=null || record.provider_message_id!=null)
          throw reject('g6c_outbox_five_lock_invalid');
        const attempts=await db.query(`SELECT COUNT(*)::integer AS total
          FROM app_mail_delivery_attempts WHERE mail_outbox_id=5`);
        if(Number(attempts.rows[0]?.total)!==0)
          throw reject('g6c_outbox_five_attempts_detected');
        const preflight=await db.query(`SELECT review_result,created_at FROM app_mail_preflight_reviews
          ORDER BY id DESC LIMIT 1`);
        if(preflight.rows.length!==1 || preflight.rows[0].review_result!=='reviewed_locked')
          throw reject('g6c_preflight_not_reviewed_locked');
        const independent=await verifyIndependentEvidence({db,actorId:proof.actorId,
          approvalId:proposedApprovalId,bodyDigest:plan.bodyDigest});
        if(independent?.verifiedByServer!==true || independent?.stagingOnly!==true ||
           independent?.backupVerified!==true || independent?.brevoConsoleReviewed!==true ||
           independent?.explicitSandboxOnlyReview!==true ||
           independent?.approvalId!==proposedApprovalId ||
           independent?.bodyDigest!==plan.bodyDigest)
          throw reject('g6c_independent_evidence_not_approved');
        const inserted=await db.query(`INSERT INTO app_mail_sandbox_review_reservations
          (approval_digest,actor_clerk_user_id,reauth_digest,session_digest,
           body_digest,provider,state)
          VALUES ($1,$2,$3,$4,$5,'brevo','held_locked')
          ON CONFLICT DO NOTHING RETURNING id`,
          [approvalDigest,proof.actorId,proof.verificationDigest,proof.sessionDigest,plan.bodyDigest]);
        if(inserted.rows.length!==1)
          throw reject('g6c_review_replay_or_reauth_reused',409);
        await db.query(`INSERT INTO app_mail_sandbox_review_audit
          (reservation_id,event,actor_clerk_user_id,payload_digest)
          VALUES ($1,'review_held',$2,$3)`,
          [inserted.rows[0].id,proof.actorId,plan.bodyDigest]);
        return Object.freeze({reservationId:String(inserted.rows[0].id),
          state:'held_locked',provider:'brevo',reviewOnly:true,
          canExecuteVendorRequest:false,canSendMail:false,
          canAutoRetry:false,canUseResendFallback:false,canModifyOutbox:false,
          networkRequests:0,realEmailsSent:0});
      });
    },
    async approveNetwork(){throw reject('g6c_network_approval_not_implemented');},
    async dispatch(){throw reject('g6c_vendor_dispatch_locked');},
    async retry(){throw reject('g6c_no_auto_retry');},
    async changeOutbox(){throw reject('g6c_outbox_mutation_forbidden');},
  });
}
