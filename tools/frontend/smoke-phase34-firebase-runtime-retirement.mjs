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
  '__mkFirebaseRuntimeRetired',
  "authAuthorityMode: 'clerk-postgresql'",
  "firebaseRuntime: 'retired'",
  'firebaseRuntimeRetired',
]) assert.ok(joined.includes(marker), `missing Firebase runtime retirement marker: ${marker}`);

assert.ok(sources[0].includes('export const firebaseApp = firebaseRuntimeDisabled'), 'Firebase apps must not initialize in retired runtime.');
assert.ok(sources[0].includes("type: 'firestore-retired'"), 'Retired Firestore placeholder must be local-only.');
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

console.log('[phase34-firebase-runtime-retirement-frontend-smoke] PASS (no Firebase initialization, Clerk-only headers, global PostgreSQL cutovers, maintenance guards)');
