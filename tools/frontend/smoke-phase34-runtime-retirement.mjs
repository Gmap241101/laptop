import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const sources = await Promise.all([
  read('src/firebase.js'),
  read('src/features/auth/firebaseRuntimeRetirement.js'),
  read('src/features/auth/useAuthIdentityPolicySubscriptionController.js'),
  read('src/features/auth/useAdminAuthenticationController.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/admin/AdminSettingsPanel.jsx'),
  read('src/features/settings/useAdminDataMaintenanceController.js'),
  read('src/features/auth/useAdminAccountManagementController.js'),
]);
const joined = sources.join('\n');

for (const marker of [
  'VITE_FIREBASE_RUNTIME_DISABLED',
  "params.get('firebaseRuntime') === 'compatibility'",
  'firebaseRuntimeNetworkBarrier',
  "authAuthorityMode: 'clerk-postgresql'",
  "firebaseRuntime: 'retired'",
  'firebaseRuntimeRetired',
]) assert.ok(joined.includes(marker), `missing Firebase runtime retirement marker: ${marker}`);

assert.ok(sources[0].includes('initializeAuth(app, { persistence: [] })'), 'Retired Firebase Auth must not hydrate a persisted Firebase session.');
assert.ok(sources[0].includes('disableNetwork(db)'), 'Firestore network must be disabled with a structurally valid SDK instance.');
assert.ok(sources[0].includes('firebaseAuth.currentUser = principal || null'), 'Clerk/PostgreSQL principal must use the real Firebase Auth compatibility property.');
assert.ok(!sources[0].includes("type: 'firestore-retired'"), 'Invalid placeholder Firestore instances must not be used.');
assert.ok(sources[4].includes("delete authorityHeaders['X-Firebase-Authorization']"), 'Clerk API client must strip Firebase authorization.');
assert.ok(sources[5].includes('if (firebaseRuntimeRetired) return Object.freeze'), 'Firestore audit writes must be retired.');
assert.ok(sources[6].includes('blockRetiredFirebaseMaintenance'), 'Firestore maintenance actions must be blocked.');
assert.ok(sources[7].includes('blockLegacyAdminAccountMutation'), 'Legacy Firebase administrator-account mutations must be blocked.');

const cutovers = await Promise.all([
  read('src/features/assets/assetDomainCutover.js'),
  read('src/features/boards/boardContentCutover.js'),
  read('src/features/requests/adminRentalRequestCutover.js'),
  read('src/features/requests/rentalRequestReadCutover.js'),
  read('src/features/requests/rentalRequestWriteCutover.js'),
  read('src/features/requests/rentalRequestUserActionCutover.js'),
  read('src/features/requests/rentalRestrictionReadCutover.js'),
  read('src/features/members/memberProfileReadCutover.js'),
  read('src/features/members/memberAuthorityCutover.js'),
  read('src/features/content/policyContentCutover.js'),
  read('src/features/compatibility/legacyFirestoreReadFallbackCutover.js'),
]);
for (const source of cutovers) {
  assert.ok(source.includes('readFirebaseRuntimeRetirementConfig'), 'Every legacy cutover must inherit the global retirement flag.');
}

console.log('[phase34-runtime-retirement-frontend-smoke] PASS (valid offline Firebase SDK shell, Clerk-only headers/principal, global PostgreSQL cutovers, maintenance guards)');
