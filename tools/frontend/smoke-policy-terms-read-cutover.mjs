import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/content/policyContentCutover.js', 'utf8');
for (const marker of [
  'VITE_POLICY_CONTENT_POSTGRES_READ_ENABLED',
  'VITE_POLICY_CONTENT_WRITE_THROUGH_ENABLED',
  "params.get('policyContent') === 'postgres'",
  "params.get('policyContentWrite') === 'postgres'",
  "RENTAL_CONFIG: 'rental-config'",
  "TERMS: 'terms'",
  'syncAllPolicyContentDomainsFromFirestore',
]) assert.ok(cutover.includes(marker), `missing Phase 25 policy cutover marker: ${marker}`);

const rentalData = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
for (const marker of ['requestPolicyContentDomain', 'POLICY_CONTENT_DOMAINS.RENTAL_CONFIG', "readSource: 'firestore-one-time-fallback'", 'syncPolicyContentDomainFromFirestore']) {
  assert.ok(rentalData.includes(marker), `missing publicConfig cutover marker: ${marker}`);
}
const termsService = readFileSync('src/features/terms/termsService.js', 'utf8');
for (const marker of ['requestPolicyContentDomain', 'POLICY_CONTENT_DOMAINS.TERMS', "'signupTermsPolicy/current'", 'getDoc(SIGNUP_TERMS_POLICY_DOC_REF)']) {
  assert.ok(termsService.includes(marker), `missing terms policy cutover marker: ${marker}`);
}
const signupTerms = readFileSync('src/user/UserSignupTermsSection.jsx', 'utf8');
assert.ok(signupTerms.includes('readPolicyContentCutoverConfig'), 'signup terms must honor Phase 25 read opt-in');
assert.ok(signupTerms.includes('loadSignupTermsPolicy'), 'signup terms must use the policy read service on Phase 25 path');
const adminTerms = readFileSync('src/admin/AdminSignupTermsManager.jsx', 'utf8');
assert.ok(adminTerms.includes('syncTermsPostgresBestEffort'), 'admin terms mutations must write-through to PostgreSQL');
const signupPolicy = readFileSync('src/features/members/useAdminSignupPolicyActions.js', 'utf8');
assert.ok(signupPolicy.includes("POLICY_CONTENT_DOMAINS.TERMS"), 'signup policy changes must sync terms policy to PostgreSQL');
const adminAuth = readFileSync('src/features/auth/useAdminAuthenticationController.js', 'utf8');
for (const marker of ['stabilizeAdminPostLoginRoute', "window.setTimeout(applyAdminRoute, 150)", "window.setTimeout(applyAdminRoute, 600)", "replaceAppPath('admin')", "setView('admin')"]) {
  assert.ok(adminAuth.includes(marker), `missing admin post-login route stabilization marker: ${marker}`);
}
const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of ['Clerk Staging Test · Phase 29', 'Phase 25 rental policy + terms PostgreSQL read + write-through', 'Policy content 전체 동기화', "top: '184px'"]) {
  assert.ok(diagnostics.includes(marker), `missing Phase 25 diagnostics marker: ${marker}`);
}
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('policyContentCutover'), 'Phase 25 must not push policy cutover logic back into App.jsx.');
console.log('[policy-terms-frontend-smoke] PASS (publicConfig + terms preferred reads, Firestore transaction authority preserved, admin post-login route stabilization)');
