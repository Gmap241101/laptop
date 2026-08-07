import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  chooseMemberProfileReadSource,
  readMemberProfileCutoverConfig,
  requestMemberProfileCutoverCandidate,
} from '../../src/features/members/memberProfileReadCutover.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
assert.deepEqual(
  readMemberProfileCutoverConfig({ env, location: { search: '?memberRead=postgres' } }),
  { enabled: true, requested: true, apiBaseUrl: 'https://api.example.test' },
);
assert.equal(
  readMemberProfileCutoverConfig({ env, location: { search: '' } }).requested,
  false,
);
assert.equal(
  readMemberProfileCutoverConfig({
    env: { ...env, VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED: 'false' },
    location: { search: '?memberRead=postgres' },
  }).requested,
  false,
);

const firestoreProfile = {
  uid: 'firebase_uid_phase9',
  email: 'phase9@example.com',
  maskedEmail: 'p***@example.com',
  name: 'Phase Nine',
  team: 'QA',
  phone: '010-1111-2222',
  status: 'active',
  directoryMemberId: 'M9',
  directoryVerifiedVersion: 4,
  profileRequiredReason: '',
  rejoinedAccount: false,
  termsConsentRevision: 4,
  termsConsentPolicyVersion: 4,
  identityKey: 'identity_9',
  recoveryKey: 'recovery_9',
  previousAccountUids: ['firebase_old_9'],
};

const selected = chooseMemberProfileReadSource({
  firestoreProfile,
  postgresProfile: { ...firestoreProfile },
  requested: true,
});
assert.equal(selected.source, 'postgresql-shadow');
assert.equal(selected.equivalent, true);
assert.equal(selected.fallbackReason, '');

const drift = chooseMemberProfileReadSource({
  firestoreProfile,
  postgresProfile: { ...firestoreProfile, team: 'Platform' },
  requested: true,
});
assert.equal(drift.source, 'firestore-onSnapshot');
assert.equal(drift.equivalent, false);
assert.equal(drift.fallbackReason, 'profile-mismatch');
assert.deepEqual(drift.changedFields, ['team']);

const missing = chooseMemberProfileReadSource({ firestoreProfile, postgresProfile: null, requested: true });
assert.equal(missing.source, 'firestore-onSnapshot');
assert.equal(missing.fallbackReason, 'postgres-candidate-unavailable');

let requestedUrl = '';
let firebaseHeader = '';
const candidate = await requestMemberProfileCutoverCandidate({
  firebaseUser: { async getIdToken() { return 'firebase-token-phase9'; } },
  apiBaseUrl: 'https://api.example.test',
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    firebaseHeader = options.headers['X-Firebase-Authorization'];
    return {
      ok: true,
      status: 200,
      async json() {
        return { readCandidate: { source: 'postgresql-shadow', profile: firestoreProfile } };
      },
    };
  },
});
assert.equal(requestedUrl, 'https://api.example.test/api/legacy/member-profile-cutover-candidate');
assert.equal(firebaseHeader, 'Bearer firebase-token-phase9');
assert.equal(candidate.profile.identityKey, 'identity_9');
assert.deepEqual(candidate.profile.previousAccountUids, ['firebase_old_9']);

const controllerSource = await readFile(
  new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url),
  'utf8',
);
assert.match(controllerSource, /requestMemberProfileCutoverCandidate/);
assert.match(controllerSource, /chooseMemberProfileReadSource/);
assert.match(controllerSource, /PostgreSQL member profile cutover candidate unavailable; Firestore fallback remains active/);
assert.match(controllerSource, /onSnapshot\(/);

console.log('[member-profile-cutover-smoke] PASS (staging opt-in gate, Firebase-authenticated candidate, PostgreSQL selection, Firestore mismatch/missing fallback)');
