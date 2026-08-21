import assert from 'node:assert/strict';
import {
  PRODUCTION_FRONTEND_ORIGIN,
  validateProductionBackendConfig,
} from '../deployment/production-domain-contract.mjs';

const valid = validateProductionBackendConfig({
  appEnv: 'production',
  corsAllowedOrigins: [PRODUCTION_FRONTEND_ORIGIN],
  clerkAuthorizedParties: [PRODUCTION_FRONTEND_ORIGIN],
});
assert.equal(valid.appEnv, 'production');

assert.throws(() => validateProductionBackendConfig({
  appEnv: 'staging',
  corsAllowedOrigins: [PRODUCTION_FRONTEND_ORIGIN],
  clerkAuthorizedParties: [PRODUCTION_FRONTEND_ORIGIN],
}));

assert.throws(() => validateProductionBackendConfig({
  appEnv: 'production',
  corsAllowedOrigins: [PRODUCTION_FRONTEND_ORIGIN, 'https://mkrental.vercel.app'],
  clerkAuthorizedParties: [PRODUCTION_FRONTEND_ORIGIN],
}));

assert.throws(() => validateProductionBackendConfig({
  appEnv: 'production',
  corsAllowedOrigins: [PRODUCTION_FRONTEND_ORIGIN],
  clerkAuthorizedParties: ['https://mkrental.vercel.app'],
}));

console.log('Phase 34 production domain backend config smoke: PASS');
