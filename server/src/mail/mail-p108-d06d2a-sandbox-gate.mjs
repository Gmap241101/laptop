// Phase 34 P1-08 D06-D2A: offline-only, transport-free Brevo sandbox gate.
// No network imports, no HTTP execution, no environment reads, no credentials,
// no queues, no database, and no runtime imports are present in this module.
import { createHash } from 'node:crypto';
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { P108_REAL_DELIVERY_LOCKED } from './mail-p108-protected-bridge.mjs';
import { P108_D06_LIVE_DELIVERY_LOCKED } from './mail-p108-preflight-control.mjs';
import { P108_D06D_REAL_DELIVERY_LOCKED, D06D_BREVO_DOMAIN, D06D_BREVO_SENDER } from './mail-p108-d06d1-brevo-sandbox.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';

export const P108_D06D2A_REAL_DELIVERY_LOCKED = true;
export const D06D2A_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const deny = (code) => Object.assign(new Error(code), { code });
const OWN_KEYS = (obj, expected) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join('|') === [...expected].sort().join('|');
const digest = (input) => createHash('sha256').update(input).digest('hex');
const lockOk = () => [P103_REAL_DELIVERY_LOCKED, P108_REAL_DELIVERY_LOCKED,
  P108_D06_LIVE_DELIVERY_LOCKED, P108_D06D_REAL_DELIVERY_LOCKED,
  P108_D06D2A_REAL_DELIVERY_LOCKED].every((item) => item === true);

export function inspectD06D2AOfflinePolicy({ config, recipient } = {}) {
  const blockers = [];
  if (!lockOk()) blockers.push('source_lock_invalid');
  if (config?.environment !== 'staging') blockers.push('staging_only');
  if (config?.provider !== 'brevo' || config?.enabled !== true) blockers.push('brevo_only');
  if (config?.sender !== D06D_BREVO_SENDER || D06D_BREVO_DOMAIN !== 'mail.notebook.recruit.kro.kr' ||
      config?.domainVerified !== true) blockers.push('sender_review_required');
  if (config?.liveSendingReady !== false) blockers.push('live_delivery_lock_required');
  // This module may not even be handed API keys. Secrets belong to an explicitly
  // approved, separate server-side integration, NOT an offline plan.
  if (config && ['apiKey', 'smtpKey', 'authorization', 'secret'].some((k) => Object.hasOwn(config, k))) {
    blockers.push('credentials_forbidden_offline');
  }
  // Defensive trial-only ceilings (not a ledger and not an assertion that the
  // Brevo account currently has credits). Always smaller than free ceilings.
  if (!Number.isSafeInteger(config?.dailyLimit) || config.dailyLimit < 1 || config.dailyLimit > 30 ||
      !Number.isSafeInteger(config?.monthlyLimit) || config.monthlyLimit < 1 || config.monthlyLimit > 900) {
    blockers.push('trial_limits_invalid');
  }
  const to = parseMailAddress(recipient);
  if (!(config?.allowlist instanceof Set) || config.allowlist.size < 1 || config.allowlist.size > 5 ||
    [...(config?.allowlist instanceof Set ? config.allowlist : [])].some((x) => parseMailAddress(x) !== x) ||
    !to || !config?.allowlist?.has(to)) blockers.push('recipient_not_approved');
  return Object.freeze({ mode: 'OFFLINE_INSPECTION_ONLY', canBuildSynthetic: blockers.length === 0,
    canExecuteVendorRequest: false, canDeliverEmail: false, canClaimOutbox: false,
    canGrantSendingApproval: false, blockers: Object.freeze([...new Set(blockers)].sort()) });
}

export function validateD06D2ASandboxPayload(payload, recipient) {
  const to = parseMailAddress(recipient);
  if (!to || !OWN_KEYS(payload, ['sender','to','subject','textContent','headers']) ||
    !OWN_KEYS(payload.sender, ['email','name']) ||
    payload.sender.email !== D06D_BREVO_SENDER || payload.sender.name !== 'Rental System' ||
    !Array.isArray(payload.to) || payload.to.length !== 1 ||
    !OWN_KEYS(payload.to[0], ['email']) || payload.to[0].email !== to ||
    !OWN_KEYS(payload.headers, ['X-Sib-Sandbox']) || payload.headers['X-Sib-Sandbox'] !== 'drop' ||
    payload.subject !== '[SANDBOX] Rental System Contract Check' ||
    payload.textContent !== 'Synthetic offline test only. No customer data. No email delivery.') {
    throw deny('unsafe_sandbox_payload');
  }
  return true;
}

export function buildD06D2AOfflinePlan({ config, recipient } = {}) {
  const policy = inspectD06D2AOfflinePolicy({ config, recipient });
  if (!policy.canBuildSynthetic) throw deny(policy.blockers[0]);
  const to = parseMailAddress(recipient);
  // Strict allow-by-construction; caller cannot add extra recipients, body,
  // attachments, template IDs, scheduling, tags, or override the sandbox flag.
  const payload = Object.freeze({
    sender: Object.freeze({ email: D06D_BREVO_SENDER, name: 'Rental System' }),
    to: Object.freeze([Object.freeze({ email: to })]),
    subject: '[SANDBOX] Rental System Contract Check',
    textContent: 'Synthetic offline test only. No customer data. No email delivery.',
    headers: Object.freeze({ 'X-Sib-Sandbox': 'drop' }),
  });
  validateD06D2ASandboxPayload(payload, to);
  return Object.freeze({
    mode: 'OFFLINE_SPECIFICATION_NOT_HTTP',
    endpoint: D06D2A_ENDPOINT,
    method: 'POST',
    body: payload,
    bodyDigest: digest(JSON.stringify(payload)),
    headerPlacement: 'JSON_BODY_HEADERS',
    requiresSeparateApproval: true,
    vendorRequestsExecuted: 0,
    emailsDelivered: 0,
    canExecuteVendorRequest: false,
    canDeliverEmail: false,
  });
}

export function classifyD06D2AMockOutcome({ status, body } = {}) {
  // This classifier never invokes a request. status and body are offline test
  // fixtures, not evidence of an actual vendor response.
  let verdict = 'uncertain_quarantine';
  let providerIdDigest = null;
  if (status === 201 && body && typeof body === 'object' && !Array.isArray(body) &&
      typeof body.messageId === 'string' && body.messageId.length >= 3 && body.messageId.length <= 255 &&
      !/[\u0000-\u001f\u007f]/.test(body.messageId)) {
    verdict = 'sandbox_simulated_acceptance';
    providerIdDigest = digest(body.messageId);
  } else if (status === 429) {
    verdict = 'rate_limited_manual_review';
  } else if ([400, 401, 403, 404, 422].includes(status)) {
    verdict = 'rejected_manual_review';
  }
  return Object.freeze({ mode: 'OFFLINE_MOCK_CLASSIFICATION', verdict,
    sandboxAccepted: verdict === 'sandbox_simulated_acceptance',
    providerIdDigest, deliveryConfirmed: false, networkRequestsExecuted: 0,
    realEmailsSent: 0, automaticRetryAllowed: false,
    requiresHumanReview: verdict !== 'sandbox_simulated_acceptance' });
}

export function createD06D2ASafeAudit({ plan, outcome } = {}) {
  if (!plan || plan.mode !== 'OFFLINE_SPECIFICATION_NOT_HTTP' ||
      !/^[0-9a-f]{64}$/.test(String(plan.bodyDigest || '')) ||
      !outcome || outcome.mode !== 'OFFLINE_MOCK_CLASSIFICATION') throw deny('offline_audit_input_invalid');
  return Object.freeze({ event: 'phase34.d06d2a.offline_mock', schemaVersion: 1,
    syntheticBodyDigest: plan.bodyDigest, verdict: outcome.verdict,
    providerIdDigest: outcome.providerIdDigest, realVendorRequests: 0,
    realEmailsSent: 0, deliveryConfirmed: false, authorizedToSend: false });
}
