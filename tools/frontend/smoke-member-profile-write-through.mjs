import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  readMemberProfileWriteThroughConfig,
  requestMemberProfileWriteThrough,
  syncMemberProfileWriteThroughBestEffort,
  syncMemberProfilesWriteThroughBestEffort,
} from '../../src/features/members/memberProfileWriteThrough.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED: 'true',
  VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED: 'true',
  VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};

const enabled = readMemberProfileWriteThroughConfig({
  env,
  location: { search: '?memberRead=postgres&memberWatcher=off&memberWriteThrough=on' },
});
assert.equal(enabled.enabled, true);
assert.equal(enabled.requested, true);
assert.equal(enabled.apiBaseUrl, 'https://api.example.test');
const storageState = new Map();
const fakeStorage = {
  setItem(key, value) { storageState.set(key, String(value)); },
  getItem(key) { return storageState.has(key) ? storageState.get(key) : null; },
};
const latchedStart = readMemberProfileWriteThroughConfig({
  env,
  location: { search: '?memberRead=postgres&memberWatcher=off&memberWriteThrough=on' },
  storage: fakeStorage,
});
assert.equal(latchedStart.requested, true);
const latchedAfterNavigation = readMemberProfileWriteThroughConfig({
  env,
  location: { search: '' },
  storage: fakeStorage,
});
assert.equal(latchedAfterNavigation.requested, true, 'Write-through staging opt-in must survive SPA navigation in the same tab.');
assert.equal(
  readMemberProfileWriteThroughConfig({ env, location: { search: '?memberRead=postgres&memberWatcher=off' } }).requested,
  false,
);
assert.equal(
  readMemberProfileWriteThroughConfig({
    env: { ...env, VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED: 'false' },
    location: { search: '?memberRead=postgres&memberWatcher=off&memberWriteThrough=on' },
  }).requested,
  false,
);

const firebaseUser = {
  uid: 'firebase_self',
  async getIdToken() { return 'firebase-write-token'; },
};
let calls = [];
const fetchOk = async (url, options) => {
  calls.push({ url, options });
  const target = new URL(url).searchParams.get('firebaseUid');
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        writeThrough: {
          status: target === 'firebase_unlinked' ? 'skipped' : 'synced',
          reason: target === 'firebase_unlinked' ? 'legacy_link_not_found' : '',
          firebaseUid: target,
          actorUid: 'firebase_self',
        },
      };
    },
  };
};

const raw = await requestMemberProfileWriteThrough({
  firebaseUser,
  firebaseUid: 'firebase_target',
  apiBaseUrl: enabled.apiBaseUrl,
  fetchImpl: fetchOk,
});
assert.equal(raw.status, 'synced');
assert.equal(calls[0].url, 'https://api.example.test/api/legacy/member-shadow/write-through?firebaseUid=firebase_target');
assert.equal(calls[0].options.method, 'POST');
assert.equal(calls[0].options.headers['X-Firebase-Authorization'], 'Bearer firebase-write-token');

const disabledResult = await syncMemberProfileWriteThroughBestEffort({
  firebaseUser,
  firebaseUid: 'firebase_target',
  config: { requested: false, apiBaseUrl: enabled.apiBaseUrl },
  fetchImpl: async () => { throw new Error('must not call'); },
});
assert.equal(disabledResult.attempted, false);
assert.equal(disabledResult.status, 'disabled');

const failure = await syncMemberProfileWriteThroughBestEffort({
  firebaseUser,
  firebaseUid: 'firebase_target',
  reason: 'test-write',
  config: enabled,
  fetchImpl: async () => ({
    ok: false,
    status: 503,
    async json() { return { error: 'member_write_through_unavailable' }; },
  }),
});
assert.equal(failure.status, 'failed');
assert.equal(failure.errorCode, 'member_write_through_unavailable');

calls = [];
const bulk = await syncMemberProfilesWriteThroughBestEffort({
  firebaseUser,
  firebaseUids: ['firebase_target', 'firebase_target', 'firebase_unlinked'],
  reason: 'bulk-test',
  config: enabled,
  fetchImpl: fetchOk,
});
assert.equal(bulk.length, 2, 'Bulk write-through must de-duplicate Firebase UIDs.');
assert.equal(bulk[0].status, 'synced');
assert.equal(bulk[1].status, 'skipped');
assert.equal(calls.length, 2);

const sourceFiles = [
  'src/features/members/useUserMyPageAccountController.js',
  'src/features/members/useUserMembershipStatusController.js',
  'src/features/members/useAdminMemberAccountStatusActions.js',
  'src/features/members/useAdminMemberDirectoryAuditActions.js',
  'src/features/members/memberDirectorySaveService.js',
  'src/user/UserTermsConsentPanel.jsx',
];
for (const sourceFile of sourceFiles) {
  const source = await readFile(new URL(`../../${sourceFile}`, import.meta.url), 'utf8');
  assert.match(source, /syncMemberProfile(?:s)?WriteThroughBestEffort/, `${sourceFile} is missing the Phase 11 write-through hook.`);
}

const subscriptionSource = await readFile(
  new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url),
  'utf8',
);
assert.match(subscriptionSource, /subscribeMemberProfileWriteThroughObservation/);
assert.match(subscriptionSource, /setInterval\(\(\) =>/);
assert.match(subscriptionSource, /15000/);
assert.match(subscriptionSource, /PostgreSQL member profile refresh failed; keeping the last known profile/);
assert.match(subscriptionSource, /lastCommittedProfileKey/);

console.log('[member-profile-write-through-frontend-smoke] PASS (staging+URL gate, Firebase bearer request, best-effort failure isolation, bulk de-duplication, standard member write hooks present)');
