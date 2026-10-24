// Phase 34 P1-08 G6-C: transport-free one-shot approval REVIEW CONTRACT.
// NOT a network authorization, NOT a durable one-shot ledger, NOT imported by
// any HTTP route, Outbox, dispatcher or provider. Schema 050 remains DRAFT.
import {createHash} from 'node:crypto';
import {inspectG6SandboxReadiness,G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED}
  from './mail-p108-g6-brevo-readiness.mjs';
import {buildD06D2AOfflinePlan,validateD06D2ASandboxPayload}
  from './mail-p108-d06d2a-sandbox-gate.mjs';
import {P103_REAL_DELIVERY_LOCKED} from './mail-dynoweb-dispatcher.mjs';
import {P108_REAL_DELIVERY_LOCKED} from './mail-p108-protected-bridge.mjs';
import {P108_D06_LIVE_DELIVERY_LOCKED} from './mail-p108-preflight-control.mjs';

export const G6C_NETWORK_AND_LIVE_DELIVERY_LOCKED=true;
const SHA=/^[0-9a-f]{40}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVIDENCE_AGE_MS=24*60*60*1000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const sortedUnique=list=>Object.freeze([...new Set(list)].sort());
const safeStr=value=>typeof value==='string' ? value.trim():'';

// Operator-supplied evidence is deliberately NOT trusted. An offline REVIEW
// cannot grant permissions regardless of its result. The eventual live gate
// must re-read current commit/release/backup/Outbox from trusted server sources,
// verify signed Clerk+PostgreSQL authority, and write an immutable unique record
// in a SINGLE DB transaction BEFORE any separately approved network request.
export function inspectG6COfflineApprovalReview({mailConfig, recipient,
  proposedApprovalId, evidence, nowMs=Date.now()}={}){
  const blockers=[];
  const readiness=inspectG6SandboxReadiness(mailConfig);
  if(!readiness.syntheticPlanReady)blockers.push('g6c_readiness_blocked');
  if(mailConfig?.environment!=='staging')blockers.push('g6c_staging_only');
  if(mailConfig?.enabled!==false||mailConfig?.liveSendingReady!==false)
    blockers.push('g6c_live_delivery_must_be_off');
  if(!(mailConfig?.allowlist instanceof Set)||mailConfig.allowlist.size!==1)
    blockers.push('g6c_exactly_one_allowlisted_recipient');
  if(typeof recipient!=='string'||!mailConfig?.allowlist?.has(recipient))
    blockers.push('g6c_recipient_not_in_allowlist');
  if(!UUID.test(safeStr(proposedApprovalId)))blockers.push('g6c_approval_uuid_required');
  if(!SHA.test(safeStr(evidence?.gitCommit)))blockers.push('g6c_git_commit_invalid');
  if(typeof evidence?.releaseVersion!=='string'||!/^v[1-9]\d{0,7}$/.test(evidence.releaseVersion))
    blockers.push('g6c_release_version_invalid');
  if(evidence?.deploymentMatchesServer!==true)
    blockers.push('g6c_independent_deployment_confirmation_needed');
  if(evidence?.backupsAndOutboxReviewed!==true)
    blockers.push('g6c_independent_backup_outbox_review_needed');
  if(evidence?.brevoSenderReviewedInConsole!==true||
    evidence?.brevoTransactionalApiReviewedInConsole!==true)
    blockers.push('g6c_independent_brevo_console_review_needed');
  if(evidence?.sandboxOnlyHumanApproval!==true)
    blockers.push('g6c_explicit_one_time_sandbox_approval_needed');
  const observedAt=Date.parse(safeStr(evidence?.observedAt));
  if(!Number.isSafeInteger(nowMs)||!Number.isFinite(observedAt)||
     observedAt>nowMs||nowMs-observedAt>MAX_EVIDENCE_AGE_MS)
    blockers.push('g6c_evidence_not_current');
  if([G6_VENDOR_NETWORK_LOCKED,G6_LIVE_MAIL_LOCKED,G6C_NETWORK_AND_LIVE_DELIVERY_LOCKED,
    P103_REAL_DELIVERY_LOCKED,P108_REAL_DELIVERY_LOCKED,P108_D06_LIVE_DELIVERY_LOCKED]
    .some(flag=>flag!==true))blockers.push('g6c_global_delivery_lock_invalid');
  let syntheticBodyDigest=null;
  if(readiness.syntheticPlanReady && mailConfig?.allowlist?.size===1 &&
     mailConfig.allowlist.has(recipient)){
    // Build from a transient secret-free D06-D2A OFFLINE-only contract. The
    // existing application MAIL_ENABLED=false setting is never mutated.
    const {apiKey:_neverPassed,...safeConfig}=mailConfig;
    const trialConfig={...safeConfig,enabled:true,
      dailyLimit:Math.min(safeConfig.dailyLimit,30),
      monthlyLimit:Math.min(safeConfig.monthlyLimit,900)};
    try {
      const plan=buildD06D2AOfflinePlan({config:trialConfig,recipient});
      validateD06D2ASandboxPayload(plan.body,recipient);
      if(plan.canExecuteVendorRequest!==false||plan.canDeliverEmail!==false)
        blockers.push('g6c_synthetic_contract_unsafe');
      else syntheticBodyDigest=plan.bodyDigest;
    }catch{blockers.push('g6c_synthetic_contract_invalid');}
  }
  const reviewOnly=blockers.length===0;
  return Object.freeze({mode:'G6C_OFFLINE_NON_AUTHORIZING_REVIEW',
    reviewChecklistComplete:reviewOnly,
    operatorClaimsIndependentlyVerified:false,
    canCreateDurableApproval:false,canReserveNetworkAttempt:false,
    durableIdempotencyImplemented:false,
    approvalSchemaDeployed:false,approvedForNetwork:false,
    canInvokeBrevo:false,canSendRealMail:false,canAutoRetry:false,
    canUseResendFallback:false,canModifyOutbox:false,
    realProviderCalls:0,realEmailsSent:0,dbWrites:0,
    reviewDigest:syntheticBodyDigest,
    // Even a valid UUID is only a local proposed identity, not a permit.
    proposedApprovalDigest:UUID.test(safeStr(proposedApprovalId))
      ? digest('phase34.g6c.proposed-review-only:'+proposedApprovalId):null,
    blockers:sortedUnique(blockers),
    prerequisites:Object.freeze({
      signedClerkOwnerRecentReauth:true,
      independentServerEvidence:true,
      independentlyVerifiedBrevoSender:true,
      separateOneTimeOperatorApproval:true,
      reviewedAndAppliedSingleDbSchema:true,
      databaseUniqueReservationBeforeNetwork:true,
      noAutomaticRetry:true,
      networkExecutorNotImplemented:true,
    })});
}

export async function dispatchG6CNetwork(){
  throw Object.assign(new Error('g6c_network_execution_not_implemented'),{code:'g6c_network_execution_not_implemented',status:403});
}
export async function approveG6CNetwork(){
  throw Object.assign(new Error('g6c_approval_not_available'),{code:'g6c_approval_not_available',status:403});
}
