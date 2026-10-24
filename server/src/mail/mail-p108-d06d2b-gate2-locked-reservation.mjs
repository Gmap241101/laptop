// Phase34 P1-08 D06-D2B-G2. ISOLATED: NOT imported by routes, workers or dispatcher.
// This is a transaction/audit CONTRACT for review-only synthetic sandbox fixtures.
// There is deliberately no API key, HTTP, mail sender, dispatcher or Outbox claim.
import {createHash} from 'node:crypto';
import {requireMailPreflightReverification} from './mail-p108-preflight-control.mjs';
import {inspectD06D2AOfflinePolicy,buildD06D2AOfflinePlan,classifyD06D2AMockOutcome} from './mail-p108-d06d2a-sandbox-gate.mjs';
import {P108_D06D2B_PREP_REAL_DELIVERY_LOCKED} from './mail-p108-d06d2b-provider-preservation.mjs';
import {P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED} from './mail-p108-d06d2b-gate1-review.mjs';

export const P108_D06D2B_GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED = true;
export const D06D2B_GATE2_PROVIDERS = Object.freeze(['brevo','resend']);
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err=(code,status=403)=>Object.assign(new Error(code),{code,status});
const sha=(v)=>createHash('sha256').update(v).digest('hex');
const requiredLock=()=>P108_D06D2B_PREP_REAL_DELIVERY_LOCKED===true &&
  P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED===true &&
  P108_D06D2B_GATE2_VENDOR_AND_LIVE_DELIVERY_LOCKED===true;
function assertSelectedConfig(config,recipient) {
  if(!requiredLock())throw err('gate2_hard_lock_invalid');
  const policy=inspectD06D2AOfflinePolicy({config,recipient});
  if(!policy.canBuildSynthetic)throw err('gate2_sandbox_policy_blocked');
  const plan=buildD06D2AOfflinePlan({config,recipient});
  if(plan.canExecuteVendorRequest!==false || plan.canDeliverEmail!==false ||
      !HASH.test(plan.bodyDigest))throw err('gate2_preview_invalid');
  return plan;
}
// This declaration does NOT verify the context: the authenticated server MUST
// provide both callbacks after independent Clerk and Staging checks. No caller-
// supplied operator attestation from G1 can substitute for these callbacks.
export function createD06D2BGate2LockedRepository(pool,{verifyServerAuthority,verifyIndependentEvidence,getServerMailConfig,verifySyntheticFixture}={}) {
  if(typeof pool?.connect!=='function' || typeof verifyServerAuthority!=='function' ||
      typeof verifyIndependentEvidence!=='function' || typeof getServerMailConfig!=='function' ||
      typeof verifySyntheticFixture!=='function')
    throw new TypeError('gate2_trusted_server_dependencies_required');
  async function transaction(fn) {
    const db=await pool.connect();let started=false;
    try {
      await db.query('BEGIN');started=true;
      await db.query('SET LOCAL statement_timeout = 5000');
      const value=await fn(db);
      await db.query('COMMIT');started=false;
      return value;
    } catch(ex){if(started)await db.query('ROLLBACK').catch(()=>{});throw ex;}
    finally{db.release();}
  }
  return Object.freeze({
    // Reservations are HELD_LOCKED, never a vendor-dispatch permit.
    async reserveReviewOnly({requestContext,approvalId,recipient}={}) {
      if(!UUID.test(String(approvalId||'')))throw err('gate2_approval_identity_invalid',400);
      if(typeof recipient!=='string')throw err('gate2_recipient_invalid',400);
      const authority=await verifyServerAuthority(requestContext);
      const proof=requireMailPreflightReverification(authority);
      if(!proof || !HASH.test(proof.verificationDigest)||!HASH.test(proof.sessionDigest))
        throw err('gate2_trusted_reauthentication_invalid');
      const approvalDigest=sha('phase34.g2.approval.v1:'+approvalId);
      return transaction(async(db)=>{
        await db.query("SELECT pg_advisory_xact_lock(hashtext('phase34-p108-g2-global-review-only'))");
        // The callback MUST read independent evidence from the supplied DB client
        // under this same transaction; stale operator statements are insufficient.
        const independent=await verifyIndependentEvidence({db,requestContext,actorId:proof.actorId,approvalId});
        if(!independent || independent.verifiedByServer!==true || independent.stagingRegression8of8!==true ||
           independent.outboxFiveReviewedReadOnly!==true || independent.backupIndependentlyVerified!==true ||
           independent.sandboxOnlyExplicitApproval!==true || independent.approvalId!==approvalId ||
           independent.production!==false)throw err('gate2_independent_approval_missing');
        const config=await getServerMailConfig(requestContext,{db});
        const plan=assertSelectedConfig(config,recipient);
        // Requires the separately reviewed schema DRAFT, not currently deployed.
        // Unique approval_digest and reauth_digest guarantee one reservation per
        // approval/reauth even with simultaneous requests across web dynos.
        const result=await db.query(`INSERT INTO app_mail_sandbox_review_reservations
          (approval_digest,actor_clerk_user_id,reauth_digest,session_digest,body_digest,provider,state)
          VALUES ($1,$2,$3,$4,$5,'brevo','held_locked')
          ON CONFLICT DO NOTHING RETURNING id`,
          [approvalDigest,proof.actorId,proof.verificationDigest,proof.sessionDigest,plan.bodyDigest]);
        if(result.rows.length!==1)throw err('gate2_approval_or_reauth_already_reserved',409);
        const id=String(result.rows[0].id);
        await db.query(`INSERT INTO app_mail_sandbox_review_audit
          (reservation_id,event,actor_clerk_user_id,payload_digest)
          VALUES ($1,'review_held', $2, $3)`,[id,proof.actorId,plan.bodyDigest]);
        return Object.freeze({reservationId:id,state:'held_locked',provider:'brevo',
          retainedProviders:D06D2B_GATE2_PROVIDERS,bodyDigest:plan.bodyDigest,
          approvalGrantedForVendorCall:false,canDeliverEmail:false,canClaimOutbox:false,
          canAutoFallback:false,networkCallsExecuted:0});
      });
    },
    // G3 SECURITY FIX: settlement requires the same recently reauthenticated owner,
    // reservation actor, session and reauthentication digest as the reservation.
    // Caller's fixture is not authoritative; trusted offline registry callback
    // must independently verify it. Still NO real provider response or HTTP.
    async settleMockOnly({requestContext,reservationId,fixture}={}) {
      if(!/^[1-9]\d{0,18}$/.test(String(reservationId||'')))throw err('gate2_reservation_id_invalid',400);
      if(!fixture || fixture.mode!=='synthetic_fixture' || !Number.isInteger(fixture.status) ||
         Object.keys(fixture).sort().join('|')!=='body|mode|status')
        throw err('gate2_offline_fixture_required',400);
      const authority=await verifyServerAuthority(requestContext);
      const proof=requireMailPreflightReverification(authority);
      if(!proof || !HASH.test(proof.verificationDigest)||!HASH.test(proof.sessionDigest))
        throw err('gate2_trusted_reauthentication_invalid');
      return transaction(async(db)=>{
        await db.query("SELECT pg_advisory_xact_lock(hashtext('phase34-p108-g2-global-review-only'))");
        const trusted=await verifySyntheticFixture({db,requestContext,reservationId:String(reservationId),
          actorId:proof.actorId,fixture});
        if(!trusted || trusted.verifiedByServer!==true ||
            trusted.source!=='trusted_offline_registry' || trusted.provider!=='brevo' ||
            trusted.reservationId!==String(reservationId) ||
            trusted.mode!=='synthetic_fixture' || trusted.status!==fixture.status ||
            JSON.stringify(trusted.body)!==JSON.stringify(fixture.body))
          throw err('gate2_trusted_fixture_required');
        const outcome=classifyD06D2AMockOutcome({status:trusted.status,body:trusted.body});
        const state=outcome.verdict==='sandbox_simulated_acceptance'?'simulated_accepted':
          outcome.verdict==='uncertain_quarantine'?'uncertain_quarantine':'manual_review';
        const changed=await db.query(`UPDATE app_mail_sandbox_review_reservations
          SET state=$2,verdict=$3,provider_id_digest=$4,settled_at=NOW()
          WHERE id=$1::bigint AND state='held_locked'
            AND actor_clerk_user_id=$5 AND reauth_digest=$6 AND session_digest=$7
          RETURNING id,actor_clerk_user_id,body_digest`,
          [reservationId,state,outcome.verdict,outcome.providerIdDigest,
           proof.actorId,proof.verificationDigest,proof.sessionDigest]);
        if(changed.rows.length!==1)throw err('gate2_reservation_missing_owner_or_terminal',409);
        const row=changed.rows[0];
        await db.query(`INSERT INTO app_mail_sandbox_review_audit
          (reservation_id,event,actor_clerk_user_id,payload_digest)
          VALUES ($1,$2,$3,$4)`,[reservationId,state,row.actor_clerk_user_id,row.body_digest]);
        return Object.freeze({reservationId:String(reservationId),state,verdict:outcome.verdict,
          providerIdDigest:outcome.providerIdDigest,requiresManualReview:state!=='simulated_accepted',
          automaticRetryAllowed:false,approvalGrantedForVendorCall:false,canDeliverEmail:false,
          realNetworkCallsExecuted:0});
      });
    },
    async dispatch(){throw err('gate2_vendor_dispatch_permanently_locked');},
    async retry(){throw err('gate2_automatic_retry_forbidden');},
  });
}

export function inspectD06D2BGate2StaticContract({config,recipient}={}) {
  const plan=assertSelectedConfig(config,recipient);
  return Object.freeze({mode:'OFFLINE_REVIEW_RESERVATION_CONTRACT',provider:'brevo',
    retainedProviders:D06D2B_GATE2_PROVIDERS,bodyDigest:plan.bodyDigest,
    requiresServerVerifiedClerkReauthentication:true,requiresIndependentStagingProof:true,
    requiresSeparateSandboxNetworkApproval:true,requiresReviewedSchemaMigration:true,
    requiresDurableDatabaseTransaction:true,canExecuteVendorRequest:false,
    canSendMail:false,canClaimOutbox:false,canAutoFallback:false});
}
