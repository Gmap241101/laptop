import assert from 'node:assert/strict';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
  validateProductionFrontendEnv,
} from '../deployment/production-domain-contract.mjs';

const valid = validateProductionFrontendEnv({ VITE_API_URL: `${PRODUCTION_API_ORIGIN}/` });
assert.equal(valid.apiOrigin, PRODUCTION_API_ORIGIN);
assert.equal(valid.frontendOrigin, PRODUCTION_FRONTEND_ORIGIN);

for (const invalid of [
  '',
  'http://api.notebook.recruit.kro.kr',
  'https://notebook-rental-api.example.herokuapp.com',
  'https://api.notebook.recruit.kro.kr/api',
  'https://api.notebook.recruit.kro.kr?x=1',
]) {
  assert.throws(() => validateProductionFrontendEnv({ VITE_API_URL: invalid }));
}

console.log('Phase 34 production API domain frontend smoke: PASS');
