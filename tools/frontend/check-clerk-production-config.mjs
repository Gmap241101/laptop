import { readClerkStagingConfig as readUserClerkConfig } from '../../src/clerk/clerkUserClient.js';
import { readClerkStagingConfig as readAdminClerkConfig } from '../../src/clerk/clerkStagingClient.js';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
} from '../deployment/production-domain-contract.mjs';

const decode = (value) => Buffer.from(value, 'base64').toString('utf8');

const env = {
  MODE: 'production',
  VITE_CLERK_STAGING_ENABLED: process.env.VITE_CLERK_STAGING_ENABLED,
  VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_API_URL: process.env.VITE_API_URL,
};

try {
  const publishableKey = String(env.VITE_CLERK_PUBLISHABLE_KEY || '').trim();
  if (!publishableKey.startsWith('pk_live_')) {
    throw new Error('Production VITE_CLERK_PUBLISHABLE_KEY must use a Clerk Production publishable key (pk_live_...).');
  }

  const user = readUserClerkConfig(env, decode);
  const admin = readAdminClerkConfig(env, decode);

  if (!user.enabled || !admin.enabled) {
    throw new Error('Production Clerk integration must be enabled with VITE_CLERK_STAGING_ENABLED=true.');
  }
  if (user.apiBaseUrl !== PRODUCTION_API_ORIGIN || admin.apiBaseUrl !== PRODUCTION_API_ORIGIN) {
    throw new Error(`Production Clerk clients must use ${PRODUCTION_API_ORIGIN}.`);
  }
  if (user.publishableKey !== admin.publishableKey) {
    throw new Error('User/admin Clerk publishable keys do not match.');
  }

  console.log('[clerk-production-config] PASS');
  console.log(`- frontendOrigin=${PRODUCTION_FRONTEND_ORIGIN}`);
  console.log(`- apiBaseUrl=${PRODUCTION_API_ORIGIN}`);
  console.log(`- frontendApiDomain=${user.frontendApiDomain}`);
  console.log('- publishableKey=pk_live_... (value not printed)');
} catch (error) {
  console.error(`[clerk-production-config] FAIL: ${error.message}`);
  process.exit(1);
}
