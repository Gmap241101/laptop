// P1-08 Gate C: isolated Brevo transactional HTTP contract.
// No runtime wiring. The caller must supply an HTTP function explicitly.
// Sending in the shipped application is blocked separately by P1-03 and P1-01 locks.
import { parseMailAddress } from './mail-provider-config.mjs';
import { MailProviderError } from './resend-provider.mjs';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const HTTP_TIMEOUT_MS = 8000;
const fail = (code, options = {}) => new MailProviderError(code, options);
const plain = (value, max) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= max && !/[\u0000-\u001f\u007f<>]/.test(value);
const subjectValid = (value) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
const claimValid = (message) => /^\d+$/.test(String(message?.id ?? '')) &&
  BigInt(message.id) > 0n &&
  /^[a-f0-9-]{36}$/i.test(String(message?.token ?? '')) &&
  Number.isSafeInteger(message?.attempt) && message.attempt >= 1;

// Outbox sender_name is authoritative for the queued message. Environment name
// only applies as fallback, never overwrites a historical queue snapshot.
export const prepareBrevoTransaction = ({ config, message }) => {
  if (config?.provider !== 'brevo' || config?.enabled !== true || config?.domainVerified !== true ||
    !config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.includes('\n') || config.apiKey.includes('\r')) {
    throw fail('mail_not_configured');
  }
  const sender = parseMailAddress(config.sender);
  const to = parseMailAddress(message?.to);
  if (!sender) throw fail('sender_invalid');
  if (!to) throw fail('recipient_invalid');
  if (config.environment === 'staging' && (config.allowlist?.has(to) !== true)) {
    throw fail('recipient_not_allowlisted');
  }
  if (!claimValid(message)) throw fail('mail_claim_invalid');
  if (!subjectValid(message.subject)) throw fail('message_subject_invalid');
  const name = message.senderName ?? config.senderName ?? '';
  if (name !== '' && !plain(name, 100)) throw fail('sender_name_invalid');
  const html = typeof message.html === 'string' ? message.html : '';
  const text = typeof message.text === 'string' ? message.text : '';
  if (html.length > 64000 || text.length > 40000 || (!html.trim() && !text.trim())) {
    throw fail('message_body_invalid');
  }
  // Brevo accepts one of htmlContent, textContent, or templateId as the body.
  // Prefer the Outbox's fully-rendered common HTML layout, with a text-only fallback.
  const payload = {
    sender: name ? { email:sender, name:name.trim() } : { email:sender },
    to: [{ email:to }],
    subject:message.subject,
    ...(html.trim() ? { htmlContent:html } : { textContent:text }),
  };
  return Object.freeze({ url:ENDPOINT, method:'POST', payload:Object.freeze(payload) });
};

export const classifyBrevoSendFailure = (status) => {
  if (status === 429) return fail('provider_rate_limited',{status,retryable:true});
  if ([400,401,403,404,422].includes(status)) return fail('provider_rejected',{status,retryable:false});
  // A timeout, 408, 409, 5xx, or malformed success may be AFTER provider acceptance.
  // Never treat those cases as a safe automatic resend.
  return fail('provider_outcome_uncertain',{status,retryable:false});
};

export const parseBrevoAcceptance = (status, body) => {
  if (status !== 201 || !body || typeof body !== 'object' || Array.isArray(body)) {
    throw fail('provider_outcome_uncertain',{status,retryable:false});
  }
  if (typeof body.messageId !== 'string' || body.messageId.length < 3 || body.messageId.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(body.messageId)) {
    throw fail('provider_outcome_uncertain',{status,retryable:false});
  }
  return Object.freeze({ provider:'brevo', providerMessageId:body.messageId, state:'accepted' });
};

// Explicit-injection transport for an OFFLINE mock (no default global fetch).
// Not called by the web dyno or production dispatcher.
export const executeBrevoTransaction = async ({ config, message, fetchImpl }) => {
  if (typeof fetchImpl !== 'function') throw new TypeError('explicit HTTP transport required');
  const request = prepareBrevoTransaction({config,message});
  let response;
  try {
    response = await fetchImpl(request.url, {
      method:request.method,
      headers:{'api-key':config.apiKey,Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify(request.payload),
      signal:AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    // A provider may have accepted mail before a timeout or network failure.
    throw fail('provider_outcome_uncertain',{retryable:false});
  }
  if (!response || typeof response.status !== 'number') throw fail('provider_outcome_uncertain');
  if (response.status !== 201) throw classifyBrevoSendFailure(response.status);
  let body;
  try { body = await response.json(); }
  catch { throw fail('provider_outcome_uncertain',{status:201,retryable:false}); }
  return parseBrevoAcceptance(response.status,body);
};
