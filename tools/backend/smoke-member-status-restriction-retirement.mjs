import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';
import { createMemberAuthorityRepository } from '../../server/src/members/member-authority-repository.mjs';

const firebaseAdmin = { uid: 'firebase-admin-phase30', idToken: 'firebase-admin-token-phase30' };
const member = {
  appUserId: '101',
  firebaseUid: 'firebase-member-phase30',
  uid: 'firebase-member-phase30',
  email: 'member@example.com',
  maskedEmail: 'm****r@example.com',
  name: '홍길동',
  team: '채용대행팀',
  phone: '010-1234-5678',
  status: 'active',
  directoryMemberId: 'dir-101',
  directoryVerifiedVersion: 3,
  profileRequiredReason: '',
  rejoinedAccount: false,
  termsConsentRevision: 2,
  termsConsentPolicyVersion: 2,
  identityKey: 'identity-key',
  recoveryKey: 'recovery-key',
  previousAccountUids: [],
};

let firestoreAccountReads = 0;
let firestoreStatusCommits = 0;
let lastStatusMutation = null;
const repository = {
  async mutateProfile() { return { mutationId: 'unused-profile' }; },
  async findByFirebaseUid(uid) { return uid === member.firebaseUid ? member : null; },
  async listMembers({ status, search, page, pageSize }) {
    assert.equal(status, 'active');
    assert.equal(search, '홍길동');
    assert.equal(page, 2);
    assert.equal(pageSize, 10);
    return { source: 'postgresql', accounts: [member], page, pageSize, totalCount: 11, hasNextPage: false };
  },
  async getStatusCounts() { return { pending: 1, active: 11, profileRequired: 2, blocked: 3, retired: 4 }; },
  async countBlockingRentalRequestsForUids() { return 0; },
  async mutateStatus(args) {
    lastStatusMutation = args;
    assert.equal(typeof args.beforeMirror, 'object', 'retired mode should pass null beforeMirror');
    assert.equal(args.beforeMirror, null);
    return { mutationId: 'phase30-status-mutation', sourceHash: 'status-hash' };
  },
};
const rentalRestrictionRepository = {
  async findByFirebaseUid(uid) {
    assert.equal(uid, member.firebaseUid);
    return { exists: false, restriction: null, mirrorState: 'synced' };
  },
};
const firebaseLinkRepository = {
  async findByFirebaseUid(uid) { return uid === member.firebaseUid ? { firebaseUid: uid, appUserId: member.appUserId } : null; },
};
const userRepository = { async findByClerkUserId() { return null; } };
const firestoreClient = {
  async verifyAdmin({ firebaseUid, firebaseIdToken }) {
    assert.equal(firebaseUid, firebaseAdmin.uid);
    assert.equal(firebaseIdToken, firebaseAdmin.idToken);
    return { uid: firebaseUid, fields: { adminRole: 'owner' } };
  },
  async getUserAccount() { firestoreAccountReads += 1; throw new Error('normal Phase 30 status authority must not read Firestore member source'); },
  async commitStatusChange() { firestoreStatusCommits += 1; throw new Error('Phase 30 status authority must not mirror to Firestore'); },
};

const service = createMemberAuthorityService({
  repository,
  firebaseLinkRepository,
  userRepository,
  firestoreClient,
  rentalRestrictionRepository,
  writeMirrorEnabled: false,
});

const listed = await service.listAdminMembers({ firebaseIdentity: firebaseAdmin, status: 'active', search: '홍길동', page: 2, pageSize: 10 });
assert.equal(listed.source, 'postgresql');
assert.equal(listed.totalCount, 11);
assert.equal(listed.accounts[0].uid, member.uid);
assert.equal(listed.statusCounts.active, 11);

const changed = await service.changeStatusAdmin({ firebaseIdentity: firebaseAdmin, targetUid: member.firebaseUid, nextStatus: 'blocked' });
assert.equal(changed.authority, 'postgresql');
assert.equal(changed.source, 'postgresql-authoritative');
assert.equal(changed.firestoreMirror, 'retired');
assert.equal(changed.profile.status, 'blocked');
assert.equal(lastStatusMutation.mirrorState, 'retired');
assert.equal(lastStatusMutation.nextStatus, 'blocked');
assert.equal(firestoreAccountReads, 0);
assert.equal(firestoreStatusCommits, 0);

const rejoinedService = createMemberAuthorityService({
  repository: {
    ...repository,
    async findByFirebaseUid(uid) { return uid === member.firebaseUid ? { ...member, rejoinedAccount: true, previousAccountUids: ['firebase-member-old'] } : null; },
    async countBlockingRentalRequestsForUids(uids) {
      assert.deepEqual([...uids].sort(), ['firebase-member-old', member.firebaseUid].sort());
      return 1;
    },
  },
  firebaseLinkRepository, userRepository, firestoreClient, rentalRestrictionRepository, writeMirrorEnabled: false,
});
await assert.rejects(
  () => rejoinedService.changeStatusAdmin({ firebaseIdentity: firebaseAdmin, targetUid: member.firebaseUid, nextStatus: 'active' }),
  (error) => error?.code === 'rejoined_member_active_requests' && error?.status === 409,
);
assert.equal(firestoreAccountReads, 0, 'rejoined active-request guard must use PostgreSQL, not Firestore rental/member data');

// Repository SQL contract: server-side search/filter/page must bind contiguous placeholders.
const queries = [];
const pool = {
  async connect() { throw new Error('list smoke must not open a transaction'); },
  async query(sql, values = []) {
    queries.push({ sql: String(sql), values });
    if (String(sql).includes('COUNT(*)::bigint')) return { rows: [{ count: '11' }] };
    if (String(sql).includes('GROUP BY status')) return { rows: [{ status: 'active', count: '11' }] };
    return { rows: [{
      app_user_id: '101', firebase_uid: member.uid, email: member.email, masked_email: member.maskedEmail,
      name: member.name, team: member.team, phone: member.phone, status: 'active', directory_member_id: 'dir-101',
      directory_verified_version: 3, profile_required_reason: '', rejoined_account: false,
      terms_consent_revision: 2, terms_consent_policy_version: 2, identity_key: 'identity-key', recovery_key: 'recovery-key',
      previous_account_uids: [], authority_mode: 'postgresql-authoritative', mirror_state: 'retired', last_mutation_id: 'm1',
      synced_at: '2026-08-11T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z',
    }] };
  },
};
const sqlRepo = createMemberAuthorityRepository(pool);
const sqlList = await sqlRepo.listMembers({ status: 'active', search: 'member', page: 2, pageSize: 10 });
assert.equal(sqlList.source, 'postgresql');
assert.equal(sqlList.accounts[0].uid, member.uid);
const listQuery = queries.find(({ sql }) => sql.includes('FROM app_member_accounts') && sql.includes('ORDER BY'));
assert.ok(listQuery, 'member list query must execute');
const refs = [...listQuery.sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
assert.deepEqual([...new Set(refs)].sort((a, b) => a - b), [1, 2, 3, 4], 'member list placeholders must be contiguous');
assert.equal(listQuery.values.length, 4, 'member list bound values must match placeholders');
assert.ok(listQuery.sql.includes('lower(name) LIKE $2'), 'member search must run in PostgreSQL');
const blockingCount = await sqlRepo.countBlockingRentalRequestsForUids([member.uid, 'firebase-member-old']);
assert.equal(blockingCount, 11);
const blockingQuery = queries.find(({ sql }) => sql.includes('FROM app_rental_requests') && sql.includes("status IN ('신청중','보류','대여중')"));
assert.ok(blockingQuery, 'rejoined member active-request guard must query PostgreSQL rentals');
assert.deepEqual(blockingQuery.values[0], [member.uid, 'firebase-member-old']);

const [migration, serviceSource, repoSource, appSource, envSource] = await Promise.all([
  readFile(new URL('../../server/migrations/022_phase30_member_status_restriction_write_mirror_retirement.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/config/env.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ["'phase', 30", "'member_status_source', 'postgresql-authoritative'", "'member_profile_edit_mirror', 'preserved-until-identity-directory-cutover'"]) assert.ok(migration.includes(marker), marker);
for (const marker of ['listAdminMembers', 'writeMirrorEnabled', "source: writeMirrorEnabled ? 'firestore-compatibility' : 'postgresql-authoritative'", "firestoreMirror: writeMirrorEnabled ? 'synced' : 'retired'"]) assert.ok(serviceSource.includes(marker), marker);
for (const marker of ['listMembers', 'getStatusCounts', 'countBlockingRentalRequestsForUids', "status IN ('신청중','보류','대여중')", "mirrorState === 'retired' ? 'retired' : 'synced'"]) assert.ok(repoSource.includes(marker), marker);
assert.ok(appSource.includes("'/api/admin/members'"), 'Phase 30 admin member API must be exposed');
assert.ok(envSource.includes('FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED'), 'Phase 30 backend flag must exist');
console.log('[member-status-restriction-retirement-backend-smoke] PASS (PostgreSQL admin member read/status authority, rejoined active-rental guard, no Firestore status mirror, pagination SQL, Phase 30 contracts)');
