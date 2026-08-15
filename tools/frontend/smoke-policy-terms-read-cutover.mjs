import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/content/policyContentCutover.js', 'utf8');
for (const marker of [
  "RENTAL_CONFIG: 'rental-config'",
  "TERMS: 'terms'",
  'requestSiteContentDomain',
  'replaceSiteContentDomainInPostgresql',
  'patchSiteContentDomainInPostgresql',
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
  '오류 코드: ${errorCode}',
]) assert.ok(rentalData.includes(marker), `publicConfig PostgreSQL marker missing: ${marker}`);

const termsService = readFileSync('src/features/terms/termsService.js', 'utf8');
for (const marker of ['/api/signup/terms-policy', '/api/signup/terms/${encodeURIComponent(term.id)}/content', '/api/signup/terms-content?ids=', "source !== 'postgresql'", 'signupTermsPolicyPending', 'signupTermContentPending', 'signupTermBatchPending', 'preloadSignupTermContents', 'SIGNUP_TERMS_POLICY_CACHE_TTL_MS', 'SIGNUP_TERM_CONTENT_CACHE_TTL_MS']) {
  assert.ok(termsService.includes(marker), `signup terms dedicated PostgreSQL marker missing: ${marker}`);
}
for (const forbidden of ['requestPolicyContentDomain', 'POLICY_CONTENT_DOMAINS.TERMS', 'getDoc(', 'onSnapshot(', 'retiredLegacyDataCompat']) {
  assert.equal(termsService.includes(forbidden), false, `signup terms read must avoid full-domain/Firestore path: ${forbidden}`);
}

const adminTermsService = readFileSync('src/features/terms/adminTermsService.js', 'utf8');
for (const marker of ['/api/admin/signup-terms/catalog', '/api/admin/signup-terms/${encodeURIComponent(termId)}/content', 'adminSignupTermsCatalogPending', 'adminSignupTermContentPending', 'ADMIN_SIGNUP_TERMS_CATALOG_CACHE_TTL_MS']) {
  assert.ok(adminTermsService.includes(marker), `administrator signup terms catalog marker missing: ${marker}`);
}
const adminTerms = readFileSync('src/admin/AdminSignupTermsManager.jsx', 'utf8');
assert.ok(adminTerms.includes('patchPolicyContentDomainInPostgresql'));
assert.ok(adminTerms.includes('preloadAdminSignupTermsCatalog'));
assert.ok(adminTerms.includes('primeAdminSignupTermsCatalog'));
assert.ok(adminTerms.includes('preloadAdminSignupTermContent'));
assert.match(adminTerms, /onPointerEnter=.*preloadAdminSignupTermContent/s, 'administrator term edit/preview actions must intent-preload rich content');
assert.ok(adminTerms.includes('contentPreview'), 'administrator terms list must render lightweight content preview data');
assert.equal(adminTerms.includes('requestPolicyContentDomain'), false, 'signup terms administrator list must not read the full terms domain');
assert.ok(adminTerms.includes('versionUpserts'), 'new historical versions must be appended without preloading existing history');
assert.equal(adminTerms.includes('termVersions'), false, 'signup terms administrator list must not preload historical version documents');
assert.equal(adminTerms.includes('replacePolicyContentDomainInPostgresql'), false, 'signup terms admin writes must not resend the full terms domain');
const signupPolicyPanel = readFileSync('src/admin/AdminSignupPolicyPanel.jsx', 'utf8');
assert.match(signupPolicyPanel, /onPointerEnter=.*preloadAdminSignupTermsCatalog/s, 'administrator terms tab must intent-preload the lightweight catalog');
const accountLifecycleService = readFileSync('server/src/accounts/account-lifecycle-service.mjs', 'utf8');
assert.match(accountLifecycleService, /displayOrder: Number\.isFinite/, 'reconsent authority must preserve administrator display order');
assert.match(accountLifecycleService, /sort\(\(first, second\) => first\.displayOrder - second\.displayOrder/, 'reconsent authority must return terms in administrator display order');
const signupPolicy = readFileSync('src/features/members/useAdminSignupPolicyActions.js', 'utf8');
assert.ok(signupPolicy.includes('saveAdminSignupPolicy'));
assert.equal(signupPolicy.includes('replacePolicyContentDomainInPostgresql'), false);

const signupTermsSection = readFileSync('src/user/UserSignupTermsSection.jsx', 'utf8');
assert.match(signupTermsSection, /loadSignupTermContents/, 'signup terms dialog must lazy-load rich term content');
assert.match(signupTermsSection, /onPointerEnter=.*preloadSignupTermContent/s, 'signup terms view action must intent-preload individual term content');
assert.match(signupTermsSection, /onPointerEnter=.*preloadSignupTermContents\(policy\.activeTerms\)/s, 'all-terms action must intent-preload one batch instead of N individual requests');
assert.match(signupTermsSection, /requestIdleCallback\(preloadAll, \{ timeout: 1200 \}\)/, 'signup terms must background-preload the all-terms batch after the checkbox list first paint without blocking the list');
const reconsentPanel = readFileSync('src/user/UserTermsConsentPanel.jsx', 'utf8');
assert.match(reconsentPanel, /loadSignupTermContents/, 'reconsent dialog must hydrate term content instead of rendering metadata-only policy');
assert.match(reconsentPanel, /onClick=.*openTermDialog/s, 'reconsent term view must use the PostgreSQL term-content reader');
const termsDialog = readFileSync('src/components/TermsContentDialog.jsx', 'utf8');
assert.match(termsDialog, /loading = false/, 'terms dialog must expose a content loading state');
assert.match(termsDialog, /errorMessage = ''/, 'terms dialog must expose a content read error state');
const userAuthPanel = readFileSync('src/user/UserAuthPanel.jsx', 'utf8');
assert.match(userAuthPanel, /onPointerEnter=.*preloadSignupTermsPolicy/s, 'signup navigation must preload the lightweight terms list on intent');

console.log('[policy-terms-frontend-smoke] PASS (Phase 34 PostgreSQL-only rental-config + terms authority)');
