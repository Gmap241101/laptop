import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';

const identity = { uid: 'admin-uid', source: 'clerk-postgresql' };
let current = {
  id: 'REQ-P18-1', requesterUid: 'user-uid', requesterEmail: 'user@example.com',
  requesterName: 'Tester', requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1',
  startDate: '2026-08-10', dueDate: '2026-08-11', purpose: 'Phase18 smoke', status: '신청중', adminMemo: '',
  userActionRequest: null,
};
const asDocument = () => ({ name: `postgresql/app_rental_requests/${current.id}`, fields: { ...current } });
const events = [{ id: 'LOG-P18-1', requestId: current.id, action: 'created' }];
let lastMutation = null;
const repository = {
  async list() { return { requests: [{ ...current }], totalCount: 1, tabCounts: { pending: 1, rental: 0, closed: 0, returned: 0 } }; },
  async getCounts() { return { pending: 1, rental: 0, closed: 0, returned: 0 }; },
  async getByRequestId() { return { ...current }; },
  async listEvents() { return [...events]; },
  async hasOtherCurrentOverdue() { return false; },
  async editRequest(args) {
    lastMutation = { type: 'edit', args };
    current = { ...current, ...args.updates };
    return Object.freeze({ ...current });
  },
  async saveMemo(args) {
    lastMutation = { type: 'memo', args };
    current = { ...current, adminMemo: args.memo };
    return { request: Object.freeze({ ...current }), changed: true };
  },
  async changeStatus(args) {
    lastMutation = { type: args.eventType === 'status-restored' ? 'restore' : 'status', args };
    current = { ...current, status: args.nextStatus, ...(args.returnFields || {}), userActionRequest: args.clearUserActionRequest ? null : current.userActionRequest };
    return Object.freeze({ ...current });
  },
  async reviewUserAction(args) {
    lastMutation = { type: 'review', args };
    current = { ...current, ...args.nextRequest };
    return Object.freeze({ ...current });
  },
};
const postgresSource = {
  async getRentalRequest() { return asDocument(); },
  async getRentalAsset() {
    return {
      name: 'postgresql/app_assets/asset-1',
      fields: {
        id: 'asset-1', status: '대여가능',
        reservations: [{ id: current.id, laptopId: 'asset-1', startDate: current.startDate, dueDate: current.dueDate, status: current.status }],
      },
    };
  },
  async getPublicConfig() {
    return { fields: { settings: { allowNonOverlappingSameAssetRequests: true, excludeSaturdays: false, excludeSundays: false } } };
  },
  async getRentalRestriction() { return null; },
};

const service = createAdminRentalRequestService({ repository, postgresSource });
const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.skipped, true);
const eventsResult = await service.getEvents(identity, current.id);
assert.equal(eventsResult.events.length, 1);
const sync = await service.syncRequest(identity, current.id);
assert.equal(sync.skipped, true);

const edited = await service.editRequest(identity, {
  requestId: current.id,
  form: { startDate: '2026-08-12', dueDate: '2026-08-13', purpose: 'edited purpose', adminMemo: 'edit memo' },
});
assert.equal(edited.authority, 'postgresql');
assert.equal(edited.request.startDate, '2026-08-12');
assert.equal(lastMutation.type, 'edit');

const memo = await service.saveMemo(identity, { requestId: current.id, memo: 'phase18 memo' });
assert.equal(memo.authority, 'postgresql');
assert.equal(memo.request.adminMemo, 'phase18 memo');
assert.equal(lastMutation.type, 'memo');

const approved = await service.changeStatus(identity, {
  requestId: current.id, nextStatus: '대여중',
});
assert.equal(approved.authority, 'postgresql');
assert.equal(approved.request.status, '대여중');
assert.equal(lastMutation.type, 'status');
assert.equal(lastMutation.args.eventType, 'status-changed');

const restored = await service.restoreStatus(identity, {
  requestId: current.id, nextStatus: '보류', restoreReason: 'Phase18 restore smoke',
});
assert.equal(restored.authority, 'postgresql');
assert.equal(restored.request.status, '보류');
assert.equal(lastMutation.type, 'restore');

current = {
  ...current,
  status: '보류',
  userActionRequest: { type: 'cancel', status: 'pending', reason: 'smoke' },
};
const denied = await service.reviewUserAction(identity, { requestId: current.id, approved: false });
assert.equal(denied.authority, 'postgresql');
assert.equal(denied.restrictionUpdated, false);
assert.equal(lastMutation.type, 'review');
assert.equal(lastMutation.args.nextRequest.userActionRequest.status, 'denied');


const [appSource, repositorySource] = await Promise.all([
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/rentals/admin-rental-request-repository.mjs', import.meta.url), 'utf8'),
]);
assert.match(appSource, /authenticateAdminPostgresqlIdentity[\s\S]*adminClerkAuthService\.authorizeCurrent/);
assert.match(appSource, /adminRequestActionMatch[\s\S]*authenticateAdminPostgresqlIdentity/);
assert.match(appSource, /adminUserActionReviewMatch[\s\S]*authenticateAdminPostgresqlIdentity/);
assert.match(appSource, /adminStatusMatch[\s\S]*authenticateAdminPostgresqlIdentity/);
assert.match(repositorySource, /eventType = 'status-changed'/);
assert.match(repositorySource, /=== 'admin-status-changed'[\s\S]*\? 'status-changed'/);

console.log('[admin-rental-mutation-completion-backend-smoke] PASS (PostgreSQL edit/memo/status-restore/user-action review current contracts)');
