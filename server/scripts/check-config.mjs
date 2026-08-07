import { createClerkSessionAuthenticator } from '../src/auth/clerk-session.mjs';
import { readServerConfig, shouldUseDatabaseSsl } from '../src/config/env.mjs';

try {
  const config = readServerConfig();
  const sslEnabled = shouldUseDatabaseSsl(config.databaseUrl, config.databaseSslMode);
  createClerkSessionAuthenticator(config);

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
} catch (error) {
  console.error(`[config] invalid server configuration: ${error.message}`);
  process.exit(1);
}
