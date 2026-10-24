// Phase 34 P1-08 D06-D2B-G1: read-only, OFFLINE evidence/review gate.
// Operator assertions are NOT independently verified and cannot authorize HTTP.
// This module has no transport, environment, secrets, Outbox or database access.
import {createHash} from 'node:crypto';
import {inspectD06D2BProviderPlan, P108_D06D2B_PREP_REAL_DELIVERY_LOCKED} from './mail-p108-d06d2b-provider-preservation.mjs';
import {P108_D06D2A_REAL_DELIVERY_LOCKED, buildD06D2AOfflinePlan} from './mail-p108-d06d2a-sandbox-gate.mjs';

export const P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED = true;
export const D06D2B_REGRESSION_DOMAINS = Object.freeze([
  'admin_auth', 'user_auth_device_trust', 'rental_lifecycle', 'asset_categories',
  'community_inquiry', 'site_settings', 'json_backup_restore', 'otp_mail_controls',
]);
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REAUTH_AGE_MS = 5 * 60 * 1000;
const reject = (code) => Object.assign(new Error(code), {code});
const sha256 = str => createHash('sha256').update(str).digest('hex');
const exactKeys = (value, keys) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|') &&
  Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value'));
const isoMillis = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return NaN;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && new Date(ts).toISOString() === value ? ts : NaN;
};
const validTime = (value, nowMs, maxAge) => {
  const ts = isoMillis(value);
  return Number.isFinite(ts) && ts <= nowMs && nowMs - ts <= maxAge;
};

// Evidence fields are intentionally exact to reject unintended secrets, PII,
// assertions about unrelated resources, and undeclared action parameters.
export function inspectD06D2BGate1({config, recipient, evidence, now} = {}) {
  const blockers = [];
  if (P108_D06D2B_PREP_REAL_DELIVERY_LOCKED !== true ||
      P108_D06D2A_REAL_DELIVERY_LOCKED !== true || P108_D06D2B_GATE1_REAL_DELIVERY_LOCKED !== true) {
    blockers.push('source_lock_missing');
  }
  let preview = null;
  try {
    const p = inspectD06D2BProviderPlan({requestedProvider: 'brevo', config, recipient});
    if (!p.canBuildBrevoSandboxPreview) blockers.push('sandbox_policy_failed');
    else preview = p.preview;
    if (p.canExecuteVendorRequest !== false || p.canDeliverEmail !== false ||
        p.canAutoFallback !== false || p.canSwitchProvider !== false ||
        p.retainedStandbyProvider !== 'resend') blockers.push('provider_preservation_violation');
  } catch { blockers.push('sandbox_policy_failed'); }
  const at = isoMillis(now);
  if (!Number.isFinite(at)) blockers.push('review_time_invalid');
  const validEnvelope = exactKeys(evidence, [
    'source', 'observedAt', 'stagingBuild', 'reviewerRole', 'reauthenticatedAt',
    'regression', 'outbox', 'backup',
  ]);
  if (!validEnvelope || evidence.source !== 'operator_attestation' || evidence.stagingBuild !== 'v299') {
    blockers.push('operator_attestation_invalid');
  }
  if (!validTime(evidence?.observedAt, at, MAX_AGE_MS)) blockers.push('staging_evidence_missing_or_stale');
  if (evidence?.reviewerRole !== 'super_admin' ||
      !validTime(evidence?.reauthenticatedAt, at, REAUTH_AGE_MS)) blockers.push('recent_super_admin_reauth_missing');
  if (!exactKeys(evidence?.regression, D06D2B_REGRESSION_DOMAINS) ||
      D06D2B_REGRESSION_DOMAINS.some(name => evidence.regression[name] !== true)) {
    blockers.push('eight_area_regression_unverified');
  }
  if (!exactKeys(evidence?.outbox, ['id','eventType','status','reviewedReadOnly','mutationPerformed']) ||
      evidence.outbox.id !== 5 || evidence.outbox.eventType !== 'admin_signup_pending' ||
      !['queued', 'reviewed_locked'].includes(evidence.outbox.status) ||
      evidence.outbox.reviewedReadOnly !== true || evidence.outbox.mutationPerformed !== false) {
    blockers.push('outbox_five_review_missing');
  }
  if (!exactKeys(evidence?.backup, ['reviewedReadOnly', 'status', 'verifiedAt']) ||
      evidence.backup.reviewedReadOnly !== true || evidence.backup.status !== 'Completed' ||
      !validTime(evidence.backup.verifiedAt, at, MAX_AGE_MS)) {
    blockers.push('recent_backup_review_missing');
  }
  const uniqueBlockers = Object.freeze([...new Set(blockers)].sort());
  return Object.freeze({
    mode: 'OFFLINE_OPERATOR_EVIDENCE_REVIEW_ONLY',
    operatorAttestationComplete: uniqueBlockers.length === 0,
    // Do not promote operator-provided assertions to independently proven facts.
    externallyVerified: false,
    readyForIndependentHumanReview: uniqueBlockers.length === 0,
    actualProviderApprovalGranted: false,
    canExecuteVendorRequest: false,
    canClaimOrModifyOutbox: false,
    canSendRealMail: false,
    canAutoFallbackToResend: false,
    retainedProviders: Object.freeze(['brevo','resend']),
    blockers: uniqueBlockers,
    // Prevent exposing recipient, account data or other evidence in audit output.
    syntheticBodyDigest: preview?.bodyDigest ?? null,
  });
}

export function createD06D2BGate1OfflineRecord({config, recipient, evidence, now} = {}) {
  const review = inspectD06D2BGate1({config, recipient, evidence, now});
  if (!review.operatorAttestationComplete) throw reject(review.blockers[0]);
  const plan = buildD06D2AOfflinePlan({config, recipient});
  // No caller-supplied ID, address, audit payload, secret, or vendor response is logged.
  const evidenceDigest = sha256(JSON.stringify({
    source: evidence.source, observedAt: evidence.observedAt, stagingBuild: evidence.stagingBuild,
    reviewerRole: evidence.reviewerRole, reauthenticatedAt: evidence.reauthenticatedAt,
    regression: D06D2B_REGRESSION_DOMAINS.map(key => evidence.regression[key]),
    outbox: [evidence.outbox.id, evidence.outbox.eventType, evidence.outbox.status,
      evidence.outbox.reviewedReadOnly, evidence.outbox.mutationPerformed],
    backup: [evidence.backup.reviewedReadOnly, evidence.backup.status, evidence.backup.verifiedAt],
  }));
  return Object.freeze({
    event: 'phase34.d06d2b.gate1.offline_review', schemaVersion: 1,
    evidenceSource: 'operator_attestation_unverified', evidenceDigest,
    syntheticBodyDigest: plan.bodyDigest, senderDomain: 'mail.notebook.recruit.kro.kr',
    availableProviders: Object.freeze(['brevo','resend']),
    vendorRequestsExecuted: 0, realEmailsSent: 0,
    isAuthenticatedPermissionGrant: false, allowsVendorCall: false,
    requiresIndependentStagingVerification: true,
    requiresSeparateSandboxApproval: true,
    requiresSeparateLiveDeliveryApproval: true,
  });
}
