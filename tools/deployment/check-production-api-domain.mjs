import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
  validateProductionFrontendEnv,
} from './production-domain-contract.mjs';

try {
  validateProductionFrontendEnv(process.env);
  console.log('[production-domain] frontend API domain contract PASS');
  console.log(`FRONTEND_ORIGIN=${PRODUCTION_FRONTEND_ORIGIN}`);
  console.log(`VITE_API_URL=${PRODUCTION_API_ORIGIN}`);
} catch (error) {
  console.error(`[production-domain] frontend API domain contract FAIL: ${error.message}`);
  process.exit(1);
}
