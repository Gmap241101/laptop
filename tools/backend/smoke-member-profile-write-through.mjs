import assert from 'node:assert/strict';

import { createMemberShadowService } from '../../server/src/legacy/member-shadow-service.mjs';

const links = new Map([
  ['firebase_target', { appUserId: '77', firebaseUid: 'firebase_target', firebaseEmail: 'member@example.com' }],
]);
let firestoreReads = 0;
let upserts = 0;
let lastRead = null;
let lastUpsert = null;

const service = createMemberShadowService({
  userRepository: {
    async findByClerkUserId() { return null; },
  },
  firebaseLinkRepository: {
    async findByAppUserId() { return null; },
    async findByFirebaseUid(firebaseUid) { return links.get(firebaseUid) || null; },
  },
  memberShadowRepository: {
    async findByAppUserId() { return null; },
    async upsert(appUserId, firebaseUid, source) {
      upserts += 1;
      lastUpsert = { appUserId: String(appUserId), firebaseUid, source };
      return {
        appUserId: String(appUserId),
        firebaseUid,
        ...source,
        syncedAt: new Date('2026-08-08T00:00:00Z'),
        updatedAt: new Date('2026-08-08T00:00:00Z'),
      };
    },
  },
  firestoreUserAccountClient: {
    async getUserAccount({ firebaseUid, firebaseIdToken }) {
      firestoreReads += 1;
      lastRead = { firebaseUid, firebaseIdToken };
      return {
        name: `projects/test/databases/(default)/documents/userAccounts/${firebaseUid}`,
        createTime: '2026-08-01T00:00:00Z',
        updateTime: '2026-08-08T00:00:00Z',
        fields: {
          uid: firebaseUid,
          email: 'member@example.com',
          maskedEmail: 'm***@example.com',
          name: 'Write Through Member',
          team: 'QA',
          phone: '010-1111-2222',
          status: 'active',
          identityKey: 'identity_write_through',
          recoveryKey: 'recovery_write_through',
          previousAccountUids: [],
        },
      };
    },
  },
});

const adminResult = await service.syncLinkedFirebaseUid(
  { uid: 'firebase_admin', email: 'admin@example.com', idToken: 'admin-token' },
  'firebase_target',
);
assert.equal(adminResult.status, 'synced');
assert.equal(adminResult.firebaseUid, 'firebase_target');
assert.equal(adminResult.actorUid, 'firebase_admin');
assert.equal(adminResult.appUserId, '77');
assert.equal(adminResult.shadow.name, 'Write Through Member');
assert.deepEqual(lastRead, { firebaseUid: 'firebase_target', firebaseIdToken: 'admin-token' });
assert.equal(lastUpsert.appUserId, '77');
assert.equal(lastUpsert.firebaseUid, 'firebase_target');
assert.equal(firestoreReads, 1);
assert.equal(upserts, 1);

const skipped = await service.syncLinkedFirebaseUid(
  { uid: 'firebase_admin', idToken: 'admin-token' },
  'firebase_unlinked',
);
assert.equal(skipped.status, 'skipped');
assert.equal(skipped.reason, 'legacy_link_not_found');
assert.equal(firestoreReads, 2, 'Authorization must be checked through Firestore before revealing whether a target UID is linked.');
assert.equal(upserts, 1);

await assert.rejects(
  () => service.syncLinkedFirebaseUid({ uid: 'firebase_admin' }, 'firebase_target'),
  (error) => error.code === 'firebase_id_token_missing',
);

console.log('[member-profile-write-through-backend-smoke] PASS (Firebase actor token -> Rules-authorized target read -> linked PostgreSQL shadow upsert; authorization precedes link-status disclosure)');
