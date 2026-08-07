import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  loadMemberProfileWithoutFirestoreWatcher,
  readMemberProfileCutoverConfig,
  requestMemberProfileFirestoreFallback,
  shouldUseMemberProfileFirestoreWatcher,
} from '../../src/features/members/memberProfileReadCutover.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED: 'true',
  VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
const config = readMemberProfileCutoverConfig({
  env,
  location: { search: '?memberRead=postgres&memberWatcher=off' },
});
assert.equal(config.requested, true);
assert.equal(config.firestoreWatcherDisableEnabled, true);
assert.equal(config.firestoreWatcherDisabled, true);
assert.equal(shouldUseMemberProfileFirestoreWatcher(config), false);
assert.equal(
  readMemberProfileCutoverConfig({ env, location: { search: '?memberRead=postgres' } }).firestoreWatcherDisabled,
  false,
);
assert.equal(
  readMemberProfileCutoverConfig({
    env: { ...env, VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED: 'false' },
    location: { search: '?memberRead=postgres&memberWatcher=off' },
  }).firestoreWatcherDisabled,
  false,
);

const postgresProfile = { uid: 'firebase_phase10', name: 'Phase Ten', team: 'QA', status: 'active' };
let fallbackCalls = 0;
const primary = await loadMemberProfileWithoutFirestoreWatcher({
  loadPostgresCandidate: async () => ({ profile: postgresProfile }),
  loadFirestoreFallback: async () => {
    fallbackCalls += 1;
    return { profile: { ...postgresProfile, name: 'Fallback' } };
  },
});
assert.equal(primary.source, 'postgresql-shadow');
assert.equal(primary.profile.name, 'Phase Ten');
assert.equal(primary.firestoreFallbackReads, 0);
assert.equal(fallbackCalls, 0);

const fallback = await loadMemberProfileWithoutFirestoreWatcher({
  loadPostgresCandidate: async () => {
    const error = new Error('postgres unavailable');
    error.code = 'postgres-unavailable';
    throw error;
  },
  loadFirestoreFallback: async () => {
    fallbackCalls += 1;
    return { profile: { ...postgresProfile, name: 'Firestore Fallback' } };
  },
});
assert.equal(fallback.source, 'firestore-one-time-fallback');
assert.equal(fallback.profile.name, 'Firestore Fallback');
assert.equal(fallback.firestoreFallbackReads, 1);
assert.equal(fallback.fallbackReason, 'postgres-unavailable');

let requestedUrl = '';
let firebaseHeader = '';
const fallbackResponse = await requestMemberProfileFirestoreFallback({
  firebaseUser: { async getIdToken() { return 'firebase-token-phase10'; } },
  apiBaseUrl: 'https://api.example.test',
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    firebaseHeader = options.headers['X-Firebase-Authorization'];
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          readFallback: {
            source: 'firestore-one-time-fallback',
            authoritative: true,
            profile: postgresProfile,
          },
        };
      },
    };
  },
});
assert.equal(requestedUrl, 'https://api.example.test/api/legacy/member-profile-firestore-fallback');
assert.equal(firebaseHeader, 'Bearer firebase-token-phase10');
assert.equal(fallbackResponse.profile.uid, 'firebase_phase10');

const controllerSource = await readFile(
  new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url),
  'utf8',
);
assert.match(controllerSource, /shouldUseMemberProfileFirestoreWatcher/);
assert.match(controllerSource, /loadMemberProfileWithoutFirestoreWatcher/);
assert.match(controllerSource, /requestMemberProfileFirestoreFallback/);
assert.match(controllerSource, /if \(!shouldUseMemberProfileFirestoreWatcher\(cutoverConfig\)\)/);
assert.match(controllerSource, /const unsubscribe = onSnapshot\(/);

console.log('[member-profile-watcher-disable-smoke] PASS (explicit staging gate, no watcher on PostgreSQL success path, zero Firestore reads on primary success, one-time Firestore fallback on failure)');
