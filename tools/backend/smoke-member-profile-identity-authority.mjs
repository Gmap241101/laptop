import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';

const firebaseUser = { uid: 'firebase-member-phase31', idToken: 'firebase-user-token-phase31' };
const firebaseAdmin = { uid: 'firebase-admin-phase31', idToken: 'firebase-admin-token-phase31' };
const member = {
  appUserId: '201', firebaseUid: firebaseUser.uid, uid: firebaseUser.uid,
  email: 'member@example.com', maskedEmail: 'm****r@example.com', name: '홍길동', team: '채용대행팀', phone: '010-1234-5678',
  status: 'active', directoryMemberId: 'dir-old', directoryVerifiedVersion: 2, profileRequiredReason: '', rejoinedAccount: false,
  termsConsentRevision: 2, termsConsentPolicyVersion: 2, identityKey: 'old-key', recoveryKey: 'old-recovery', previousAccountUids: [],
};
let firestoreAccountReads = 0;
let firestoreClaimReads = 0;
let firestoreProfileCommits = 0;
let firestoreDirectoryListReads = 0;
let lastMutation = null;
let directoryReplace = null;

const repository = {
  async mutateProfile(args) {
    lastMutation = args;
    assert.equal(args.beforeMirror, null);
    assert.equal(args.mirrorState, 'retired');
    return { mutationId: 'phase31-profile-mutation', sourceHash: 'profile-hash' };
  },
  async findByFirebaseUid(uid) { return uid === member.firebaseUid ? member : null; },
  async findActiveIdentityOwner() { return null; },
  async getDirectoryBootstrapState() { return { completed: true, version: 7, documentCount: 2 }; },
  async findDirectoryEntryByIdentityKey() { return { identityKey: 'computed', directoryMemberId: 'dir-201', name: '홍길동', team: '채용대행팀', enabled: true }; },
  async replaceDirectoryEntries(entries, options) { directoryReplace = { entries, options }; return { completed: true, documentCount: entries.length, version: options.version }; },
  async countBlockingRentalRequestsForUids() { return 0; },
  async getFullBootstrapState() { return { completed: true }; },
  async bootstrapMemberAccounts() { throw new Error('full member bootstrap should not run'); },
  async listMembers() { return { source: 'postgresql', accounts: [], totalCount: 0, page: 1, pageSize: 10, hasNextPage: false }; },
  async getStatusCounts() { return { pending: 0, active: 1, profileRequired: 0, blocked: 0, retired: 0 }; },
};
const firebaseLinkRepository = { async findByFirebaseUid(uid) { return uid === firebaseUser.uid ? { appUserId: member.appUserId, firebaseUid: uid } : null; } };
const userRepository = { async findByClerkUserId(id) { return id === 'clerk-user-phase31' ? { id: member.appUserId, clerkUserId: id } : null; } };
const rentalRestrictionRepository = { async findByFirebaseUid() { return { exists: false, restriction: null }; } };
const firestoreClient = {
  async verifyAdmin({ firebaseUid, firebaseIdToken }) { assert.equal(firebaseUid, firebaseAdmin.uid); assert.equal(firebaseIdToken, firebaseAdmin.idToken); return { uid: firebaseUid, fields: { adminRole: 'owner' } }; },
  async getUserAccount() { firestoreAccountReads += 1; throw new Error('Phase 31 profile authority must not read Firestore userAccounts.'); },
  async getIdentityClaim() { firestoreClaimReads += 1; throw new Error('Phase 31 profile authority must not read Firestore memberIdentityClaims.'); },
  async getPublicConfig() { throw new Error('Phase 31 profile authority must use PostgreSQL policy content.'); },
  async getDirectoryMember() { throw new Error('Phase 31 profile authority must use PostgreSQL directory entries.'); },
  async commitProfileEdit() { firestoreProfileCommits += 1; throw new Error('Phase 31 profile authority must not mirror profile edits to Firestore.'); },
  async listDirectoryMembers() { firestoreDirectoryListReads += 1; return []; },
  async listUserAccounts() { return []; },
};
const siteContentRepository = {
  async getDomain(domain) {
    assert.equal(domain, 'rental-config');
    return { documents: [{ key: 'rentalSystem/publicConfig', payload: { settings: { requireRegisteredMemberForSignup: true, memberDirectoryVersion: 7 } } }] };
  },
};

const service = createMemberAuthorityService({
  repository, firebaseLinkRepository, userRepository, firestoreClient, rentalRestrictionRepository, siteContentRepository,
  writeMirrorEnabled: false, profileWriteMirrorEnabled: false,
});
const self = await service.editSelf({ clerkUserId: 'clerk-user-phase31', firebaseIdentity: firebaseUser, input: { name: '홍길동', team: '채용대행팀', phone: '010-9876-5432', email: member.email } });
assert.equal(self.authority, 'postgresql');
assert.equal(self.source, 'postgresql-authoritative');
assert.equal(self.firestoreMirror, 'retired');
assert.equal(self.identitySource, 'postgresql');
assert.equal(self.recoverySource, 'postgresql');
assert.equal(lastMutation.nextProfile.directoryMemberId, 'dir-201');
assert.equal(lastMutation.nextProfile.directoryVerifiedVersion, 7);
assert.equal(firestoreAccountReads, 0);
assert.equal(firestoreClaimReads, 0);
assert.equal(firestoreProfileCommits, 0);
assert.equal(firestoreDirectoryListReads, 0, 'completed directory bootstrap must not reread Firestore');

const directoryVerification = await service.verifySelfDirectory({
  clerkUserId: 'clerk-user-phase31',
  firebaseIdentity: firebaseUser,
});
assert.equal(directoryVerification.authority, 'postgresql');
assert.equal(directoryVerification.source, 'postgresql-authoritative');
assert.equal(directoryVerification.firestoreMirror, 'retired');
assert.equal(directoryVerification.verified, true);
assert.equal(directoryVerification.profile.status, 'active');
assert.equal(directoryVerification.profile.directoryMemberId, 'dir-201');
assert.equal(directoryVerification.profile.directoryVerifiedVersion, 7);
assert.equal(lastMutation.action, 'user-directory-membership-verify');
assert.equal(firestoreAccountReads, 0, 'PostgreSQL directory verification must not read Firestore userAccounts');
assert.equal(firestoreDirectoryListReads, 0, 'PostgreSQL directory verification must not bootstrap Firestore from a general-user token');

const staleDirectoryService = createMemberAuthorityService({
  repository: { ...repository, async getDirectoryBootstrapState() { return { completed: true, version: 6 }; } },
  firebaseLinkRepository, userRepository, firestoreClient, rentalRestrictionRepository, siteContentRepository,
  writeMirrorEnabled: false, profileWriteMirrorEnabled: false,
});
await assert.rejects(
  () => staleDirectoryService.verifySelfDirectory({ clerkUserId: 'clerk-user-phase31', firebaseIdentity: firebaseUser }),
  (error) => error?.code === 'member_directory_postgresql_stale' && error?.status === 503,
);

const mismatchDirectoryService = createMemberAuthorityService({
  repository: {
    ...repository,
    async findDirectoryEntryByIdentityKey() { return null; },
    async findActiveIdentityOwner() { return null; },
  },
  firebaseLinkRepository, userRepository, firestoreClient, rentalRestrictionRepository, siteContentRepository,
  writeMirrorEnabled: false, profileWriteMirrorEnabled: false,
});
const mismatchVerification = await mismatchDirectoryService.verifySelfDirectory({
  clerkUserId: 'clerk-user-phase31',
  firebaseIdentity: firebaseUser,
});
assert.equal(mismatchVerification.verified, false);
assert.equal(mismatchVerification.reason, 'directoryMismatch');
assert.equal(mismatchVerification.profile.status, 'profileRequired');
assert.equal(lastMutation.nextProfile.profileRequiredReason, 'directoryMismatch');

const admin = await service.editAdmin({ firebaseIdentity: firebaseAdmin, targetUid: member.firebaseUid, input: { name: '홍길동', team: '채용대행팀', phone: '010-5555-6666', email: member.email } });
assert.equal(admin.firestoreMirror, 'retired');
assert.equal(admin.identitySource, 'postgresql');

const conflictService = createMemberAuthorityService({
  repository: { ...repository, async findActiveIdentityOwner() { return { firebaseUid: 'other-member', status: 'active' }; } },
  firebaseLinkRepository, userRepository, firestoreClient, rentalRestrictionRepository, siteContentRepository,
  writeMirrorEnabled: false, profileWriteMirrorEnabled: false,
});
await assert.rejects(
  () => conflictService.editSelf({ clerkUserId: 'clerk-user-phase31', firebaseIdentity: firebaseUser, input: { name: '홍길동', team: '채용대행팀', phone: '010-9876-5432' } }),
  (error) => error?.code === 'member_identity_conflict' && error?.status === 409,
);

const bootstrapService = createMemberAuthorityService({
  repository: { ...repository, async getDirectoryBootstrapState() { return null; } },
  firebaseLinkRepository, userRepository,
  firestoreClient: { ...firestoreClient, async listDirectoryMembers({ firebaseIdToken }) { assert.equal(firebaseIdToken, firebaseUser.idToken); firestoreDirectoryListReads += 1; return [{ name: 'projects/test/databases/(default)/documents/memberDirectoryKeys/key1', updateTime: '2026-08-11T00:00:00.000Z', fields: { identityKey: 'key1', directoryMemberId: 'dir-1', name: '홍길동', team: '채용대행팀', enabled: true, sortOrder: 0 } }]; } },
  rentalRestrictionRepository, siteContentRepository,
  writeMirrorEnabled: false, profileWriteMirrorEnabled: false,
});
const bootstrapEdit = await bootstrapService.editSelf({ clerkUserId: 'clerk-user-phase31', firebaseIdentity: firebaseUser, input: { name: '홍길동', team: '채용대행팀', phone: '010-9876-5432' } });
assert.equal(bootstrapEdit.firestoreMirror, 'retired');
assert.equal(firestoreDirectoryListReads, 1, 'missing directory bootstrap must perform one compatibility bootstrap read');
assert.equal(directoryReplace?.options?.version, 7);

const synced = await service.syncMemberDirectoryAdmin({ firebaseIdentity: firebaseAdmin });
assert.equal(synced.target, 'postgresql-member-directory');
assert.equal(synced.source, 'firestore-admin-sync');

const [migration, repoSource, serviceSource, appSource, envSource, indexSource, firestoreSource] = await Promise.all([
  readFile(new URL('../../server/migrations/023_phase31_member_profile_identity_recovery_authority.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/config/env.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/index.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/firestore/firestore-members.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ['CREATE TABLE IF NOT EXISTS app_member_directory_entries', "'phase', 31", "'member_profile_source', 'postgresql-authoritative'", "'member_profile_firestore_write_mirror', 'retired-staging-opt-in'"]) assert.ok(migration.includes(marker), marker);
for (const marker of ['findActiveIdentityOwner', 'findDirectoryEntryByIdentityKey', 'replaceDirectoryEntries', 'phase31_member_directory_bootstrap', "mirrorState === 'retired' ? 'retired' : 'synced'"]) assert.ok(repoSource.includes(marker), marker);
for (const marker of ['profileWriteMirrorEnabled', 'getPostgresqlMemberPolicySettings', 'ensureDirectoryBootstrap', "identitySource: profileWriteMirrorEnabled ? 'firestore-compatibility' : 'postgresql'", 'syncMemberDirectoryAdmin']) assert.ok(serviceSource.includes(marker), marker);
for (const marker of ["'/api/admin/member-directory/sync'", 'memberProfileWriteMirrorDisabled', "['member-profile', 'member-identity', 'account-recovery-key']"]) assert.ok(appSource.includes(marker), marker);
assert.ok(envSource.includes('FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED'));
assert.ok(indexSource.includes('profileWriteMirrorEnabled: !config.memberProfileWriteMirrorDisabled'));
assert.ok(indexSource.includes('siteContentRepository'));
assert.ok(firestoreSource.includes('listDirectoryMembers'));
console.log('[member-profile-identity-authority-backend-smoke] PASS (PostgreSQL profile/identity/recovery authority, directory bootstrap/sync, Firestore profile mirror retired)');
