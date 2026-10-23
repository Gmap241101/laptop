import { parseMailAddress } from './mail-provider-config.mjs';
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';

const API_ORIGIN = 'https://api.resend.com';
const TIMEOUT_MS = 8000;

export class MailProviderError extends Error {
  constructor(code, { status = null, retryable = false } = {}) {
    super(code);
    this.name = 'MailProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const safeJson = async (response) => {
  try { return await response.json(); } catch { return null; }
};
const authorization = (config) => {
  if (!config.apiKey) throw new MailProviderError('provider_key_missing');
  return { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
};
const classifyStatus = (status) => {
  if (status === 429) return new MailProviderError('provider_rate_limited', { status, retryable: true });
  if (status >= 500) return new MailProviderError('provider_unavailable', { status, retryable: true });
  return new MailProviderError('provider_rejected', { status, retryable: false });
};

export const createResendProvider = ({ config, fetchImpl = globalThis.fetch } = {}) => {
  if (!config || typeof fetchImpl !== 'function') throw new Error('Mail provider requires config and fetch.');
  const fetchProvider = async (path, options) => {
    try {
      return await fetchImpl(`${API_ORIGIN}${path}`, {
        ...options,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Never include authorization headers, request bodies or provider response text in errors.
      throw new MailProviderError('provider_network_error', { retryable: true });
    }
  };

  return Object.freeze({
    // Read-only domain check must be explicitly invoked; never called on app startup.
    async getDomainStatus() {
      if (config.provider !== 'resend' || !config.apiKey || !config.domainId || !/^[a-zA-Z0-9-]{4,100}$/.test(config.domainId)) {
        throw new MailProviderError('domain_readiness_not_configured');
      }
      const response = await fetchProvider(`/domains/${config.domainId}`, { method: 'GET', headers: authorization(config) });
      if (!response.ok) throw classifyStatus(response.status);
      const payload = await safeJson(response);
      const providerDomain = typeof payload?.name === 'string' ? payload.name.toLowerCase() : null;
      const senderDomain = config.sender?.split('@')[1] || null;
      const matchedSenderDomain = Boolean(providerDomain && senderDomain && providerDomain === senderDomain);
      return Object.freeze({
        verified: payload?.status === 'verified' && matchedSenderDomain,
        status: typeof payload?.status === 'string' ? payload.status : 'unknown',
        matchedSenderDomain,
      });
    },

    async send(message) {
      // P1-01 intentionally cannot send real mail. P1-02/03 must add a durable, atomic
      // Outbox and quota ledger before an authorized production sending interface exists.
      if (!config.liveSendingReady) throw new MailProviderError('outbox_and_quota_ledger_not_ready');
      if (P103_REAL_DELIVERY_LOCKED) throw new MailProviderError('p103_real_delivery_locked');
      // The following code is a secondary defensive boundary, not yet a production sender.
      if (!config.enabled || config.provider !== 'resend' || !config.domainVerified) {
        throw new MailProviderError('mail_not_enabled');
      }
      const recipient = parseMailAddress(message?.to);
      if (!recipient) throw new MailProviderError('recipient_invalid');
      if (config.environment === 'staging' && !config.allowlist.has(recipient)) {
        throw new MailProviderError('recipient_not_allowlisted');
      }
      if (!config.sender || !message?.idempotencyKey || typeof message.idempotencyKey !== 'string' || message.idempotencyKey.length > 256) {
        throw new MailProviderError('message_validation_failed');
      }
      const response = await fetchProvider('/emails', {
        method: 'POST',
        headers: { ...authorization(config), 'Idempotency-Key': message.idempotencyKey },
        body: JSON.stringify({
          from: config.senderName ? `${config.senderName} <${config.sender}>` : config.sender,
          to: [recipient],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) throw classifyStatus(response.status);
      const body = await safeJson(response);
      if (typeof body?.id !== 'string') throw new MailProviderError('provider_response_invalid', { retryable: true });
      return Object.freeze({ provider: 'resend', providerMessageId: body.id, state: 'accepted' });
    },
  });
};
