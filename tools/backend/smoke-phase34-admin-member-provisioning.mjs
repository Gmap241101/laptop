import assert from 'node:assert/strict';

import { createAccountLifecycleService } from '../../server/src/accounts/account-lifecycle-service.mjs';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';
import { createMemberAuthorityService } from '../../server/src/members/member-authority-service.mjs';

const createdAccounts = [];
const accountLifecycleService = createAccountLifecycleService({
  authorityEnabled: true,
  userAuthRepository: {
    async findByClerkUserId() { return null; },
  },
  siteContentRepository: {
    async getDocument(domain, key) {
      if (domain === 'rental-config' && key === 'rentalSystem/publicConfig') {
        return { payload: { settings: { requireRegisteredMemberForSignup: true, memberDirectoryVersion: 7 } } };
      }
      if (domain === 'terms' && key === 'signupTermsPolicy/current') {
        return { payload: { enabled: true, revision: 19, requiredRevision: 19, activeTerms: [] } };
      }
      return null;
    },
  },
  repository: {
    async getConsentSnapshot() { return {}; },
    async importConsents() {},
    async saveConsents() {},
    async getDirectoryEntry() { return { directory_member_id: 'DIR-ADMIN-1', name: '홍길동', team: '채용대행팀', enabled: true }; },
    async findIdentityAccounts() { return []; },
    async findRetiredAccountsByEmail() { return []; },
    async createSignupAccount(input) {
      createdAccounts.push(input);
      return { firebase_uid: input.firebaseUid, status: input.status };
    },
    async rollbackUnlinkedSignup() { return true; },
  },
});

const provisioned = await accountLifecycleService.provisionAdminMember({
  firebaseUid: 'clerk-admin:test-member',
  input: {
    email: 'member@example.com',
    name: '홍길동',
    team: '채용대행팀',
    phone: '010-1234-5678',
  },
});
assert.equal(provisioned.status, 'active');
assert.equal(createdAccounts.length, 1);
assert.equal(createdAccounts[0].termsConsentRevision, 0);
assert.equal(createdAccounts[0].termsConsentPolicyVersion, -1);
assert.deepEqual(createdAccounts[0].decisions, []);
assert.equal(createdAccounts[0].status, 'active');
assert.equal(createdAccounts[0].directoryMemberId, 'DIR-ADMIN-1');
assert.equal(createdAccounts[0].directoryVerifiedVersion, 7);
assert.equal(createdAccounts[0].directoryOverrideByAdmin, false);

const overrideCreatedAccounts = [];
const overrideAccountLifecycleService = createAccountLifecycleService({
  authorityEnabled: true,
  userAuthRepository: { async findByClerkUserId() { return null; } },
  siteContentRepository: {
    async getDocument(domain, key) {
      if (domain === 'rental-config' && key === 'rentalSystem/publicConfig') return { payload: { settings: { requireRegisteredMemberForSignup: true, memberDirectoryVersion: 7 } } };
      if (domain === 'terms' && key === 'signupTermsPolicy/current') return { payload: { enabled: true, revision: 19, requiredRevision: 19, activeTerms: [] } };
      return null;
    },
  },
  repository: {
    async getConsentSnapshot() { return {}; },
    async importConsents() {},
    async saveConsents() {},
    async getDirectoryEntry() { return null; },
    async findIdentityAccounts() { return []; },
    async findRetiredAccountsByEmail() { return []; },
    async createSignupAccount(input) { overrideCreatedAccounts.push(input); return { firebase_uid: input.firebaseUid, status: input.status }; },
    async rollbackUnlinkedSignup() { return true; },
  },
});
const overrideProvisioned = await overrideAccountLifecycleService.provisionAdminMember({
  firebaseUid: 'clerk-admin:manual-member',
  input: {
    email: 'manual@example.com',
    name: '자유입력',
    team: '임시 프로젝트팀',
    phone: '010-2222-3333',
    directoryOverrideByAdmin: true,
  },
});
assert.equal(overrideProvisioned.status, 'active');
assert.equal(overrideCreatedAccounts[0].directoryOverrideByAdmin, true);
assert.equal(overrideCreatedAccounts[0].directoryMemberId, '');
assert.equal(overrideCreatedAccounts[0].directoryVerifiedVersion, 0);


const policyOffCreatedAccounts = [];
let policyOffDirectoryLookupCount = 0;
const policyOffAccountLifecycleService = createAccountLifecycleService({
  authorityEnabled: true,
  userAuthRepository: { async findByClerkUserId() { return null; } },
  siteContentRepository: {
    async getDocument(domain, key) {
      if (domain === 'rental-config' && key === 'rentalSystem/publicConfig') return { payload: { settings: { requireRegisteredMemberForSignup: false, memberDirectoryVersion: 7 } } };
      if (domain === 'terms' && key === 'signupTermsPolicy/current') return { payload: { enabled: true, revision: 19, requiredRevision: 19, activeTerms: [] } };
      return null;
    },
  },
  repository: {
    async getConsentSnapshot() { return {}; },
    async importConsents() {},
    async saveConsents() {},
    async getDirectoryEntry() { policyOffDirectoryLookupCount += 1; return null; },
    async findIdentityAccounts() { return []; },
    async findRetiredAccountsByEmail() { return []; },
    async createSignupAccount(input) { policyOffCreatedAccounts.push(input); return { firebase_uid: input.firebaseUid, status: input.status }; },
    async rollbackUnlinkedSignup() { return true; },
  },
});
const policyOffProvisioned = await policyOffAccountLifecycleService.provisionAdminMember({
  firebaseUid: 'clerk-admin:policy-off-member',
  input: {
    email: 'policy-off@example.com',
    name: '자유입력',
    team: '정책 비활성 자유팀',
    phone: '010-5555-6666',
    directoryOverrideByAdmin: true,
  },
});
assert.equal(policyOffProvisioned.status, 'active');
assert.equal(policyOffDirectoryLookupCount, 0, 'directory lookup must be skipped when the signup directory policy is disabled');
assert.equal(policyOffCreatedAccounts[0].directoryOverrideByAdmin, false, 'policy-off free input is not an admin override');
assert.equal(policyOffCreatedAccounts[0].directoryMemberId, '');
assert.equal(policyOffCreatedAccounts[0].directoryVerifiedVersion, 0);

await assert.rejects(
  () => overrideAccountLifecycleService.provisionAdminMember({
    firebaseUid: 'clerk-admin:managed-mismatch',
    input: { email: 'managed-mismatch@example.com', name: '자유입력', team: '임시 프로젝트팀', phone: '010-2222-4444' },
  }),
  (error) => error?.code === 'member_directory_mismatch' && error?.status === 409,
);

let clerkCreateInput = null;
let linkedUid = '';
let linkedProvider = '';
let provisionDirectoryOverride = null;
let clerkPasswordUpdate = null;
const clerkClient = {
  async getUser() { return { clerkUserId: 'user_created', primaryEmail: 'member@example.com', primaryEmailVerified: true, privateMetadata: {}, publicMetadata: {} }; },
  async findUserByEmail() { return null; },
  async createUser(input) {
    clerkCreateInput = input;
    return {
      clerkUserId: 'user_created',
      primaryEmail: input.email,
      primaryEmailVerified: true,
      privateMetadata: input.privateMetadata || {},
      publicMetadata: input.publicMetadata || {},
    };
  },
  async updateUser(clerkUserId, input) { clerkPasswordUpdate = { clerkUserId, input }; return { clerkUserId, ...input }; },
  async updateUserMetadata() { throw new Error('not used'); },
  async verifyPassword() { throw new Error('not used'); },
  async deleteUser() {},
};
const userClerkAuthService = createUserClerkAuthService({
  repository: {
    async findByClerkUserId() { return null; },
    async linkAuthority({ firebaseUid }) { linkedUid = firebaseUid; return true; },
    async findByFirebaseUid(firebaseUid) {
      if (firebaseUid === 'member-password') return { firebaseUid, memberStatus: 'active', clerkUserId: 'user_member_password', clerkAccountState: 'active' };
      if (firebaseUid === 'member-password-retired') return { firebaseUid, memberStatus: 'retired', clerkUserId: 'user_member_retired', clerkAccountState: 'deleted' };
      return { firebaseUid, memberStatus: 'active' };
    },
  },
  clerkClient,
  userRepository: {
    async upsertFromClerk() { return { id: 42 }; },
  },
  firebaseLinkRepository: {
    async link(_appUserId, identity) {
      linkedProvider = identity.signInProvider;
    },
  },
  memberRepository: {
    async findByFirebaseUid() { return null; },
  },
  adminIdentityRepository: {
    async findByFirebaseUid() { return null; },
    async findByClerkUserId(clerkUserId) {
      return clerkUserId === 'admin_actor' ? { status: 'active', clerkUserId } : null;
    },
  },
  accountLifecycleService: {
    async signup() { throw new Error('not used'); },
    async provisionAdminMember({ firebaseUid, input }) {
      assert.ok(firebaseUid.startsWith('clerk-admin:'));
      assert.equal(input.email, 'member@example.com');
      provisionDirectoryOverride = input.directoryOverrideByAdmin;
      return { status: 'active' };
    },
    async rollbackUnlinkedSignup() { return true; },
  },
  accountLifecycleCompatibilityDisabled: true,
  userFirebaseAuthCompatibilityDisabled: true,
});

const result = await userClerkAuthService.createAdminManagedMember({
  actorClerkUserId: 'admin_actor',
  input: {
    email: 'member@example.com',
    name: '홍길동',
    team: '채용대행팀',
    phone: '010-1234-5678',
    directoryOverrideByAdmin: true,
  },
  password: 'Rental1234',
});
assert.equal(result.authority, 'clerk-postgresql');
assert.equal(result.emailVerification, 'not-requested');
assert.ok(clerkCreateInput);
assert.equal(clerkCreateInput.email, 'member@example.com');
assert.equal(clerkCreateInput.privateMetadata.rentalSystemProvisionedBy, 'admin');
assert.equal(linkedProvider, 'clerk-admin-provisioned');
assert.equal(linkedUid, result.legacyMemberKey);
assert.equal(provisionDirectoryOverride, true);

const passwordResult = await userClerkAuthService.changeAdminManagedMemberPassword({
  actorClerkUserId: 'admin_actor',
  targetUid: 'member-password',
  newPassword: 'Changed1234',
});
assert.equal(passwordResult.authority, 'clerk');
assert.equal(passwordResult.operation, 'admin-member-password-change');
assert.equal(passwordResult.changed, true);
assert.deepEqual(clerkPasswordUpdate, { clerkUserId: 'user_member_password', input: { password: 'Changed1234' } });
await assert.rejects(
  () => userClerkAuthService.changeAdminManagedMemberPassword({ actorClerkUserId: 'admin_actor', targetUid: 'member-password-retired', newPassword: 'Changed1234' }),
  (error) => error?.code === 'admin_member_password_retired_forbidden' && error?.status === 409,
);

const retiredMemberAuthorityService = createMemberAuthorityService({
  repository: {
    async mutateProfile() { throw new Error('not used'); },
    async mutateStatus() { throw new Error('retired guard must reject before mutation'); },
    async countBlockingRentalRequestsForUids() { return 0; },
    async findActiveIdentityOwner() { return null; },
    async findDirectoryEntryByIdentityKey() { return null; },
    async getDirectoryBootstrapState() { return { completed: true, version: 0 }; },
    async replaceDirectoryEntries() { return { count: 0 }; },
    async findByFirebaseUid() { return { uid: 'retired:member', firebaseUid: 'retired:member', status: 'retired' }; },
  },
  firebaseLinkRepository: {
    async findByFirebaseUid() { return { firebaseUid: 'retired:member', appUserId: '42' }; },
    async findByAppUserId() { return null; },
  },
  userRepository: { async findByClerkUserId() { return null; } },
  rentalRestrictionRepository: { async findByFirebaseUid() { return null; } },
  siteContentRepository: { async getDomain() { return { documents: [] }; } },
});
await assert.rejects(
  () => retiredMemberAuthorityService.changeStatusAdmin({
    firebaseIdentity: { source: 'clerk-postgresql', uid: 'admin:smoke' },
    targetUid: 'retired:member',
    nextStatus: 'active',
  }),
  (error) => error?.code === 'retired_member_reactivation_not_supported' && error?.status === 409,
);



const historyReadUids = [];
const historyMemberAuthorityService = createMemberAuthorityService({
  repository: {
    async mutateProfile() { throw new Error('not used'); },
    async countBlockingRentalRequestsForUids() { return 0; },
    async findByFirebaseUid(uid) {
      if (uid === 'member:history') return { uid, firebaseUid: uid, status: 'active', previousAccountUids: ['member:old'] };
      return null;
    },
    async listRentalHistoryForUids(uids) {
      historyReadUids.push(...uids);
      return [
        { id: 'REQ-HISTORY-1', requesterUid: 'member:history', status: '대여중', dueDate: '2099-01-01', overdueDaysAtReturn: 0 },
        { id: 'REQ-HISTORY-2', requesterUid: 'member:old', status: '반납완료', dueDate: '2026-01-01', overdueDaysAtReturn: 2 },
      ];
    },
    async findActiveIdentityOwner() { return null; },
    async findDirectoryEntryByIdentityKey() { return null; },
    async getDirectoryBootstrapState() { return { completed: true, version: 0 }; },
    async replaceDirectoryEntries() { return { count: 0 }; },
  },
  firebaseLinkRepository: {
    async findByFirebaseUid() { return null; },
    async findByAppUserId() { return null; },
  },
  userRepository: {
    async findByClerkUserId() { return null; },
  },
  rentalRestrictionRepository: { async findByFirebaseUid() { return null; } },
  siteContentRepository: { async getDomain() { return { documents: [] }; } },
});
// verifyAdmin accepts the trusted admin identity contract without requiring a legacy Firebase runtime.
const historyPayload = await historyMemberAuthorityService.getAdminMemberRentalHistory({
  firebaseIdentity: { source: 'clerk-postgresql', uid: 'admin:smoke', role: 'owner' },
  targetUid: 'member:history',
});
assert.deepEqual(historyReadUids, ['member:history', 'member:old']);
assert.equal(historyPayload.source, 'postgresql');
assert.equal(historyPayload.summary.totalRequests, 2);
assert.equal(historyPayload.summary.previousRequests, 1);
assert.equal(historyPayload.summary.activeRequests, 1);
assert.equal(historyPayload.summary.overdueRequests, 1);
assert.equal(historyPayload.summary.returnedRequests, 1);

console.log('[phase34-admin-member-provisioning-backend-smoke] PASS');
