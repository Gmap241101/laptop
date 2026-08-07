import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  compareMemberProfileReads,
  normalizeMemberProfileRead,
} from '../../src/features/members/memberProfileReadObservation.js';

const firestoreProfile = {
  uid: 'firebase_uid_test',
  email: ' Test@Example.com ',
  maskedEmail: 't***@example.com',
  name: 'Smoke User',
  team: 'QA',
  phone: '010-0000-0000',
  status: 'active',
  directoryMemberId: 'M-001',
  directoryVerifiedVersion: 3,
  profileRequiredReason: '',
  rejoinedAccount: false,
  termsConsentRevision: 4,
  termsConsentPolicyVersion: 2,
  identityKey: 'identity_test',
  recoveryKey: 'recovery_test',
  previousAccountUids: ['firebase_old'],
};

const candidate = {
  ...firestoreProfile,
  email: 'test@example.com',
};

assert.deepEqual(normalizeMemberProfileRead(firestoreProfile), normalizeMemberProfileRead(candidate));
assert.deepEqual(compareMemberProfileReads(firestoreProfile, candidate), {
  equivalent: true,
  changedFields: [],
});

const drifted = { ...candidate, team: 'Platform' };
assert.deepEqual(compareMemberProfileReads(firestoreProfile, drifted), {
  equivalent: false,
  changedFields: ['team'],
});

assert.deepEqual(compareMemberProfileReads(null, candidate), {
  equivalent: false,
  changedFields: ['profileMissing'],
});

const subscriptionSource = await readFile(
  new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url),
  'utf8',
);
assert.match(subscriptionSource, /publishMemberProfileReadObservation\(/);
assert.match(subscriptionSource, /profile:\s*firestoreProfile/);

const diagnosticsSource = await readFile(
  new URL('../../src/clerk/ClerkStagingDiagnostics.jsx', import.meta.url),
  'utf8',
);
assert.match(diagnosticsSource, /getMemberProfileReadCandidate\(\)/);
assert.match(diagnosticsSource, /compareMemberProfileReads\(/);
assert.match(diagnosticsSource, /Phase 9/);

console.log('[member-read-parity-smoke] PASS (actual Firestore subscription observation, PostgreSQL read candidate normalization, parity and drift)');
