import { createClerkSessionAuthenticator } from '../src/auth/clerk-session.mjs';
import { createClerkBackendClient } from '../src/clerk/clerk-api.mjs';
import { readServerConfig, shouldUseDatabaseSsl } from '../src/config/env.mjs';

try {
  const config = readServerConfig();
  const sslEnabled = shouldUseDatabaseSsl(config.databaseUrl, config.databaseSslMode);
  createClerkSessionAuthenticator(config);
  if (config.clerkSecretKey) {
    createClerkBackendClient({
      secretKey: config.clerkSecretKey,
      apiUrl: config.clerkApiUrl,
      timeoutMs: config.clerkApiTimeoutMs,
    });
  }

  console.log('[config] server configuration is valid');
  console.log(`APP_ENV=${config.appEnv}`);
  console.log(`SERVICE_NAME=${config.serviceName}`);
  console.log(`SERVICE_VERSION=${config.serviceVersion}`);
  console.log(`PORT=${config.port}`);
  console.log('DATABASE_URL=configured');
  console.log(`DATABASE_SSL=${sslEnabled ? 'enabled' : 'disabled'}`);
  console.log(`DB_POOL_MAX=${config.dbPoolMax}`);
  console.log(`CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins.join(',')}`);
  console.log('CLERK_JWT_KEY=configured');
  console.log(`CLERK_AUTHORIZED_PARTIES=${config.clerkAuthorizedParties.join(',')}`);
  console.log(`CLERK_REJECT_PENDING_SESSION=${config.clerkRejectPendingSession}`);
  console.log(`CLERK_SECRET_KEY=${config.clerkSecretKey ? 'configured' : 'not-configured'}`);
  console.log(`CLERK_API_URL=${config.clerkApiUrl}`);
  console.log(`CLERK_API_TIMEOUT_MS=${config.clerkApiTimeoutMs}`);
  console.log('FIREBASE_RUNTIME=removed');
  console.log('FIREBASE_RUNTIME=removed');
  console.log(`POSTGRES_ASSET_BOARD_AUTHORITY=${config.assetBoardWriteMirrorDisabled}`);
  console.log(`FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=${config.rentalRequestWriteMirrorDisabled}`);
  console.log(`FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=${config.memberStatusRestrictionWriteMirrorDisabled}`);
  console.log(`FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=${config.memberProfileWriteMirrorDisabled}`);
  console.log(`FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=${config.accountLifecycleCompatibilityDisabled}`);
} catch (error) {
  console.error(`[config] invalid server configuration: ${error.message}`);
  process.exit(1);
}
