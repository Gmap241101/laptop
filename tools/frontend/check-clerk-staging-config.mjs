import { readClerkStagingConfig } from '../../src/clerk/clerkStagingClient.js';

const decode = (value) => Buffer.from(value, 'base64').toString('utf8');

try {
  const config = readClerkStagingConfig(
    {
      MODE: 'staging',
      VITE_CLERK_STAGING_ENABLED: process.env.VITE_CLERK_STAGING_ENABLED,
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
      VITE_API_URL: process.env.VITE_API_URL,
    },
    decode,
  );

  if (!config.enabled) {
    console.log('[clerk-staging-config] DISABLED (set VITE_CLERK_STAGING_ENABLED=true to enable)');
    process.exit(0);
  }

  console.log('[clerk-staging-config] PASS');
  console.log(`- mode=${config.mode}`);
  console.log(`- apiBaseUrl=${config.apiBaseUrl}`);
  console.log(`- frontendApiDomain=${config.frontendApiDomain}`);
  console.log('- publishableKey=configured (value not printed)');
} catch (error) {
  console.error(`[clerk-staging-config] FAIL: ${error.message}`);
  process.exit(1);
}
