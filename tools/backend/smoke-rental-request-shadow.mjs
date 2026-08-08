import assert from 'node:assert/strict';

import { createFirestoreRentalRequestsClient } from '../../server/src/firestore/firestore-rental-requests.mjs';
import { createRentalRequestService } from '../../server/src/rentals/rental-request-service.mjs';

const encodeFields = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => {
  if (value === null) return [key, { nullValue: null }];
  if (typeof value === 'boolean') return [key, { booleanValue: value }];
  if (typeof value === 'number') return [key, { integerValue: String(value) }];
  if (Array.isArray(value)) return [key, { arrayValue: { values: value.map((entry) => ({ stringValue: String(entry) })) } }];
  return [key, { stringValue: String(value) }];
}));

let sourceStatus = 'requested';
const requestsByFilter = ({ fieldPath, value }) => {
  const first = {
    name: 'projects/demo/databases/(default)/documents/rentalRequests/REQ-1',
    createTime: '2026-08-01T01:00:00.000Z',
    updateTime: '2026-08-08T01:00:00.000Z',
    fields: encodeFields({
      id: 'REQ-1',
      requesterUid: 'uid-new',
      requesterEmail: 'user@example.test',
      requesterName: 'Phase 14 User',
      requesterTeam: 'QA',
      team: 'QA',
      borrower: 'Phase 14 User',
      laptopId: 'LAPTOP-1',
      assetCategory: 'notebook',
      assetNo: 'A-001',
      startDate: '2026-08-10',
      dueDate: '2026-08-15',
      purpose: 'Smoke test',
      status: sourceStatus,
      adminMemo: '',
      extensionCount: 0,
      requestedAt: '2026. 8. 1. 오전 10:00:00',
      overduePenaltyPending: false,
      overduePenaltyBatchId: '',
    }),
  };
  const old = {
    name: 'projects/demo/databases/(default)/documents/rentalRequests/REQ-OLD',
    createTime: '2026-07-20T01:00:00.000Z',
    updateTime: '2026-07-21T01:00:00.000Z',
    fields: encodeFields({
      id: 'REQ-OLD',
      requesterUid: 'uid-old',
      requesterEmail: 'user@example.test',
      requesterName: 'Phase 14 User',
      requesterTeam: 'QA',
      team: 'QA',
      borrower: 'Phase 14 User',
      laptopId: 'LAPTOP-2',
      assetCategory: 'notebook',
      assetNo: 'A-002',
      startDate: '2026-07-20',
      dueDate: '2026-07-22',
      purpose: 'Legacy identity request',
      status: 'returned',
      adminMemo: '',
      extensionCount: 0,
      requestedAt: '2026. 7. 20. 오전 10:00:00',
      overduePenaltyPending: false,
      overduePenaltyBatchId: '',
    }),
  };
  if (fieldPath === 'requesterUid' && value === 'uid-new') return [first];
  if (fieldPath === 'requesterUid' && value === 'uid-old') return [old];
  if (fieldPath === 'requesterEmail' && value === 'user@example.test') return [first, old];
  return [];
};

const capturedQueries = [];
const firestoreRentalRequestsClient = createFirestoreRentalRequestsClient({
  projectId: 'demo',
  fetchImpl: async (url, options) => {
    assert.match(url, /firestore\.googleapis\.com\/v1\/projects\/demo\/databases\/\(default\)\/documents:runQuery$/);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer firebase-token');
    const body = JSON.parse(options.body);
    assert.equal(body.structuredQuery.from[0].collectionId, 'rentalRequests');
    const filter = body.structuredQuery.where.fieldFilter;
    const query = { fieldPath: filter.field.fieldPath, value: filter.value.stringValue };
    capturedQueries.push(query);
    return {
      ok: true,
      status: 200,
      async json() {
        return requestsByFilter(query).map((document) => ({ document }));
      },
    };
  },
});

const deduped = await firestoreRentalRequestsClient.listOwnRentalRequests({
  requesterUids: ['uid-new', 'uid-old', 'uid-new'],
  requesterEmail: 'USER@example.test',
  firebaseIdToken: 'firebase-token',
});
assert.equal(deduped.length, 2);
assert.deepEqual(capturedQueries.map((query) => `${query.fieldPath}:${query.value}`), [
  'requesterUid:uid-new',
  'requesterUid:uid-old',
  'requesterEmail:user@example.test',
]);

let storedRequests = [];
let syncState = null;
const rentalRequestRepository = {
  async getSyncState(appUserId) {
    assert.equal(String(appUserId), '1');
    return syncState;
  },
  async listByAppUserId(appUserId) {
    assert.equal(String(appUserId), '1');
    return storedRequests;
  },
  async replaceForAppUser({ appUserId, firebaseUid, requests, sourceHash }) {
    assert.equal(String(appUserId), '1');
    assert.equal(firebaseUid, 'uid-new');
    storedRequests = requests.map((request) => ({ ...request }));
    syncState = {
      appUserId: '1',
      firebaseUid,
      sourceRequestCount: requests.length,
      sourceHash,
      syncedAt: '2026-08-08T02:00:00.000Z',
    };
    return syncState;
  },
};

const service = createRentalRequestService({
  userRepository: {
    async findByClerkUserId(clerkUserId) {
      return clerkUserId === 'clerk-user' ? { id: '1', clerkUserId } : null;
    },
  },
  firebaseLinkRepository: {
    async findByAppUserId(appUserId) {
      return String(appUserId) === '1'
        ? { appUserId: '1', firebaseUid: 'uid-new', firebaseEmail: 'user@example.test' }
        : null;
    },
  },
  memberShadowRepository: {
    async findByAppUserId(appUserId) {
      return String(appUserId) === '1'
        ? { appUserId: '1', email: 'user@example.test', previousAccountUids: ['uid-old'] }
        : null;
    },
  },
  rentalRequestRepository,
  firestoreRentalRequestsClient,
});

await assert.rejects(
  () => service.getCurrent('clerk-user'),
  (error) => error.code === 'rental_request_shadow_not_synced',
);

const firebaseIdentity = {
  uid: 'uid-new',
  email: 'user@example.test',
  idToken: 'firebase-token',
};
const synced = await service.syncCurrent('clerk-user', firebaseIdentity);
assert.equal(synced.requests.length, 2);
assert.equal(synced.requests[0].id, 'REQ-1');
assert.equal(synced.requests[1].id, 'REQ-OLD');
assert.equal(synced.requests[0].laptopId, 'LAPTOP-1');
assert.equal(synced.syncState.sourceRequestCount, 2);

const current = await service.getCurrent('clerk-user');
assert.equal(current.requests.length, 2);
assert.equal(current.syncState.sourceHash, synced.syncState.sourceHash);

const equivalent = await service.compareCurrent('clerk-user', firebaseIdentity);
assert.equal(equivalent.equivalent, true);
assert.deepEqual(equivalent.changedRequestIds, []);

sourceStatus = 'approved';
const drift = await service.compareCurrent('clerk-user', firebaseIdentity);
assert.equal(drift.equivalent, false);
assert.deepEqual(drift.changedRequestIds, ['REQ-1']);

await assert.rejects(
  () => service.syncCurrent('clerk-user', { ...firebaseIdentity, uid: 'wrong-uid' }),
  (error) => error.code === 'legacy_link_token_mismatch',
);

console.log('[rental-request-shadow-smoke] PASS (authenticated Firestore owner queries, previous-UID/email dedupe, normalized PostgreSQL shadow sync, parity and drift)');
