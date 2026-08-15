import assert from 'node:assert/strict';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';

const identity = { uid: 'admin-uid', source: 'clerk-postgresql' };
const baseDocument = {
  name: 'postgresql/app_rental_requests/REQ-P17-1',
  fields: {
    id: 'REQ-P17-1', requesterUid: 'user-uid', requesterEmail: 'user@example.com',
    requesterName: 'Tester', requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1',
    startDate: '2026-08-10', dueDate: '2026-08-11', purpose: 'Phase17 smoke', status: '신청중', adminMemo: '',
  },
};

let changeArgs = null;
const repository = {
  async list() {
    return { requests: [{ ...baseDocument.fields }], totalCount: 1, tabCounts: { pending: 1, rental: 0, closed: 0, returned: 0 } };
  },
  async getCounts() { return { pending: 1, rental: 0, closed: 0, returned: 0 }; },
  async getByRequestId() { return { ...baseDocument.fields }; },
  async listEvents() { return []; },
  async hasOtherCurrentOverdue() { return false; },
  async changeStatus(args) {
    changeArgs = args;
    return Object.freeze({ ...baseDocument.fields, status: args.nextStatus, ...(args.returnFields || {}) });
  },
};
const postgresSource = {
  async getRentalRequest() { return baseDocument; },
  async getRentalAsset() {
    return { name: 'postgresql/app_assets/asset-1', fields: { id: 'asset-1', status: '대여가능', reservations: [] } };
  },
  async getPublicConfig() { return { fields: { settings: { allowNonOverlappingSameAssetRequests: true } } }; },
  async getRentalRestriction() { return null; },
};

const service = createAdminRentalRequestService({ repository, postgresSource });
assert.equal(typeof service.changeStatus, 'function');
const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.source, 'postgresql-authoritative');
assert.equal(bootstrap.skipped, true);
const page = await service.list(identity, { page: 1, pageSize: 10, tab: 'pending' });
assert.equal(page.totalCount, 1);
const dashboard = await service.getDashboard(identity, '2026-08-15');
assert.equal(dashboard.counts.pending, 1);
const result = await service.changeStatus(identity, { requestId: 'REQ-P17-1', nextStatus: '대여중' });
assert.equal(result.authority, 'postgresql');
assert.equal(result.firestoreMirror, 'retired');
assert.equal(result.request.status, '대여중');
assert.equal(changeArgs.requestId, 'REQ-P17-1');
assert.equal(changeArgs.nextStatus, '대여중');
assert.equal(changeArgs.allowNonOverlappingSameAssetRequests, true);

const conflictService = createAdminRentalRequestService({
  repository,
  postgresSource: {
    ...postgresSource,
    async getRentalAsset() {
      return {
        name: 'postgresql/app_assets/asset-1',
        fields: {
          id: 'asset-1', status: '대여중',
          reservations: [{ id: 'REQ-OTHER', laptopId: 'asset-1', startDate: '2026-08-09', dueDate: '2026-08-12', status: '대여중' }],
        },
      };
    },
    async getPublicConfig() { return { fields: { settings: { allowNonOverlappingSameAssetRequests: false } } }; },
  },
});
await assert.rejects(
  () => conflictService.changeStatus(identity, { requestId: 'REQ-P17-1', nextStatus: '대여중' }),
  (error) => error?.code === 'rental_period_conflict',
);

console.log('[admin-rental-request-cutover-backend-smoke] PASS (PostgreSQL admin list/dashboard/status authority + boot-required changeStatus contract + conflict policy)');
