import assert from 'node:assert/strict';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';

const identity = { uid: 'admin-uid', idToken: 'firebase-token' };
const sourceDocument = {
  name: 'projects/test/databases/(default)/documents/rentalRequests/REQ-P17-1',
  createTime: '2026-08-08T00:00:00.000Z',
  updateTime: '2026-08-08T00:01:00.000Z',
  fields: {
    id: 'REQ-P17-1', requesterUid: 'user-uid', requesterEmail: 'user@example.com',
    requesterName: 'Tester', requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1',
    startDate: '2026-08-10', dueDate: '2026-08-11', purpose: 'Phase17 smoke', status: '신청중',
  },
};

let mirrorCall = null;
let changeArgs = null;
const firestoreClient = {
  async verifyAdmin() { return { uid: 'admin-uid', adminId: 'admin-uid', name: 'Admin', role: 'admin' }; },
  async listAllRentalRequests() { return [sourceDocument]; },
  async getRentalRequest() { return sourceDocument; },
  async getRentalAsset() {
    return { updateTime: '2026-08-08T00:02:00.000Z', fields: { id: 'asset-1', status: '대여가능', reservations: [] } };
  },
  async getPublicConfig() { return { fields: { settings: { allowNonOverlappingSameAssetRequests: true } } }; },
  async getRentalRestriction() { return null; },
  async commitStatusChange(args) { mirrorCall = args; return { ok: true }; },
};
const repository = {
  imported: [],
  async upsertImportedRequests(requests) { this.imported.push(...requests); return requests.length; },
  async list() { return { requests: [{ id: 'REQ-P17-1' }], totalCount: 1 }; },
  async getCounts() { return { pending: 1, rental: 0, closed: 0, returned: 0 }; },
  async hasOtherCurrentOverdue() { return false; },
  async changeStatus(args) {
    changeArgs = args;
    const currentRequest = this.imported.at(-1);
    const nextRequest = { ...currentRequest, status: args.nextStatus, ...(args.returnFields || {}) };
    await args.beforeCommit({ currentRequest, nextRequest });
    return nextRequest;
  },
};

const service = createAdminRentalRequestService({ repository, firestoreClient });
const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.synchronized, 1);
assert.equal(bootstrap.sourceCount, 1);
const page = await service.list(identity, { page: 1, pageSize: 10, tab: 'pending' });
assert.equal(page.totalCount, 1);
const result = await service.changeStatus(identity, { requestId: 'REQ-P17-1', nextStatus: '대여중' });
assert.equal(result.authority, 'postgresql');
assert.equal(result.firestoreMirror, 'synced');
assert.equal(result.request.status, '대여중');
assert.equal(changeArgs.allowNonOverlappingSameAssetRequests, true);
assert.equal(mirrorCall.request.status, '대여중');
assert.equal(mirrorCall.firebaseIdToken, 'firebase-token');

const conflictFirestore = {
  ...firestoreClient,
  async getRentalAsset() {
    return {
      updateTime: '2026-08-08T00:02:00.000Z',
      fields: {
        id: 'asset-1', status: '대여중',
        reservations: [{ id: 'REQ-OTHER', laptopId: 'asset-1', startDate: '2026-08-20', dueDate: '2026-08-21', status: '대여중' }],
      },
    };
  },
  async getPublicConfig() { return { fields: { settings: { allowNonOverlappingSameAssetRequests: false } } }; },
};
const conflictService = createAdminRentalRequestService({ repository, firestoreClient: conflictFirestore });
await assert.rejects(
  () => conflictService.changeStatus(identity, { requestId: 'REQ-P17-1', nextStatus: '대여중' }),
  (error) => error?.code === 'rental_period_conflict',
);

console.log('[admin-rental-request-cutover-backend-smoke] PASS (admin auth, bootstrap, PostgreSQL list/status authority, source reservation policy, Firestore compatibility mirror)');
