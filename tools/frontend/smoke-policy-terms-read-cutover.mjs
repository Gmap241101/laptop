import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/content/policyContentCutover.js', 'utf8');
for (const marker of [
  "RENTAL_CONFIG: 'rental-config'",
  "TERMS: 'terms'",
  'requestSiteContentDomain',
  'replaceSiteContentDomainInPostgresql',
  'fallbackAllowed: false',
]) assert.ok(cutover.includes(marker), `missing Phase 34 policy authority marker: ${marker}`);
for (const forbidden of ['FromFirestore', 'X-Firebase-Authorization']) {
  assert.equal(cutover.includes(forbidden), false, `policy authority must not retain Firebase sync marker: ${forbidden}`);
}

const rentalData = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
for (const marker of [
  'requestPolicyContentDomain',
  'POLICY_CONTENT_DOMAINS.RENTAL_CONFIG',
  "'rentalSystem/publicConfig'",
  'Phase 34 canonical 설정 초기화 상태',
]) assert.ok(rentalData.includes(marker), `publicConfig PostgreSQL marker missing: ${marker}`);

const termsService = readFileSync('src/features/terms/termsService.js', 'utf8');
for (const marker of ['requestPolicyContentDomain', 'POLICY_CONTENT_DOMAINS.TERMS', "'signupTermsPolicy/current'"]) {
  assert.ok(termsService.includes(marker), `terms PostgreSQL marker missing: ${marker}`);
}
for (const forbidden of ['getDoc(', 'onSnapshot(', 'retiredLegacyDataCompat']) {
  assert.equal(termsService.includes(forbidden), false, `terms service must not use Firestore: ${forbidden}`);
}

const adminTerms = readFileSync('src/admin/AdminSignupTermsManager.jsx', 'utf8');
assert.ok(adminTerms.includes('replacePolicyContentDomainInPostgresql'));
const signupPolicy = readFileSync('src/features/members/useAdminSignupPolicyActions.js', 'utf8');
assert.ok(signupPolicy.includes('replacePolicyContentDomainInPostgresql'));

console.log('[policy-terms-frontend-smoke] PASS (Phase 34 PostgreSQL-only rental-config + terms authority)');
