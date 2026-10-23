import { MailProviderError } from './resend-provider.mjs';
import { P103_REAL_DELIVERY_LOCKED } from './mail-dynoweb-dispatcher.mjs';
import { executeBrevoTransaction } from './brevo-transaction-contract.mjs';

const BREVO_API = 'https://api.brevo.com';
const errorStatus = (status) => new MailProviderError(
  status === 429 ? 'provider_rate_limited' : status >= 500 ? 'provider_unavailable' : 'provider_rejected',
  { status, retryable: status === 429 || status >= 500 },
);
export const createBrevoProvider = ({ config, fetchImpl = globalThis.fetch } = {}) => {
  if (!config || typeof fetchImpl !== 'function') throw new TypeError('Brevo requires config and fetch.');
  const call = async (path, options = {}) => {
    let response;
    try {
      response = await fetchImpl(`${BREVO_API}${path}`, {
        ...options,
        headers: { 'api-key': config.apiKey, Accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(8000),
      });
    } catch { throw new MailProviderError('provider_network_error', { retryable: true }); }
    if (!response.ok) throw errorStatus(response.status);
    try { return await response.json(); } catch { throw new MailProviderError('provider_response_invalid'); }
  };
  return Object.freeze({
    async getDomainStatus() {
      const domain = config.sender?.split('@')[1];
      if (config.provider !== 'brevo' || !config.apiKey || !domain || !/^[a-z0-9.-]{4,253}$/.test(domain)) {
        throw new MailProviderError('domain_readiness_not_configured');
      }
      const info = await call(`/v3/senders/domains/${encodeURIComponent(domain)}`, { method: 'GET' });
      // Deliberately conservative: never trust a mutable claim in the app's configuration.
      const verified = info?.verified === true && info?.authenticated === true;
      const name = String(info?.domain_name || info?.domain || info?.name || '').toLowerCase();
      return Object.freeze({ verified: verified && name === domain, matchedSenderDomain: name === domain,
        status: verified && name === domain ? 'verified' : 'not_verified' });
    },
    async send(message) {
      // Gate C implements the vendor contract without enabling any live sending.
      // Do NOT remove these guards absent a distinct, explicitly approved Gate D.
      if (!config.liveSendingReady) throw new MailProviderError('outbox_and_quota_ledger_not_ready');
      if (P103_REAL_DELIVERY_LOCKED) throw new MailProviderError('p103_real_delivery_locked');
      return executeBrevoTransaction({config,message,fetchImpl});
    },
  });
};
