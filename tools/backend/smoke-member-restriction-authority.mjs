import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';
import { createFirestoreMemberAuthorityClient } from '../../server/src/firestore/firestore-members.mjs';

const firebaseUser = { uid: 'firebase-user-1', idToken: 'firebase-user-token' };
const firebaseAdmin = { uid: 'firebase-admin-1', idToken: 'firebase-admin-token' };
const currentAccount = {
  uid: 'firebase-user-1', email: 'user@example.com', maskedEmail: 'u**r@example.com', name: '홍길동', team: '개발팀',
  phone: '010-1234-5678', status: 'active', identityKey: 'old-key', recoveryKey: 'old-recovery',
  directoryMemberId: '', directoryVerifiedVersion: 0, profileRequiredReason: '', rejoinedAccount: false,
  previousAccountUids: [], termsConsentRevision: 3, termsConsentPolicyVersion: 3,
};
let lastProfileMutation = null;
let lastStatusMutation = null;
let adminRegistryInput = null;
const repository = {
  async mutateProfile(args) {
    lastProfileMutation = args;
    await args.beforeMirror({ client: null, mutationId: 'profile-mutation-1' });
    return { mutationId: 'profile-mutation-1', sourceHash: 'member-hash' };
  },
  async mutateStatus(args) {
    lastStatusMutation = args;
    await args.beforeMirror({ client: null, mutationId: 'status-mutation-1' });
    return { mutationId: 'status-mutation-1', sourceHash: 'status-hash' };
  },
  async syncAdminRegistry(admins) {
    adminRegistryInput = admins;
    return admins.map((item) => ({ firebase_uid: item.firebaseUid, admin_login_id: item.adminLoginId, status: 'active', clerk_link_state: 'unlinked' }));
  },
};
const firebaseLinkRepository = {
  async findByFirebaseUid(uid) { return uid === 'firebase-user-1' ? { firebaseUid: uid, appUserId: '1' } : null; },
};
const userRepository = {
  async findByClerkUserId(id) { return id === 'clerk-user-1' ? { id: '1', clerkUserId: id } : null; },
};
const mirrorCalls = [];
const firestoreClient = {
  async verifyAdmin({ firebaseUid }) {
    assert.equal(firebaseUid, firebaseAdmin.uid);
    return { uid: firebaseUid, fields: { adminRole: 'owner' } };
  },
  async getUserAccount({ firebaseUid }) {
    return { updateTime: '2026-08-09T00:00:00.000Z', fields: { ...currentAccount, uid: firebaseUid } };
  },
  async getPublicConfig() { return { fields: { settings: { requireRegisteredMemberForSignup: false, memberDirectoryVersion: 7 } } }; },
  async getIdentityClaim({ identityKey }) {
    if (identityKey === 'old-key') return { updateTime: '2026-08-09T00:00:00.000Z', fields: { identityKey, uid: 'firebase-user-1', currentUid: 'firebase-user-1', status: 'active', formerUids: [] } };
    return null;
  },
  async getDirectoryMember() { return null; },
  async commitProfileEdit(args) { mirrorCalls.push(['profile', args]); return { ok: true }; },
  async commitStatusChange(args) { mirrorCalls.push(['status', args]); return { ok: true }; },
  async listAdminAccounts() {
    return [{
      name: 'projects/test/databases/(default)/documents/adminAccounts/firebase-admin-1', updateTime: '2026-08-09T01:00:00Z',
      fields: { id: 'firebase-admin-1', authUid: 'firebase-admin-1', adminLoginId: 'admin1', authEmail: 'admin@example.com', organizationName: '개발팀', userName: '관리자', phone: '010-9999-9999', adminRole: 'owner' },
    }];
  },
};
const service = createMemberAuthorityService({ repository, firebaseLinkRepository, userRepository, firestoreClient });

const selfEdit = await service.editSelf({
  clerkUserId: 'clerk-user-1', firebaseIdentity: firebaseUser,
  input: { name: '김철수', team: '기획팀', phone: '010-2222-3333', email: 'ignored@example.com' },
});
assert.equal(selfEdit.authority, 'postgresql');
assert.equal(selfEdit.firestoreMirror, 'synced');
assert.equal(selfEdit.mutationId, 'profile-mutation-1');
assert.equal(lastProfileMutation.appUserId, '1');
assert.equal(lastProfileMutation.nextProfile.email, 'user@example.com', 'member email must come from stored account, not browser payload');
assert.equal(lastProfileMutation.nextProfile.name, '김철수');
assert.equal(lastProfileMutation.nextProfile.team, '기획팀');
assert.equal(mirrorCalls.at(-1)[0], 'profile');
assert.equal(mirrorCalls.at(-1)[1].firebaseIdToken, firebaseUser.idToken);

await assert.rejects(
  () => service.editSelf({ clerkUserId: 'clerk-user-1', firebaseIdentity: { uid: 'other-firebase', idToken: 'other-token' }, input: { name: '김철수', team: '기획팀', phone: '010-2222-3333' } }),
  (error) => error?.code === 'legacy_link_token_mismatch',
);

const adminEdit = await service.editAdmin({
  firebaseIdentity: firebaseAdmin, targetUid: 'firebase-user-1',
  input: { name: '박영희', team: '운영팀', phone: '010-5555-6666' },
});
assert.equal(adminEdit.authority, 'postgresql');
assert.equal(lastProfileMutation.actorType, 'admin');
assert.equal(mirrorCalls.at(-1)[1].firebaseIdToken, firebaseAdmin.idToken);

const status = await service.changeStatusAdmin({ firebaseIdentity: firebaseAdmin, targetUid: 'firebase-user-1', nextStatus: 'blocked' });
assert.equal(status.authority, 'postgresql');
assert.equal(status.profile.status, 'blocked');
assert.equal(lastStatusMutation.nextStatus, 'blocked');
assert.equal(mirrorCalls.at(-1)[0], 'status');

const registry = await service.bootstrapAdminRegistry({ firebaseIdentity: firebaseAdmin });
assert.equal(registry.target, 'postgresql-admin-registry');
assert.equal(registry.count, 1);
assert.equal(adminRegistryInput[0].firebaseUid, 'firebase-admin-1');
assert.equal(adminRegistryInput[0].adminLoginId, 'admin1');

const firestoreRequests = [];
const restClient = createFirestoreMemberAuthorityClient({
  projectId: 'phase21-test',
  fetchImpl: async (url, options = {}) => {
    firestoreRequests.push({ url: String(url), options });
    if (String(url).endsWith(':commit')) return new Response(JSON.stringify({ writeResults: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith(':runQuery')) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ name: String(url), fields: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
await restClient.commitProfileEdit({
  targetUid: 'firebase-user-1', currentAccount: currentAccount, currentAccountUpdateTime: '2026-08-09T00:00:00Z',
  nextProfile: { ...currentAccount, name: '김철수', team: '기획팀', identityKey: 'next-key', recoveryKey: 'next-recovery' },
  nextClaim: { formerUids: [] }, nextClaimExists: false,
  previousClaim: { identityKey: 'old-key', currentUid: 'firebase-user-1', formerUids: [] }, previousClaimUpdateTime: '2026-08-09T00:00:00Z',
  nextRecovery: { recoveryKey: 'next-recovery', maskedEmail: 'u**r@example.com', emailVerifier: 'a'.repeat(64) }, previousRecoveryKey: 'old-recovery',
  firebaseIdToken: firebaseUser.idToken,
});
const commitReq = firestoreRequests.find((entry) => entry.url.endsWith(':commit'));
assert.ok(commitReq, 'profile mirror must use Firestore commit');
const commitBody = JSON.parse(commitReq.options.body);
const names = commitBody.writes.map((write) => write?.update?.name || write?.delete || '');
for (const path of ['/documents/memberIdentityClaims/next-key', '/documents/memberIdentityClaims/old-key', '/documents/userAccounts/firebase-user-1', '/documents/accountRecoveryKeys/next-recovery', '/documents/accountRecoveryKeys/old-recovery']) {
  assert.ok(names.some((name) => name.endsWith(path)), `profile mirror path missing: ${path}`);
}

const [migration, repoSource, serviceSource, firestoreSource, appSource, adminRentalSource] = await Promise.all([
  readFile(new URL('../../server/migrations/013_phase21_member_restriction_admin_identity_authority.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/firestore/firestore-members.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/rentals/admin-rental-request-service.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ['app_member_accounts', 'app_member_profile_events', 'app_admin_identity_registry', "'phase', 21"]) assert.ok(migration.includes(marker), marker);
for (const marker of ['mutateProfile', 'mutateStatus', 'upsertRestrictionAuthoritative', 'syncAdminRegistry', "authority_mode='postgresql-authoritative'"]) assert.ok(repoSource.includes(marker), marker);
for (const marker of ['editSelf', 'editAdmin', 'changeStatusAdmin', 'bootstrapAdminRegistry', 'legacy_link_token_mismatch']) assert.ok(serviceSource.includes(marker), marker);
for (const marker of ['commitProfileEdit', 'commitStatusChange', 'adminAccounts/', 'rentalRestrictions/']) assert.ok(firestoreSource.includes(marker), marker);
for (const marker of ['/api/users/me/member-profile', '/api/admin/members/:uid/profile', '/api/admin/members/:uid/status', '/api/admin/identity-registry/bootstrap']) assert.ok(appSource.includes(marker), marker);
assert.ok(adminRentalSource.includes('upsertRestrictionAuthoritative'), 'rental return/user-action restriction writes must also update PostgreSQL authority');
assert.ok(repoSource.includes('firebase_uid AS uid'), 'canonical member lookup must project firebase UID as the legacy uid contract');
assert.ok(repoSource.includes('`rentalRestrictions/${firebaseUid}`'), 'restriction authority source path must preserve the Firestore collection path without a fake project ID');
console.log('[member-restriction-authority-backend-smoke] PASS (self/admin member authority, status, restriction authority hook, admin registry, Firestore compatibility commit paths)');
