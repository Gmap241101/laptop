import assert from 'node:assert/strict';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';

const identity = { uid: 'admin-uid', idToken: 'firebase-token', source: 'clerk-postgresql' };
const baseFields = {
  id: 'REQ-P18-1', requesterUid: 'user-uid', requesterEmail: 'user@example.com',
  requesterName: 'Tester', requesterTeam: 'QA', laptopId: 'asset-1', assetCategory: '노트북', assetNo: 'A-1',
  startDate: '2026-08-10', dueDate: '2026-08-11', purpose: 'Phase18 smoke', status: '신청중', adminMemo: '',
};
const sourceDocument = {
  name: 'projects/test/databases/(default)/documents/rentalRequests/REQ-P18-1',
  createTime: '2026-08-08T00:00:00.000Z',
  updateTime: '2026-08-08T00:01:00.000Z',
  fields: { ...baseFields },
};
const legacyEvent = {
  id: 'LOG-P18-1', requestId: 'REQ-P18-1', action: 'created', actorUid: 'user-uid', actorName: 'Tester',
  previousStatus: '', nextStatus: '신청중', detail: 'legacy event', createdAt: '2026-08-08T00:00:00.000Z',
};

const mirrorCalls = [];
const firestoreClient = {
  async verifyAdmin() { return { uid: 'admin-uid', adminId: 'admin-uid', name: 'Admin', role: 'admin' }; },
  async listAllRentalRequests() { return [sourceDocument]; },
  async listAllRentalRequestLogs() { return [legacyEvent]; },
  async listRentalRequestLogs() { return [legacyEvent]; },
  async getRentalRequest() { return sourceDocument; },
  async getRentalAsset() {
    return { updateTime: '2026-08-08T00:02:00.000Z', fields: { id: 'asset-1', status: '대여가능', reservations: [] } };
  },
  async getPublicConfig() {
    return { fields: { settings: { allowNonOverlappingSameAssetRequests: true, excludeSaturdays: true, excludeSundays: true } } };
  },
  async getRentalRestriction() { return null; },
  async commitRequestEdit(args) { mirrorCalls.push({ type: 'edit', args }); return { ok: true }; },
  async commitMemo(args) { mirrorCalls.push({ type: 'memo', args }); return { ok: true }; },
  async commitStatusRestore(args) { mirrorCalls.push({ type: 'restore', args }); return { ok: true }; },
  async commitStatusChange(args) { mirrorCalls.push({ type: 'status', args }); return { ok: true }; },
};

const repository = {
  imported: [],
  importedEvents: [],
  events: [legacyEvent],
  request: { ...baseFields },
  async upsertImportedRequests(requests) {
    this.imported.push(...requests);
    if (requests[0]) this.request = { ...this.request, ...requests[0] };
    return requests.length;
  },
  async upsertImportedEvents(requestId, events) {
    this.importedEvents.push({ requestId, events });
    return events.length;
  },
  async listEvents() { return this.events; },
  async list() { return { requests: [this.request], totalCount: 1 }; },
  async getTabCounts() { return { pending: 1, rental: 0, closed: 0, returned: 0 }; },
  async getCounts() { return { pending: 1, rental: 0, closed: 0, returned: 0 }; },
  async hasOtherCurrentOverdue() { return false; },
  async editRequest(args) {
    const currentRequest = { ...this.request };
    const nextRequest = { ...currentRequest, ...args.updates };
    await args.beforeCommit({ currentRequest, nextRequest });
    this.request = nextRequest;
    this.events.unshift({ id: 'PG-EDIT', requestId: args.requestId, action: 'request-edited' });
    return nextRequest;
  },
  async saveMemo(args) {
    const currentRequest = { ...this.request };
    const nextRequest = { ...currentRequest, adminMemo: args.memo };
    await args.beforeCommit({ currentRequest, nextRequest });
    this.request = nextRequest;
    this.events.unshift({ id: 'PG-MEMO', requestId: args.requestId, action: 'memo-changed' });
    return { request: nextRequest, changed: true };
  },
  async changeStatus(args) {
    const currentRequest = { ...this.request };
    const nextRequest = { ...currentRequest, status: args.nextStatus, userActionRequest: args.clearUserActionRequest ? null : currentRequest.userActionRequest };
    await args.beforeCommit({ currentRequest, nextRequest });
    this.request = nextRequest;
    this.events.unshift({ id: 'PG-RESTORE', requestId: args.requestId, action: args.eventType || 'admin-status-changed' });
    return nextRequest;
  },
};

const service = createAdminRentalRequestService({ repository, firestoreClient });
const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.synchronized, 1);
assert.equal(bootstrap.eventCount, 1);
assert.equal(repository.importedEvents.length, 1);

const events = await service.getEvents(identity, 'REQ-P18-1');
assert.equal(events.events.length, 1);
assert.equal(events.events[0].id, 'LOG-P18-1');

const sync = await service.syncRequest(identity, 'REQ-P18-1');
assert.equal(sync.synchronized, 1);
assert.equal(sync.eventCount, 1);

const edited = await service.editRequest(identity, {
  requestId: 'REQ-P18-1',
  form: { startDate: '2026-08-12', dueDate: '2026-08-13', purpose: 'edited purpose', adminMemo: 'edit memo' },
});
assert.equal(edited.authority, 'postgresql');
assert.equal(edited.firestoreMirror, 'synced');
assert.equal(edited.request.startDate, '2026-08-12');
assert.equal(edited.request.purpose, 'edited purpose');
assert.equal(mirrorCalls.at(-1).type, 'edit');
assert.equal(mirrorCalls.at(-1).args.firebaseIdToken, 'firebase-token');

const memo = await service.saveMemo(identity, { requestId: 'REQ-P18-1', memo: 'phase18 memo' });
assert.equal(memo.authority, 'postgresql');
assert.equal(memo.firestoreMirror, 'synced');
assert.equal(memo.request.adminMemo, 'phase18 memo');
assert.equal(mirrorCalls.at(-1).type, 'memo');

const restored = await service.restoreStatus(identity, {
  requestId: 'REQ-P18-1', nextStatus: '보류', restoreReason: 'Phase18 restore smoke',
});
assert.equal(restored.authority, 'postgresql');
assert.equal(restored.firestoreMirror, 'synced');
assert.equal(restored.request.status, '보류');
assert.equal(mirrorCalls.at(-1).type, 'restore');

console.log('[admin-rental-mutation-completion-backend-smoke] PASS (legacy event import/read, targeted sync, authoritative edit/memo/status-restore, Firestore compatibility mirrors)');
