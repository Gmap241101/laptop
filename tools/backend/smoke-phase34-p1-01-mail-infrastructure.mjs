import assert from 'node:assert/strict';
import { loadP101MailConfig, describeP101MailReadiness, parseMailAddress } from '../../server/src/mail/mail-provider-config.mjs';
import { createResendProvider, MailProviderError } from '../../server/src/mail/resend-provider.mjs';
let assertions = 0;
const test = (condition, message) => { assert.ok(condition, message); assertions++; };
const mockEnv = {
  APP_ENV: 'staging', MAIL_PROVIDER: 'resend', MAIL_ENABLED: 'true',
  MAIL_DOMAIN_VERIFIED: 'true', MAIL_FROM_ADDRESS: 'notify@example.org',
  MAIL_FROM_NAME: 'MK Rental', MAIL_STAGING_ALLOWLIST: 'test@example.org',
  RESEND_API_KEY: 're_MOCK_TEST_ONLY', RESEND_DOMAIN_ID: 'domain-1234',
};
const config = loadP101MailConfig(mockEnv);
test(config.provider === 'resend', 'provider config');
test(config.enabled === true, 'explicit email switch');
test(config.liveSendingReady === false, 'no live send in P1-01');
test(config.blockers.includes('outbox_and_quota_ledger_not_ready'), 'Outbox gate');
test(config.allowlist.has('test@example.org'), 'allowlist normalization');
test(!config.allowlist.has('real@example.org'), 'real recipient denied');
test(config.dailyLimit === 100, 'hard daily ceiling');
test(config.monthlyLimit === 3000, 'hard monthly ceiling');
test(describeP101MailReadiness(config).apiKeyPresent === true, 'safe readiness key presence');
test(JSON.stringify(describeP101MailReadiness(config)).includes('re_MOCK_TEST_ONLY') === false, 'no secret in readiness');
test(parseMailAddress(' Test@Example.org ') === 'test@example.org', 'email normalize');
test(parseMailAddress('test\n@evil.test') === null, 'reject newline');
test(parseMailAddress('*@example.org') === null, 'reject wildcard address');
test(loadP101MailConfig({}).enabled === false, 'default off');
test(loadP101MailConfig({}).provider === 'disabled', 'default disabled provider');
test(loadP101MailConfig({}).liveSendingReady === false, 'default no live send');
for (const key of ['MAIL_FREE_DAILY_LIMIT', 'MAIL_FREE_MONTHLY_LIMIT']) {
  assert.throws(() => loadP101MailConfig({ ...mockEnv, [key]: '999999' })); assertions++;
}
for (const candidate of ['false', 'False', 'yes']) {
  if (candidate === 'false') continue;
  assert.throws(() => loadP101MailConfig({ ...mockEnv, MAIL_ENABLED: candidate })); assertions++;
}
assert.throws(() => loadP101MailConfig({ ...mockEnv, MAIL_PROVIDER: 'smtp' })); assertions++;
assert.throws(() => loadP101MailConfig({ ...mockEnv, MAIL_STAGING_ALLOWLIST: 'bad' })); assertions++;
assert.throws(() => loadP101MailConfig({ ...mockEnv, MAIL_FROM_NAME: 'Bad\r\nBCC:' })); assertions++;
let sent = 0;
const mockFetch = async (url, options) => {
  sent++;
  test(url === 'https://api.resend.com/domains/domain-1234', 'fixed API origin');
  test(options.method === 'GET', 'only domain read');
  test(options.headers.Authorization === 'Bearer re_MOCK_TEST_ONLY', 'authorized mock fetch');
  return { ok: true, status: 200, json: async () => ({ status: 'verified', name: 'example.org' }) };
};
const provider = createResendProvider({ config, fetchImpl: mockFetch });
const result = await provider.getDomainStatus();
test(result.verified === true, 'domain verified response parsed');
test(result.matchedSenderDomain === true, 'domain ownership matches from address');
test(sent === 1, 'single read-only request');
await assert.rejects(() => provider.send({ to: 'test@example.org', subject: 'X', text: 'Y', idempotencyKey: 'a' }),
  (error) => error instanceof MailProviderError && error.code === 'outbox_and_quota_ledger_not_ready'); assertions++;
test(sent === 1, 'send blocked before outbound request');
const unverified = createResendProvider({ config: loadP101MailConfig({ ...mockEnv, RESEND_DOMAIN_ID: '' }), fetchImpl: mockFetch });
await assert.rejects(() => unverified.getDomainStatus(), (error) => error.code === 'domain_readiness_not_configured'); assertions++;
test(sent === 1, 'missing domain ID no network');
const wrongDomain = createResendProvider({ config, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'verified', name: 'other.org' }) }) });
const wrongDomainStatus = await wrongDomain.getDomainStatus();
test(wrongDomainStatus.verified === false && !wrongDomainStatus.matchedSenderDomain, 'reject unrelated verified domain');
const unavailable = createResendProvider({ config, fetchImpl: async () => ({ ok: false, status: 429 }) });
await assert.rejects(() => unavailable.getDomainStatus(), (error) => error.code === 'provider_rate_limited' && error.retryable === true); assertions++;
const hardFailure = createResendProvider({ config, fetchImpl: async () => ({ ok: false, status: 403 }) });
await assert.rejects(() => hardFailure.getDomainStatus(), (error) => error.code === 'provider_rejected' && error.retryable === false); assertions++;
const down = createResendProvider({ config, fetchImpl: async () => { throw Error('SECRET SHOULD NEVER LOG'); } });
await assert.rejects(() => down.getDomainStatus(), (error) => !error.message.includes('SECRET') && error.retryable); assertions++;
console.log(`[phase34-p1-01-mail-infrastructure] PASS (${assertions} checks; real emails=0; outbound network=mock only)`);
