import { loadP101MailConfig, describeP101MailReadiness } from '../../server/src/mail/mail-provider-config.mjs';
import { createResendProvider } from '../../server/src/mail/resend-provider.mjs';
import { createBrevoProvider } from '../../server/src/mail/brevo-provider.mjs';

const checkDomain = process.argv.includes('--check-domain');
const config = loadP101MailConfig();
console.log(JSON.stringify(describeP101MailReadiness(config), null, 2));
if (checkDomain) {
  try {
    const provider = config.provider === 'brevo' ? createBrevoProvider({ config }) : createResendProvider({ config });
    const status = await provider.getDomainStatus();
    console.log(JSON.stringify({ domainStatus: status.status, verified: status.verified }));
    if (!status.verified) process.exitCode = 2;
  } catch (error) {
    console.error(`Domain check failed: ${error.code || 'unknown_error'}`);
    process.exitCode = 2;
  }
} else {
  console.log('P1-01 readiness only; no email sent; provider DNS/network not accessed.');
}
