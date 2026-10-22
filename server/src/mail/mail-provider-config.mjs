// Phase34 P1-01: isolated provider configuration. No runtime wiring or sends.
const asBoolean = (value, name, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
};

const asBoundedInteger = (value, name, defaultValue, maximum) => {
  if (value === undefined || value === '') return defaultValue;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer.`);
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }
  return count;
};

export const parseMailAddress = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@,<>*]+@[^\s@,<>*]+\.[^\s@,<>*]+$/.test(normalized)) return null;
  return normalized;
};

export const loadP101MailConfig = (env = process.env) => {
  const environment = (env.APP_ENV || 'local').trim().toLowerCase();
  if (!['local', 'development', 'test', 'staging', 'production'].includes(environment)) {
    throw new Error('APP_ENV is not a supported mail environment.');
  }
  const enabled = asBoolean(env.MAIL_ENABLED, 'MAIL_ENABLED');
  const provider = (env.MAIL_PROVIDER || 'disabled').trim().toLowerCase();
  if (!['disabled', 'resend', 'brevo'].includes(provider)) throw new Error('MAIL_PROVIDER must be disabled, brevo, or resend.');
  const domainVerified = asBoolean(env.MAIL_DOMAIN_VERIFIED, 'MAIL_DOMAIN_VERIFIED');
  const sender = parseMailAddress(env.MAIL_FROM_ADDRESS);
  const senderName = (env.MAIL_FROM_NAME || '').trim();
  if (senderName.length > 100 || /[\r\n<>]/.test(senderName)) throw new Error('MAIL_FROM_NAME is invalid.');
  const allowlistEntries = (env.MAIL_STAGING_ALLOWLIST || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const allowlist = new Set();
  for (const candidate of allowlistEntries) {
    const address = parseMailAddress(candidate);
    if (!address) throw new Error('MAIL_STAGING_ALLOWLIST contains an invalid recipient.');
    allowlist.add(address);
  }
  const dailyCeiling = provider === 'brevo' ? 300 : 100;
  const monthlyCeiling = provider === 'brevo' ? 9300 : 3000;
  const dailyLimit = asBoundedInteger(env.MAIL_FREE_DAILY_LIMIT, 'MAIL_FREE_DAILY_LIMIT', dailyCeiling, dailyCeiling);
  const monthlyLimit = asBoundedInteger(env.MAIL_FREE_MONTHLY_LIMIT, 'MAIL_FREE_MONTHLY_LIMIT', monthlyCeiling, monthlyCeiling);
  const apiKey = ((provider === 'brevo' ? env.BREVO_API_KEY : env.RESEND_API_KEY) || '').trim();
  const domainId = (env.RESEND_DOMAIN_ID || '').trim();
  const configured = ['brevo', 'resend'].includes(provider) && Boolean(apiKey && sender && domainVerified);
  const blockers = [];
  if (!enabled) blockers.push('mail_disabled');
  if (provider === 'disabled') blockers.push('provider_disabled');
  if (['brevo', 'resend'].includes(provider) && !apiKey) blockers.push('api_key_missing');
  if (!sender) blockers.push('sender_missing_or_invalid');
  if (!domainVerified) blockers.push('domain_not_verified');
  if (environment === 'staging' && allowlist.size === 0) blockers.push('staging_allowlist_missing');
  // P1-01 has no PostgreSQL Outbox or durable quota ledger yet. This gate remains hard-off,
  // independent of any environment variable. P1-02/03 must explicitly replace it after acceptance.
  blockers.push('outbox_and_quota_ledger_not_ready');

  return Object.freeze({
    environment,
    enabled,
    provider,
    configured,
    domainVerified,
    sender,
    senderName,
    dailyLimit,
    monthlyLimit,
    allowlist,
    apiKey,
    domainId,
    blockers: Object.freeze(blockers),
    liveSendingReady: false,
  });
};

export const describeP101MailReadiness = (config) => Object.freeze({
  environment: config.environment,
  provider: config.provider,
  enabled: config.enabled,
  domainVerifiedClaim: config.domainVerified,
  senderConfigured: Boolean(config.sender),
  apiKeyPresent: Boolean(config.apiKey),
  domainIdPresent: Boolean(config.domainId),
  stagingAllowlistSize: config.allowlist.size,
  dailyLimit: config.dailyLimit,
  monthlyLimit: config.monthlyLimit,
  liveSendingReady: false,
  blockers: [...config.blockers],
});
