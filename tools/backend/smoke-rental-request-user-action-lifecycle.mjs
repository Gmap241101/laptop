import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRentalRequestUserActionService } from '../../server/src/rentals/rental-request-user-action-service.mjs';

const identity = { uid: 'firebase-user', email: 'user@example.com', idToken: 'firebase-token' };
const baseRequest = {
  id: 'REQ-P19', requesterUid: identity.uid, requesterEmail: identity.email,
  requesterName: 'Tester', requesterTeam: 'QA', team: 'QA', borrower: 'Tester',
  laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1',
  startDate: '2026-08-10', dueDate: '2026-08-12', purpose: 'phase19', status: '신청중',
  extensionCount: 0, extensionHistory: [], userActionRequest: null,
};
const docFor = (request) => ({
  name: `projects/test/databases/(default)/documents/rentalRequests/${request.id}`,
  updateTime: '2026-08-08T00:00:00.000Z', fields: { ...request },
});
const assetDocFor = (request) => ({
  name: 'projects/test/databases/(default)/documents/rentalAssets/asset-1',
  updateTime: '2026-08-08T00:00:01.000Z',
  fields: { id: 'asset-1', status: '대여가능', reservations: [{ id: request.id, laptopId: 'asset-1', startDate: request.startDate, dueDate: request.dueDate, status: request.status }] },
});
const context = {
  userRepository: { async findByClerkUserId() { return { id: 1, clerkUserId: 'clerk-user' }; } },
  firebaseLinkRepository: { async findByAppUserId() { return { appUserId: 1, firebaseUid: identity.uid, firebaseEmail: identity.email }; } },
  memberShadowRepository: { async findByAppUserId() { return { appUserId: 1, status: 'active' }; } },
  rentalRestrictionService: { async syncLinkedFirebaseUid() { return { shadow: { exists: false, restriction: null } }; } },
  rentalRequestService: { syncCount: 0, async syncCurrent() { this.syncCount += 1; return { syncState: { synced: true }, requests: [] }; } },
};

const createHarness = ({ request, settings, overdueCount = 0 }) => {
  const mirrorCalls = [];
  const repoCalls = [];
  const repository = {
    async countCurrentOverdue() { return overdueCount; },
    async editAuthoritative(args) {
      repoCalls.push(['edit', args]);
      const next = { ...request, startDate: args.startDate, dueDate: args.dueDate, purpose: args.purpose, userActionRequest: null };
      await args.beforeCommit({ currentRequest: request, nextRequest: next });
      return next;
    },
    async cancelAuthoritative(args) {
      repoCalls.push(['cancel', args]); await args.beforeCommit({ currentRequest: request }); return { deleted: true, request };
    },
    async submitManualExtension(args) {
      repoCalls.push(['manual-extend', args]);
      const next = { ...request, userActionRequest: args.actionRequest };
      await args.beforeCommit({ currentRequest: request, nextRequest: next }); return next;
    },
    async autoExtendAuthoritative(args) {
      repoCalls.push(['auto-extend', args]);
      const next = { ...request, dueDate: args.dueDate, extensionCount: args.extensionCount, extensionHistory: args.extensionHistory, userActionRequest: args.actionRequest };
      await args.beforeCommit({ currentRequest: request, nextRequest: next }); return next;
    },
  };
  const firestoreClient = {
    async getRentalRequest() { return docFor(request); },
    async getRentalAsset() { return assetDocFor(request); },
    async getPublicConfig() { return { fields: { settings } }; },
    async commitUserRequestEdit(args) { mirrorCalls.push(['edit', args]); },
    async commitUserRequestCancel(args) { mirrorCalls.push(['cancel', args]); },
    async commitUserExtension(args) { mirrorCalls.push(['extend', args]); },
  };
  return {
    repository, mirrorCalls, repoCalls,
    service: createRentalRequestUserActionService({ ...context, repository, firestoreClient }),
  };
};

const baseSettings = {
  excludeSaturdays: true, excludeSundays: true, rentalMaxDays: 30,
  allowNonOverlappingSameAssetRequests: true,
  rentalExtensionEnabled: true, rentalExtensionApprovalMode: 'manual',
  rentalExtensionMaxCount: 2, rentalExtensionDays: 2, rentalExtensionRequestWaitDays: 0,
  overdueRentalBlockEnabled: true, postOverduePenaltyEnabled: true,
};

{
  const h = createHarness({ request: baseRequest, settings: baseSettings });
  const result = await h.service.editCurrent('clerk-user', identity, { requestId: baseRequest.id, startDate: '2026-08-11', dueDate: '2026-08-13', purpose: 'edited' });
  assert.equal(result.authority, 'postgresql'); assert.equal(result.operation, 'edit'); assert.equal(result.firestoreMirror, 'synced');
  assert.equal(h.mirrorCalls.at(-1)[0], 'edit'); assert.equal(h.mirrorCalls.at(-1)[1].firebaseIdToken, 'firebase-token');
}
{
  const h = createHarness({ request: baseRequest, settings: baseSettings });
  const result = await h.service.cancelCurrent('clerk-user', identity, { requestId: baseRequest.id });
  assert.equal(result.deleted, true); assert.equal(result.operation, 'cancel'); assert.equal(h.mirrorCalls.at(-1)[0], 'cancel');
}
{
  const rented = { ...baseRequest, status: '대여중', startDate: '2026-08-01', dueDate: '2026-08-20' };
  const h = createHarness({ request: rented, settings: baseSettings });
  const result = await h.service.extendCurrent('clerk-user', identity, { requestId: rented.id });
  assert.equal(result.approvalMode, 'manual'); assert.equal(result.request.userActionRequest.status, 'pending'); assert.equal(h.mirrorCalls.at(-1)[0], 'extend');
}
{
  const rented = { ...baseRequest, status: '대여중', startDate: '2026-08-01', dueDate: '2026-08-20' };
  const h = createHarness({ request: rented, settings: { ...baseSettings, rentalExtensionApprovalMode: 'auto' } });
  const result = await h.service.extendCurrent('clerk-user', identity, { requestId: rented.id });
  assert.equal(result.approvalMode, 'auto'); assert.equal(result.request.userActionRequest.status, 'approved'); assert.ok(result.availability); assert.ok(result.asset); assert.equal(h.mirrorCalls.at(-1)[1].autoApproved, true);
}
{
  const rented = { ...baseRequest, status: '대여중', startDate: '2026-08-01', dueDate: '2026-08-20' };
  const h = createHarness({ request: rented, settings: baseSettings, overdueCount: 1 });
  await assert.rejects(() => h.service.extendCurrent('clerk-user', identity, { requestId: rented.id }), (error) => error.code === 'rental_extension_restriction_blocked');
}

const [repoSource, adminServiceSource, adminFirestoreSource] = await Promise.all([
  readFile(new URL('../../server/src/rentals/rental-request-user-action-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/rentals/admin-rental-request-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/firestore/firestore-admin-rental-requests.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ['pg_advisory_xact_lock', 'countCurrentOverdue', 'editAuthoritative', 'cancelAuthoritative', 'submitManualExtension', 'autoExtendAuthoritative']) assert.ok(repoSource.includes(marker), marker);
assert.ok(adminServiceSource.includes('async reviewUserAction'));
assert.ok(adminFirestoreSource.includes('async commitUserActionReview'));
console.log('[rental-request-user-action-lifecycle-backend-smoke] PASS (direct edit/cancel, manual+auto extension, whole-user overdue restriction, PG locking, admin user-action review bridge)');
