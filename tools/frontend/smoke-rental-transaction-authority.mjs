import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readRentalRequestWriteMirrorRetirementConfig, requestRentalRequestWriteMirrorRetirementStatus } from '../../src/features/compatibility/rentalRequestWriteMirrorRetirement.js';

const config = readRentalRequestWriteMirrorRetirementConfig({ env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED: 'true', VITE_API_URL: 'https://api.example.test' } });
assert.equal(config.enabled, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
const mismatchStatus = await requestRentalRequestWriteMirrorRetirementStatus({
  config,
  fetchImpl: async () => ({ ok: true, json: async () => ({ compatibility: { rentalRequestWriteMirrorDisabled: false, rentalTransactionSource: 'firestore-compatibility-source', retiredWriteMirrorDomains: ['assets','notice','faq'] } }) }),
});
assert.equal(mismatchStatus.backendApplied, false);
assert.equal(mismatchStatus.error, 'backend-rental-retirement-not-applied');
const appliedStatus = await requestRentalRequestWriteMirrorRetirementStatus({
  config,
  fetchImpl: async () => ({ ok: true, json: async () => ({ compatibility: { rentalRequestWriteMirrorDisabled: true, rentalTransactionSource: 'postgresql', retiredWriteMirrorDomains: ['assets','notice','faq','rental-requests'] } }) }),
});
assert.equal(appliedStatus.backendApplied, true);
assert.equal(appliedStatus.error, null);


const rentalReadCutover = readFileSync('src/features/requests/rentalRequestReadCutover.js', 'utf8');
for (const marker of [
  "['postgresql-shadow', 'postgresql-authoritative']",
  "source === 'postgresql-authoritative'",
  "source: candidate.source || 'postgresql-shadow'",
]) assert.ok(rentalReadCutover.includes(marker), marker);

const clerkClientSource = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
for (const marker of [
  "const candidateSource = String(payload?.rentalRequestCandidate?.source || '')",
  "['postgresql-shadow', 'postgresql-authoritative'].includes(candidateSource)",
]) assert.ok(clerkClientSource.includes(marker), `authoritative rental candidate client contract missing: ${marker}`);

const rentalDataController = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
for (const marker of [
  'readRentalRequestWriteMirrorRetirementConfig',
  'rentalWriteMirrorRetirementConfig.enabled',
  'clerkStagingClient.getRentalRequestReadCandidate()',
]) assert.ok(rentalDataController.includes(marker), marker);
const enabledBranch = rentalDataController.indexOf('if (rentalWriteMirrorRetirementConfig.enabled)');
const syncBranch = rentalDataController.indexOf('clerkStagingClient.syncRentalRequestShadow', enabledBranch);
const getBranch = rentalDataController.indexOf('clerkStagingClient.getRentalRequestReadCandidate()', enabledBranch);
assert.ok(enabledBranch >= 0 && getBranch > enabledBranch && syncBranch > getBranch, 'Phase 29 enabled branch must select PostgreSQL candidate before any legacy shadow sync branch.');

const adminRequestsController = readFileSync('src/features/requests/useAdminRequestsController.js', 'utf8');
for (const marker of [
  'readRentalRequestWriteMirrorRetirementConfig',
  'if (rentalWriteMirrorRetirementConfig.enabled)',
  'bootstrapCount = 0',
]) assert.ok(adminRequestsController.includes(marker), marker);
const adminBootstrapGate = adminRequestsController.indexOf('if (rentalWriteMirrorRetirementConfig.enabled)');
const adminBootstrapCall = adminRequestsController.indexOf('clerkStagingClient.bootstrapAdminRentalRequests', adminBootstrapGate);
assert.ok(adminBootstrapGate >= 0 && adminBootstrapCall > adminBootstrapGate, 'Phase 29 admin list load must gate legacy Firestore bootstrap behind retirement-disabled branch.');

for (const marker of [
  "readSource: retirementEnabled ? 'unavailable' : 'firestore-fallback'",
  "firestoreWatcher: retirementEnabled ? 'disabled' : 'active'",
  'setPostgresFallbackActive(false)',
  'Phase 29에서는 오래된 Firestore 신청 목록으로 fallback하지 않습니다.',
]) assert.ok(adminRequestsController.includes(marker), `Phase 29 admin PostgreSQL read failure must not expose stale Firestore state: ${marker}`);

const adminAuthController = readFileSync('src/features/auth/useAdminAuthenticationController.js', 'utf8');
for (const marker of [
  'adminPostLoginRouteGuardActive',
  'readAdminRouteIntent',
  'writeAdminRouteIntent();',
  'setAdminPostLoginRouteGuardActive(true)',
  'readAdminAuthSession().adminId',
  'stabilizeAdminPostLoginRoute();',
  "normalizedPath === '/admin' && view === 'admin'",
]) assert.ok(adminAuthController.includes(marker), `administrator persistent post-login route guard marker missing: ${marker}`);
assert.ok(!adminAuthController.includes("const events = ['pointerdown', 'keydown', 'touchstart'];"), 'administrator route intent must not be released by generic user interaction');

const appRoutes = readFileSync('src/routing/appRoutes.js', 'utf8');
for (const marker of [
  'ADMIN_ROUTE_INTENT_SESSION_KEY',
  'readAdminRouteIntent',
  'writeAdminRouteIntent',
  'clearAdminRouteIntent',
]) assert.ok(appRoutes.includes(marker), `administrator route intent helper missing: ${marker}`);

const appNavigationController = readFileSync('src/routing/useAppNavigationController.js', 'utf8');
assert.ok(appNavigationController.includes("if (readAdminRouteIntent()) {\n      clearAdminRouteIntent();"), 'explicit administrator-to-user navigation must clear persistent route intent');
assert.ok(appNavigationController.includes("if (readAdminRouteIntent() && nextRouteState.view !== 'admin')"), 'browser history must preserve persistent administrator route intent');

const adminUserActionController = readFileSync('src/features/requests/useAdminUserActionReviewController.js', 'utf8');
for (const marker of [
  'readRentalRequestWriteMirrorRetirementConfig',
  'adminCutoverConfig.readRequested && !rentalWriteMirrorRetirementConfig.enabled',
  'clerkStagingClient.syncAdminRentalRequest',
]) assert.ok(adminUserActionController.includes(marker), marker);

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of [
  'Clerk Staging Test · Phase 33',
  'Phase 29 rental transaction PostgreSQL authority + Firestore write mirror retirement',
  'Rental write mirror retirement requested',
  'Rental backend retirement applied',
  'Rental transaction source',
  'Preserved write mirrors: member / restriction / site shell / policy-terms transactions',
  "top: '184px'",
]) assert.ok(diagnostics.includes(marker), marker);
const userApp = readFileSync('src/UserApp.jsx', 'utf8');
const adminApp = readFileSync('src/admin/AdminApp.jsx', 'utf8');
assert.ok(!userApp.includes('rentalRequestWriteMirrorRetirement') && !adminApp.includes('rentalRequestWriteMirrorRetirement'), 'Phase 29 compatibility logic must stay outside application roots');
console.log('[rental-transaction-authority-frontend-smoke] PASS (Phase 29 opt-in + authoritative rental read bypass + diagnostics contracts)');
