import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isLegacyFirestoreReadFallbackAllowed,
  readLegacyFirestoreReadFallbackConfig,
} from '../../src/features/compatibility/legacyFirestoreReadFallbackCutover.js';

const storageMap = new Map();
const storage = {
  getItem(key) { return storageMap.get(key) ?? null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};
const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED: 'true',
};

const disabled = readLegacyFirestoreReadFallbackConfig({
  env,
  location: { search: '?legacyReadFallback=off' },
  storage,
});
assert.equal(disabled.requested, true);
assert.equal(isLegacyFirestoreReadFallbackAllowed(disabled), false);
assert.equal(storage.getItem('mk_legacy_firestore_read_fallback_disabled'), '1');

const latched = readLegacyFirestoreReadFallbackConfig({
  env,
  location: { search: '' },
  storage,
});
assert.equal(latched.requested, true);

const rollback = readLegacyFirestoreReadFallbackConfig({
  env,
  location: { search: '?legacyReadFallback=on' },
  storage,
});
assert.equal(rollback.requested, false);
assert.equal(isLegacyFirestoreReadFallbackAllowed(rollback), true);

const auth = readFileSync('src/features/auth/useAuthIdentityPolicySubscriptionController.js', 'utf8');
for (const marker of [
  "recordLegacyFirestoreReadFallbackBlocked('member-profile'",
  "recordLegacyFirestoreReadFallbackBlocked('rental-restriction'",
  'legacyFallbackAllowed',
]) assert.ok(auth.includes(marker), `missing Phase 28 auth fallback-retirement marker: ${marker}`);

const rental = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
for (const marker of [
  'allowFirestoreFallback: legacyFallbackAllowed',
  "recordLegacyFirestoreReadFallbackBlocked('rental-requests'",
  "recordLegacyFirestoreReadFallbackBlocked('assets'",
]) assert.ok(rental.includes(marker), `missing Phase 28 rental fallback-retirement marker: ${marker}`);

const requestCutover = readFileSync('src/features/requests/rentalRequestReadCutover.js', 'utf8');
for (const marker of [
  'allowFirestoreFallback = true',
  'legacy Firestore fallback is disabled',
  'firestoreFallbackReads = 0',
]) assert.ok(requestCutover.includes(marker), `missing Phase 28 request loader marker: ${marker}`);

const boards = readFileSync('src/features/boards/useBoardContentSubscriptionController.js', 'utf8');
for (const marker of [
  "recordLegacyFirestoreReadFallbackBlocked('notice-board'",
  "recordLegacyFirestoreReadFallbackBlocked('faq-board'",
  "recordLegacyFirestoreReadFallbackBlocked('notice-detail'",
  'legacyFallbackAllowed',
]) assert.ok(boards.includes(marker), `missing Phase 28 board fallback-retirement marker: ${marker}`);

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of [
  'Clerk Staging Test · Phase 28',
  'Phase 27 validated-domain legacy Firestore read fallback retirement',
  'Legacy Firestore read fallback retirement requested',
  'Retired read domains: member-profile / rental-restriction / rental-requests / assets / notice / faq',
  "top: '184px'",
]) assert.ok(diagnostics.includes(marker), `missing Phase 28 diagnostics marker: ${marker}`);

const siteContent = readFileSync('src/features/content/siteContentCutover.js', 'utf8');
assert.ok(!siteContent.includes('legacyFirestoreReadFallbackCutover'), 'Phase 28 must preserve site-shell parity fallback.');
const accountRecovery = readFileSync('src/features/members/accountRecoveryService.js', 'utf8');
assert.ok(!accountRecovery.includes('legacyFirestoreReadFallbackCutover'), 'Phase 28 must preserve account-recovery fallback.');
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('legacyFirestoreReadFallbackCutover'), 'Phase 28 must not push compatibility cleanup logic back into App.jsx.');

console.log('[legacy-firestore-read-fallback-retirement-frontend-smoke] PASS (validated domains retire read fallback; site-shell/account-recovery/write mirrors preserved; rollback latch works)');
