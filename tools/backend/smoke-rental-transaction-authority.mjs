import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRentalRequestWriteService } from '../../server/src/rentals/rental-request-write-service.mjs';
import { createRentalRequestUserActionService } from '../../server/src/rentals/rental-request-user-action-service.mjs';
import { createAdminRentalRequestService } from '../../server/src/rentals/admin-rental-request-service.mjs';

const firebaseIdentity = { uid: 'firebase-user', email: 'user@example.com', idToken: 'firebase-token' };
let firestoreReads = 0;
let firestoreMirrors = 0;
const forbidden = () => { firestoreReads += 1; throw new Error('Firestore rental transaction source must be skipped in Phase 29.'); };
const forbiddenMirror = () => { firestoreMirrors += 1; throw new Error('Firestore rental request write mirror must be retired in Phase 29.'); };

const userRepository = { async findByClerkUserId() { return { id: 1, clerkUserId: 'clerk-user' }; } };
const firebaseLinkRepository = {
  async findByAppUserId() { return { appUserId: 1, firebaseUid: 'firebase-user', firebaseEmail: 'user@example.com' }; },
};
const memberShadowRepository = { async findByAppUserId() { return { status: 'active', email: 'user@example.com', name: '테스트', team: '테스트팀', previousAccountUids: [] }; } };
const rentalRestrictionService = {
  async getCurrentByFirebaseIdentity() { return { exists: false, restriction: null }; },
  async syncLinkedFirebaseUid() { throw new Error('Firestore restriction source sync must be skipped'); },
};
const rentalRequestService = {
  async getCurrent() { return { requests: [] }; },
  async syncCurrent() { throw new Error('Firestore rental request source sync must be skipped'); },
};
let postgresAssetReads = 0;
const postgresSource = {
  async getPublicConfig() { return { name: 'postgresql/rentalSystem/publicConfig', fields: { settings: { allowNonOverlappingSameAssetRequests: true, maxRentalDays: 30 } } }; },
  async getRentalAsset() {
    postgresAssetReads += 1;
    const reservations = postgresAssetReads === 1
      ? [{ id: 'REQ-OTHER0001', laptopId: 'NB-1', startDate: '2026-09-01', dueDate: '2026-09-02', status: '신청중' }]
      : [{ id: 'REQ-TEST0001', laptopId: 'NB-1', startDate: '2026-08-20', dueDate: '2026-08-21', status: '신청중' }, { id: 'REQ-OTHER0001', laptopId: 'NB-1', startDate: '2026-09-01', dueDate: '2026-09-02', status: '신청중' }];
    return { name: 'postgresql/rentalAssets/NB-1', fields: { id: 'NB-1', category: '노트북', assetNo: 'A-001', status: '대여가능', reservations } };
  },
  async getRentalRequest() { return { name: 'postgresql/rentalRequests/REQ-TEST0001', fields: { id: 'REQ-TEST0001', requesterUid: 'firebase-user', requesterEmail: 'user@example.com', requesterName: '테스트', requesterTeam: '테스트팀', team: '테스트팀', borrower: '테스트', laptopId: 'NB-1', assetCategory: '노트북', assetNo: 'A-001', startDate: '2026-08-20', dueDate: '2026-08-21', purpose: '테스트', status: '신청중', reservations: [] } }; },
  async getRentalRestriction() { return null; },
};
const firestoreWriteClient = {
  getPublicConfig: forbidden,
  getRentalAsset: forbidden,
  getRentalRequest: forbidden,
  commitRentalRequestCreate: forbiddenMirror,
  commitUserRequestEdit: forbiddenMirror,
  commitUserRequestCancel: forbiddenMirror,
  commitUserExtension: forbiddenMirror,
};
let createArgs = null;
const rentalRequestWriteRepository = {
  async createAuthoritative(args) {
    createArgs = args;
    const mirror = await args.beforeCommit({ id: args.requestId });
    return { request: { id: args.requestId, firestoreMirrorStatus: mirror?.retired ? 'retired' : 'synced' }, reused: false, mirrorResult: mirror };
  },
};
const writeService = createRentalRequestWriteService({
  userRepository, firebaseLinkRepository, memberShadowRepository, rentalRestrictionService, rentalRequestService,
  rentalRequestWriteRepository, firestoreRentalRequestWriteClient: firestoreWriteClient, postgresSource, writeMirrorEnabled: false,
});
const created = await writeService.createCurrent('clerk-user', firebaseIdentity, {
  requestId: 'REQ-TEST0001', idempotencyKey: 'REQ-TEST0001', laptopId: 'NB-1', startDate: '2026-08-20', dueDate: '2026-08-21', purpose: '테스트',
});
assert.equal(created.authority, 'postgresql');
assert.equal(created.transactionSource, 'postgresql');
assert.equal(created.firestoreMirror, 'retired');
assert.deepEqual(createArgs.sourceReservations, []);

let editMirrorStatus = '';
const userActionRepository = {
  async countCurrentOverdue() { return 0; },
  async editAuthoritative(args) { editMirrorStatus = args.firestoreMirrorStatus; assert.equal(args.beforeCommit, undefined); return { id: args.requestId, status: '신청중' }; },
  async cancelAuthoritative() { return { request: { id: 'REQ-TEST0001' } }; },
  async submitManualExtension() { return { id: 'REQ-TEST0001' }; },
  async autoExtendAuthoritative() { return { id: 'REQ-TEST0001' }; },
};
const userAction = createRentalRequestUserActionService({
  userRepository, firebaseLinkRepository, memberShadowRepository, rentalRestrictionService, rentalRequestService,
  repository: userActionRepository, firestoreClient: firestoreWriteClient, postgresSource, writeMirrorEnabled: false,
});
const edited = await userAction.editCurrent('clerk-user', firebaseIdentity, { requestId: 'REQ-TEST0001', startDate: '2026-08-20', dueDate: '2026-08-21', purpose: '수정' });
assert.equal(edited.firestoreMirror, 'retired');
assert.equal(edited.transactionSource, 'postgresql');
assert.equal(editMirrorStatus, 'retired');

let adminVerifyCalls = 0;
let adminImportCalls = 0;
let retiredCalls = 0;
const adminFirestoreClient = {
  async verifyAdmin() { adminVerifyCalls += 1; return { uid: 'firebase-admin', role: 'admin', fields: { adminRole: 'admin' } }; },
  getRentalRequest: forbidden, getRentalAsset: forbidden, getPublicConfig: forbidden, getRentalRestriction: forbidden,
  commitRequestEdit: forbiddenMirror, commitMemo: forbiddenMirror, commitStatusRestore: forbiddenMirror, commitUserActionReview: forbiddenMirror, commitStatusChange: forbiddenMirror,
  async listAllRentalRequests() { return []; }, async listAllRentalRequestLogs() { return []; }, async listRentalRequestLogs() { return []; },
};
const adminRepository = {
  async list() { return { requests: [], totalCount: 0 }; }, async getCounts() { return {}; },
  async upsertImportedRequests() { adminImportCalls += 1; return 1; }, async upsertImportedEvents() { return 0; }, async listEvents() { return []; },
  async editRequest({ requestId, updates, beforeCommit }) { assert.equal(beforeCommit, undefined); return { id: requestId, requesterUid: 'firebase-user', requesterName: '테스트', requesterTeam: '테스트팀', laptopId: 'NB-1', assetCategory: '노트북', assetNo: 'A-001', startDate: updates.startDate, dueDate: updates.dueDate, purpose: updates.purpose, status: '신청중', adminMemo: updates.adminMemo }; },
  async markMirrorRetired() { retiredCalls += 1; },
};
const adminService = createAdminRentalRequestService({ repository: adminRepository, firestoreClient: adminFirestoreClient, postgresSource, writeMirrorEnabled: false });
const adminEdited = await adminService.editRequest({ uid: 'firebase-admin', idToken: 'admin-token' }, { requestId: 'REQ-TEST0001', form: { startDate: '2026-08-20', dueDate: '2026-08-21', purpose: '관리자 수정', adminMemo: '' } });
assert.equal(adminEdited.firestoreMirror, 'retired');
assert.equal(adminEdited.transactionSource, 'postgresql');
assert.equal(adminVerifyCalls, 1, 'Firebase administrator identity verification must remain');
assert.equal(adminImportCalls, 0, 'PostgreSQL mutation source must not be re-imported as Firestore source');
assert.equal(retiredCalls, 1);
assert.equal(firestoreReads, 0);
assert.equal(firestoreMirrors, 0);

const envSource = readFileSync('server/src/config/env.mjs', 'utf8');
const indexSource = readFileSync('server/src/index.mjs', 'utf8');
const migration = readFileSync('server/migrations/020_phase29_rental_transaction_postgresql_authority.sql', 'utf8');
for (const marker of ['FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED', 'rentalRequestWriteMirrorDisabled']) assert.ok(envSource.includes(marker), marker);
for (const marker of ['createRentalPostgresqlSource', 'writeMirrorEnabled: !config.rentalRequestWriteMirrorDisabled', 'useAuthoritativeSource: config.rentalRequestWriteMirrorDisabled']) assert.ok(indexSource.includes(marker), marker);
for (const marker of ["'phase', 29", "'rentalTransactionSource', 'postgresql-authoritative'", "'rentalRequestFirestoreWriteMirror', 'retired-staging-opt-in'"]) assert.ok(migration.includes(marker), marker);
console.log('[rental-transaction-authority-backend-smoke] PASS (PostgreSQL transaction source + rental request Firestore write mirror retirement while Firebase admin identity remains)');
