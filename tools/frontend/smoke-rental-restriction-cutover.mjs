import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadRentalRestrictionWithoutFirestoreWatcher,
  readRentalRestrictionCutoverConfig,
  requestRentalRestrictionCandidate,
  syncRentalRestrictionWriteThroughBestEffort,
} from '../../src/features/requests/rentalRestrictionReadCutover.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
const storageMap = new Map();
const storage = {
  getItem(key) { return storageMap.get(key) || null; },
  setItem(key, value) { storageMap.set(key, String(value)); },
  removeItem(key) { storageMap.delete(key); },
};
const config = readRentalRestrictionCutoverConfig({
  env,
  location: { search: '?restrictionRead=postgres&restrictionWatcher=off' },
  storage,
});
assert.equal(config.requested, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
assert.equal(readRentalRestrictionCutoverConfig({ env, location: { search: '' }, storage }).requested, true);
assert.equal(readRentalRestrictionCutoverConfig({ env: { ...env, VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED: 'false' }, location: { search: '?restrictionRead=postgres&restrictionWatcher=off' }, storage }).requested, false);

let fallbackCalls = 0;
const primary = await loadRentalRestrictionWithoutFirestoreWatcher({
  loadCandidate: async () => ({ exists: true, restriction: { uid: 'user_a', activePenalty: false } }),
  loadFallback: async () => { fallbackCalls += 1; return { exists: true, restriction: { uid: 'user_a' } }; },
});
assert.equal(primary.source, 'postgresql-shadow');
assert.equal(primary.firestoreFallbackReads, 0);
assert.equal(fallbackCalls, 0);

const fallback = await loadRentalRestrictionWithoutFirestoreWatcher({
  loadCandidate: async () => { const error = new Error('missing'); error.code = 'rental_restriction_shadow_not_found'; throw error; },
  loadFallback: async () => { fallbackCalls += 1; return { exists: false, restriction: null }; },
});
assert.equal(fallback.source, 'firestore-one-time-fallback');
assert.equal(fallback.firestoreFallbackReads, 1);
assert.equal(fallback.restriction, null);

let candidateUrl = '';
const candidate = await requestRentalRestrictionCandidate({
  firebaseUser: { async getIdToken() { return 'token'; } },
  apiBaseUrl: 'https://api.example.test',
  fetchImpl: async (url, options) => {
    candidateUrl = url;
    assert.equal(options.headers['X-Firebase-Authorization'], 'Bearer token');
    return { ok: true, status: 200, async json() { return { restrictionCandidate: { source: 'postgresql-authoritative', authoritative: true, exists: false, restriction: null } }; } };
  },
});
assert.equal(candidateUrl, 'https://api.example.test/api/legacy/rental-restriction-candidate');
assert.equal(candidate.source, 'postgresql-authoritative');
assert.equal(candidate.authoritative, true);
assert.equal(candidate.exists, false);
assert.equal(candidate.restriction, null);

let writeUrl = '';
const write = await syncRentalRestrictionWriteThroughBestEffort({
  firebaseUser: { uid: 'admin_a', async getIdToken() { return 'token'; } },
  firebaseUid: 'user_a',
  reason: 'test-restriction-write',
  env,
  fetchImpl: async (url) => {
    writeUrl = url;
    return { ok: true, status: 200, async json() { return { restrictionWriteThrough: { status: 'synced', firebaseUid: 'user_a' } }; } };
  },
});
assert.equal(write.status, 'synced');
assert.match(writeUrl, /rental-restriction-shadow\/write-through\?firebaseUid=user_a$/);

const controllerSource = await readFile(new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url), 'utf8');
assert.match(controllerSource, /readRentalRestrictionCutoverConfig/);
assert.match(controllerSource, /requestRentalRestrictionCandidate/);
assert.match(controllerSource, /requestRentalRestrictionFallback/);
assert.match(controllerSource, /restrictionCutoverConfig\.requested/);
assert.match(controllerSource, /setInterval\(\(\) => void refreshRestriction\(\), 15000\)/);

for (const file of [
  '../../src/features/members/useAdminMemberAccountStatusActions.js',
  '../../src/features/requests/useAdminRequestMutationController.js',
  '../../src/features/requests/useAdminUserActionReviewController.js',
]) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(source, /syncRentalRestrictionWriteThroughBestEffort/);
}

console.log('[rental-restriction-cutover-smoke] PASS (staging opt-in, PostgreSQL primary read, one-time Firestore seed/fallback, admin restriction write-through hooks)');
