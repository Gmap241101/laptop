import assert from 'node:assert/strict';

import { createRentalRequestWriteService } from '../../server/src/rentals/rental-request-write-service.mjs';
import {
  findBlockingReservation,
  koreaRequestedAtText,
  validateRequestedPeriod,
} from '../../server/src/rentals/rental-request-write-policy.mjs';


assert.equal(
  koreaRequestedAtText(new Date('2026-08-08T04:20:40.000Z')),
  '2026. 8. 8. 오후 1:20:40',
);
assert.equal(
  koreaRequestedAtText(new Date('2026-08-08T00:05:06.000Z')),
  '2026. 8. 8. 오전 9:05:06',
);

const settings = {
  maxRentalDays: 14,
  allowNonOverlappingSameAssetRequests: true,
  excludeSaturdays: true,
  excludeSundays: true,
  excludeHolidaysForStartDate: true,
  holidays: [],
  overdueRentalBlockEnabled: true,
  postOverduePenaltyEnabled: true,
};

assert.deepEqual(
  validateRequestedPeriod({ startDate: '2026-08-10', dueDate: '2026-08-14', settings, today: '2026-08-08' }),
  { startDate: '2026-08-10', dueDate: '2026-08-14', maxDueDate: '2026-08-24' },
);
assert.equal(
  findBlockingReservation({
    reservations: [{ id: 'REQ-X', laptopId: 'ASSET-1', startDate: '2026-08-12', dueDate: '2026-08-13', status: '신청중' }],
    laptopId: 'ASSET-1',
    startDate: '2026-08-10',
    dueDate: '2026-08-14',
    settings,
  })?.id,
  'REQ-X',
);

let restrictionRefreshes = 0;
let requestRefreshes = 0;
let mirrorCalls = 0;
let repositoryInput = null;
const service = createRentalRequestWriteService({
  userRepository: {
    async findByClerkUserId(id) {
      return id === 'clerk-user' ? { id: '1', clerkUserId: id } : null;
    },
  },
  firebaseLinkRepository: {
    async findByAppUserId(id) {
      return String(id) === '1' ? { appUserId: '1', firebaseUid: 'firebase-user', firebaseEmail: 'member@example.test' } : null;
    },
  },
  memberShadowRepository: {
    async findByAppUserId(id) {
      return String(id) === '1'
        ? { appUserId: '1', status: 'active', email: 'member@example.test', name: 'Member Name', team: 'QA' }
        : null;
    },
  },
  rentalRestrictionService: {
    async syncLinkedFirebaseUid(identity, uid) {
      assert.equal(identity.uid, 'firebase-user');
      assert.equal(uid, 'firebase-user');
      restrictionRefreshes += 1;
      return { status: 'synced' };
    },
  },
  rentalRequestService: {
    async syncCurrent(clerkUserId, identity) {
      assert.equal(clerkUserId, 'clerk-user');
      assert.equal(identity.uid, 'firebase-user');
      requestRefreshes += 1;
      return { requests: [] };
    },
  },
  rentalRequestWriteRepository: {
    async createAuthoritative(input) {
      repositoryInput = input;
      const prepared = {
        id: input.requestId,
        requesterUid: input.firebaseUid,
        requesterEmail: input.requesterEmail,
        requesterName: input.requesterName,
        requesterTeam: input.requesterTeam,
        team: input.requesterTeam,
        borrower: input.requesterName,
        laptopId: input.laptopId,
        assetCategory: input.assetCategory,
        assetNo: input.assetNo,
        startDate: input.startDate,
        dueDate: input.dueDate,
        purpose: input.purpose,
        status: '신청중',
        adminMemo: '',
        extensionCount: 0,
        lastExtensionApprovedDate: '',
        nextExtensionRequestDate: '',
        extensionHistory: [],
        requestedAt: input.requestedAtText,
        firestoreMirrorStatus: 'synced',
      };
      const mirrorResult = await input.beforeCommit(prepared);
      return { request: prepared, reused: false, mirrorResult };
    },
  },
  firestoreRentalRequestWriteClient: {
    async getPublicConfig() {
      return { fields: { settings } };
    },
    async getRentalAsset({ assetId, firebaseIdToken }) {
      assert.equal(assetId, 'ASSET-1');
      assert.equal(firebaseIdToken, 'firebase-token');
      return {
        name: 'projects/demo/databases/(default)/documents/rentalAssets/ASSET-1',
        updateTime: '2026-08-08T04:00:00.000Z',
        fields: {
          assetNo: 'NB-001',
          category: '노트북',
          status: '대여가능',
          reservations: [],
        },
      };
    },
    async commitRentalRequestCreate({ request, availability, asset, assetUpdateTime, firebaseIdToken }) {
      mirrorCalls += 1;
      assert.equal(request.requesterUid, 'firebase-user');
      assert.equal(request.requesterName, 'Member Name');
      assert.equal(request.requesterTeam, 'QA');
      assert.equal(request.assetNo, 'NB-001');
      assert.equal(request.status, '신청중');
      assert.equal(availability.id, request.id);
      assert.equal(asset.id, 'ASSET-1');
      assert.equal(asset.reservations.at(-1).id, request.id);
      assert.equal(assetUpdateTime, '2026-08-08T04:00:00.000Z');
      assert.equal(firebaseIdToken, 'firebase-token');
      return { commitTime: '2026-08-08T04:01:00.000Z', writeResults: [{}, {}, {}] };
    },
  },
});

const result = await service.createCurrent(
  'clerk-user',
  { uid: 'firebase-user', email: 'member@example.test', idToken: 'firebase-token' },
  {
    requestId: 'REQ-Phase16Smoke001',
    idempotencyKey: 'REQ-Phase16Smoke001',
    laptopId: 'ASSET-1',
    startDate: '2026-08-10',
    dueDate: '2026-08-14',
    purpose: 'Phase 16 smoke',
    requesterName: 'UNTRUSTED NAME',
  },
);

assert.equal(result.authority, 'postgresql');
assert.equal(result.firestoreMirror, 'synced');
assert.equal(result.shadowSynchronized, true);
assert.equal(result.request.requesterName, 'Member Name');
assert.equal(repositoryInput.requesterName, 'Member Name');
assert.equal(repositoryInput.assetNo, 'NB-001');
assert.equal(repositoryInput.allowNonOverlappingSameAssetRequests, true);
assert.equal(restrictionRefreshes, 1);
assert.equal(requestRefreshes, 2);
assert.equal(mirrorCalls, 1);

await assert.rejects(
  () => service.createCurrent(
    'clerk-user',
    { uid: 'wrong-user', email: 'member@example.test', idToken: 'firebase-token' },
    { requestId: 'REQ-Phase16Smoke002', laptopId: 'ASSET-1', startDate: '2026-08-10', dueDate: '2026-08-14' },
  ),
  (error) => error.code === 'legacy_link_token_mismatch',
);

console.log('[rental-request-authoritative-write-smoke] PASS (server-owned identity, policy validation, restriction/request source refresh, PostgreSQL transaction contract, Firestore compatibility mirror)');
