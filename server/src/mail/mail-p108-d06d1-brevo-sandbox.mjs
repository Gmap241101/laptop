// Phase 34 P1-08 D06-D1: offline contract for Brevo transactional sandbox.
// There is NO network transport, no Outbox claim, no live send, and no runtime import.
// D06-D2 requires separate explicit approval, authenticated authorization, and live tests.
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { P108_REAL_DELIVERY_LOCKED } from './mail-p108-protected-bridge.mjs';
import { P108_D06_LIVE_DELIVERY_LOCKED } from './mail-p108-preflight-control.mjs';
import { parseMailAddress } from './mail-provider-config.mjs';
import { classifyBrevoSendFailure, parseBrevoAcceptance } from './brevo-transaction-contract.mjs';

export const P108_D06D_REAL_DELIVERY_LOCKED = true;
export const D06D_BREVO_DOMAIN = 'mail.notebook.recruit.kro.kr';
export const D06D_BREVO_SENDER = `noreply@${D06D_BREVO_DOMAIN}`;
const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const deny = (code) => Object.assign(new Error(code), { code });

// This evaluates local source/config constraints ONLY. Account/DNS/transactional
// activation evidence is human-reviewed in the Brevo control plane, not inferred
// from a mutable Heroku environment flag.
export function evaluateD06D1Safety({ config, transport } = {}) {
  const blockers = [];
  if (P103_REAL_DELIVERY_LOCKED !== true || P108_REAL_DELIVERY_LOCKED !== true ||
      P108_D06_LIVE_DELIVERY_LOCKED !== true || P108_D06D_REAL_DELIVERY_LOCKED !== true) {
    blockers.push('source_live_delivery_lock_missing');
  }
  if (!['local', 'test', 'development', 'staging'].includes(config?.environment)) {
    blockers.push('staging_or_test_only');
  }
  if (config?.provider !== 'brevo' || config?.enabled !== true) {
    blockers.push('brevo_only');
  }
  if (config?.sender !== D06D_BREVO_SENDER || config?.domainVerified !== true) {
    blockers.push('fixed_verified_sender_required');
  }
  if (config?.liveSendingReady !== false) {
    blockers.push('app_live_delivery_not_locked');
  }
  if (!(config?.allowlist instanceof Set) || config.allowlist.size < 1) {
    blockers.push('staging_allowlist_required');
  }
  if (!Number.isSafeInteger(config?.dailyLimit) || config.dailyLimit < 1 || config.dailyLimit > 300 ||
      !Number.isSafeInteger(config?.monthlyLimit) || config.monthlyLimit < 1 || config.monthlyLimit > 9300) {
    blockers.push('brevo_free_quota_guard_invalid');
  }
  if (transport?.isMock !== true || typeof transport.simulate !== 'function') {
    blockers.push('explicit_mock_transport_required');
  }
  return Object.freeze({
    canRunMock: blockers.length === 0,
    canPerformVendorSandboxCall: false,
    canSendRealMail: false,
    liveSendingReady: false,
    blockers: Object.freeze(blockers),
  });
}

// Brevo requires the sandbox flag INSIDE JSON's headers property (not as a
// top-level HTTP request header). Its documented sandbox returns HTTP 201 but
// creates no recipient email or Brevo delivery log.
export function prepareD06D1SyntheticSandbox({ config, recipient } = {}) {
  const review = evaluateD06D1Safety({ config, transport: { isMock: true, simulate() {} } });
  if (!review.canRunMock) throw deny(review.blockers[0]);
  const to = parseMailAddress(recipient);
  if (!to || config.allowlist.has(to) !== true) throw deny('recipient_not_allowlisted');
  const payload = Object.freeze({
    sender: Object.freeze({ email: D06D_BREVO_SENDER, name: 'Rental System' }),
    to: Object.freeze([Object.freeze({ email: to })]),
    subject: '[SANDBOX] Phase 34 D06-D1 Contract Check',
    textContent: 'Offline synthetic request. Brevo sandbox drops messages. No user or queue data.',
    headers: Object.freeze({ 'X-Sib-Sandbox': 'drop' }),
  });
  return Object.freeze({
    url: ENDPOINT, method: 'POST',
    // Credentials NEVER enter the offline transport or its inspection logs.
    publicHeaders: Object.freeze({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    payload,
    simulated: true,
  });
}

// Only the explicitly injected mock receives the synthetic, secret-free request.
// This method cannot access Brevo, PostgreSQL, an API key, or an existing Outbox.
export function createD06D1OfflineSandbox({ config, transport } = {}) {
  const safety = evaluateD06D1Safety({ config, transport });
  if (!safety.canRunMock) throw deny(safety.blockers[0]);
  return Object.freeze({
    safety: () => safety,
    async testSynthetic({ recipient } = {}) {
      const request = prepareD06D1SyntheticSandbox({ config, recipient });
      let response;
      try {
        response = await transport.simulate(request);
      } catch (error) {
        if (error?.status === 429 || [400, 401, 403, 404, 422].includes(error?.status)) {
          throw classifyBrevoSendFailure(error.status);
        }
        throw deny('sandbox_response_uncertain');
      }
      if (response?.status !== 201) {
        throw classifyBrevoSendFailure(response?.status);
      }
      const parsed = parseBrevoAcceptance(response.status, response.body);
      return Object.freeze({
        mode: 'OFFLINE_BREVO_SANDBOX_MOCK',
        sandboxAccepted: parsed.state === 'accepted',
        providerMessageId: parsed.providerMessageId,
        recipientEmailDelivered: false,
        realEmailsSent: 0,
        realVendorRequests: 0,
        canSendRealMail: false,
      });
    },
    async sendLive() { throw deny('d06d_real_delivery_locked'); },
  });
}
