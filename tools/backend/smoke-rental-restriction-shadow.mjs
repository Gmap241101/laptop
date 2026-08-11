import assert from 'node:assert/strict';
import { createRentalRestrictionService } from '../../server/src/restrictions/rental-restriction-service.mjs';

const stored = new Map();
const firebaseLinkRepository = {
  async findByFirebaseUid(uid) {
    return uid === 'user_a' || uid === 'user_b' ? { firebaseUid: uid, appUserId: uid === 'user_a' ? '1' : '2', firebaseEmail: `${uid}@example.test` } : null;
  },
};
const rentalRestrictionRepository = {
  async findByFirebaseUid(uid) { return stored.get(uid) || null; },
  async upsert(value) {
    const row = Object.freeze({ ...value, syncedAt: new Date().toISOString() });
    stored.set(value.firebaseUid, row);
    return row;
  },
};
const firestoreRentalRestrictionClient = {
  async getRentalRestriction({ firebaseUid, firebaseIdToken }) {
    assert.equal(firebaseIdToken, 'token');
    if (firebaseUid === 'user_b') return null;
    return {
      name: `projects/demo/databases/(default)/documents/rentalRestrictions/${firebaseUid}`,
      updateTime: '2026-08-08T01:00:00.000Z',
      fields: {
        uid: firebaseUid,
        activePenalty: true,
        eligibleFromDate: '2026-08-20',
        pendingOverdueRequestIds: ['REQ-1'],
      },
    };
  },
};

const service = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firestoreRentalRestrictionClient,
});
const identityA = { uid: 'user_a', idToken: 'token' };
const syncedA = await service.syncLinkedFirebaseUid(identityA, 'user_a');
assert.equal(syncedA.status, 'synced');
assert.equal(syncedA.shadow.exists, true);
assert.equal(syncedA.shadow.restriction.activePenalty, true);
assert.equal(syncedA.shadow.restriction.uid, 'user_a');
assert.equal((await service.getCurrentByFirebaseIdentity(identityA)).firebaseUid, 'user_a');

const identityB = { uid: 'user_b', idToken: 'token' };
const syncedB = await service.syncLinkedFirebaseUid(identityB, 'user_b');
assert.equal(syncedB.shadow.exists, false);
assert.equal(syncedB.shadow.restriction, null);
stored.delete('user_b');
const absentB = await service.getCurrentByFirebaseIdentity(identityB);
assert.equal(absentB.exists, false);
assert.equal(absentB.restriction, null);
assert.equal(absentB.authorityMode, 'postgresql-authoritative');
assert.equal(absentB.mirrorState, 'retired');

console.log('[rental-restriction-shadow-smoke] PASS (Firestore restriction source -> PostgreSQL shadow, including absent restriction state)');
