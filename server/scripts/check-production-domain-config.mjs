import { readServerConfig } from '../src/config/env.mjs';
import { validateProductionBackendConfig } from '../../tools/deployment/production-domain-contract.mjs';

try {
  const config = readServerConfig();
  validateProductionBackendConfig({
    appEnv: config.appEnv,
    corsAllowedOrigins: config.corsAllowedOrigins,
    clerkAuthorizedParties: config.clerkAuthorizedParties,
  });

  console.log('[production-domain] backend origin contract PASS');
  console.log(`APP_ENV=${config.appEnv}`);
  console.log(`CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins.join(',')}`);
  console.log(`CLERK_AUTHORIZED_PARTIES=${config.clerkAuthorizedParties.join(',')}`);
} catch (error) {
  console.error(`[production-domain] backend origin contract FAIL: ${error.message}`);
  process.exit(1);
}
