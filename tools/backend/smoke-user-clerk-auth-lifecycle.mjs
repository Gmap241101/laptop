import assert from 'node:assert/strict';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';

const now = Math.floor(Date.now() / 1000);
const firestoreAccounts = new Map([
  ['firebase-user', { uid: 'firebase-user', fields: { email: 'user@example.com', maskedEmail: 'u***@example.com', name: 'User One', team: 'QA', phone: '010-1111-2222', status: 'active', identityKey: 'id-user', recoveryKey: 'recovery-user', previousAccountUids: [] } }],
  ['firebase-new', { uid: 'firebase-new', fields: { email: 'new@example.com', maskedEmail: 'n***@example.com', name: 'New User', team: 'QA', phone: '010-3333-4444', status: 'pending', identityKey: 'id-new', recoveryKey: 'recovery-new', previousAccountUids: [] } }],
]);
const accounts = new Map();
const clerkUsersById = new Map();
const clerkUsersByEmail = new Map();
const createCalls = [];
const updateCalls = [];
const verifyCalls = [];
let deleteShouldFail = false;
let postgresqlWithdrawalCalls = 0;
let phase32FirestoreUserReads = 0;

const mapAccount = (uid) => accounts.get(uid) || null;
const repository = {
  async findByClerkUserId(id) { return [...accounts.values()].find((item) => item.clerkUserId === id) || null; },
  async findByFirebaseUid(uid) { return mapAccount(uid); },
  async syncMemberFromCompatibility({ appUserId, firebaseUid, profile }) {
    const current = mapAccount(firebaseUid) || {};
    const next = {
      ...current,
      appUserId: String(appUserId), firebaseUid, primaryEmail: profile.email, firebaseEmail: profile.email,
      memberStatus: profile.status, authAuthorityMode: current.authAuthorityMode || 'firebase-compatibility',
      lifecycleAuthorityMode: current.lifecycleAuthorityMode || 'firestore-compatibility', clerkAccountState: current.clerkAccountState || 'active',
    };
    accounts.set(firebaseUid, next); return next;
  },
  async linkAuthority({ appUserId, firebaseUid }) {
    const current = mapAccount(firebaseUid); if (!current) return false;
    accounts.set(firebaseUid, { ...current, appUserId: String(appUserId), clerkUserId: [...clerkUsersById.values()].find((u) => u.privateMetadata?.rentalSystemFirebaseUid === firebaseUid)?.clerkUserId || current.clerkUserId || '', authAuthorityMode: 'clerk-authoritative', lifecycleAuthorityMode: 'clerk-auth-firestore-profile-compatibility', clerkAccountState: 'active' });
    return true;
  },
  async markVerifiedLogin({ firebaseUid }) { const current = mapAccount(firebaseUid); const next = { ...current, authAuthorityMode: 'clerk-authoritative', clerkLastVerifiedAt: 'now' }; accounts.set(firebaseUid, next); return next; },
  async markPasswordAuthority({ firebaseUid }) { const current = mapAccount(firebaseUid); const next = { ...current, passwordAuthorityUpdatedAt: 'now' }; accounts.set(firebaseUid, next); return next; },
  async finalizePostgresqlWithdrawal({ firebaseUid }) { postgresqlWithdrawalCalls += 1; const current = mapAccount(firebaseUid); const next = { ...current, memberStatus: 'retired', lifecycleAuthorityMode: 'postgresql-authoritative' }; accounts.set(firebaseUid, next); return next; },
  async syncRetiredMember({ firebaseUid }) { const current = mapAccount(firebaseUid); const next = { ...current, memberStatus: 'retired', lifecycleAuthorityMode: 'postgresql-authoritative' }; accounts.set(firebaseUid, next); return next; },
  async markClerkRetired({ firebaseUid, deleted }) { const current = mapAccount(firebaseUid); const next = { ...current, authAuthorityMode: 'clerk-retired', lifecycleAuthorityMode: 'postgresql-authoritative', clerkAccountState: deleted ? 'deleted' : 'delete-pending', memberStatus: 'retired' }; accounts.set(firebaseUid, next); return next; },
};

const normalizeUser = (user) => ({ ...user, primaryEmailVerified: true });
const clerkClient = {
  async getUser(id) { const user = clerkUsersById.get(id); if (!user) { const error = new Error('missing'); error.code = 'clerk_user_not_found'; throw error; } return normalizeUser(user); },
  async findUserByEmail(email) { return clerkUsersByEmail.get(email) || null; },
  async createUser(input) {
    createCalls.push(input);
    const user = { clerkUserId: `clerk-${input.email.split('@')[0]}`, primaryEmail: input.email, privateMetadata: input.privateMetadata, publicMetadata: input.publicMetadata };
    clerkUsersById.set(user.clerkUserId, user); clerkUsersByEmail.set(input.email, user); return normalizeUser(user);
  },
  async updateUser(id, input) { updateCalls.push({ id, input }); return normalizeUser(clerkUsersById.get(id)); },
  async updateUserMetadata(id, input) { const next = { ...clerkUsersById.get(id), ...input }; clerkUsersById.set(id, next); clerkUsersByEmail.set(next.primaryEmail, next); return normalizeUser(next); },
  async verifyPassword(id, password) { verifyCalls.push({ id, password }); if (password === 'wrongpass8') { const error = new Error('wrong'); error.code = 'clerk_password_verification_failed'; error.status = 401; throw error; } return { verified: true }; },
  async deleteUser(id) { if (deleteShouldFail) { const error = new Error('temporary'); error.code = 'clerk_delete_temporarily_failed'; throw error; } clerkUsersById.delete(id); return null; },
};
let appUserId = 100;
const userRepository = { async upsertFromClerk(user) { return { id: String(appUserId++), clerkUserId: user.clerkUserId }; } };
const firebaseLinkRepository = { async link() { return true; } };
const firestoreClient = {
  async getAdminAccount() { return null; },
  async getUserAccount({ firebaseUid }) { return firestoreAccounts.get(firebaseUid) || null; },
};

const service = createUserClerkAuthService({ repository, clerkClient, userRepository, firebaseLinkRepository, firestoreClient });

await assert.rejects(
  () => service.migrateCurrent({ firebaseIdentity: { uid: 'firebase-user', email: 'user@example.com', idToken: 'token', authTime: now - 301 }, password: 'legacy888' }),
  (error) => error?.code === 'user_recent_authentication_required',
);

const migrated = await service.migrateCurrent({ firebaseIdentity: { uid: 'firebase-user', email: 'user@example.com', idToken: 'token', authTime: now }, password: 'legacy888' });
assert.equal(migrated.authority, 'clerk');
assert.equal(migrated.migration, 'firebase-user-to-clerk');
assert.equal(createCalls[0].skipPasswordChecks, true, 'existing Firebase user migration must use Clerk migration password mode');
assert.equal(migrated.account.authAuthorityMode, 'clerk-authoritative');

const current = await service.getCurrent({ clerkUserId: migrated.clerkUser.clerkUserId });
assert.equal(current.authority, 'clerk');
assert.equal(current.account.firebaseUid, 'firebase-user');

const verified = await service.verifyPassword({ clerkUserId: migrated.clerkUser.clerkUserId, password: 'legacy888' });
assert.equal(verified.verified, true);
assert.equal(verifyCalls.at(-1).password, 'legacy888');

const changed = await service.changePassword({ clerkUserId: migrated.clerkUser.clerkUserId, firebaseIdentity: { uid: 'firebase-user' }, currentPassword: 'legacy888', newPassword: 'newpass88' });
assert.equal(changed.changed, true);
assert.equal(updateCalls.at(-1).input.password, 'newpass88');

const provisioned = await service.provisionCurrent({ firebaseIdentity: { uid: 'firebase-new', email: 'new@example.com', idToken: 'token2', authTime: now }, password: 'newpass99' });
assert.equal(provisioned.provisioned, true);
assert.equal(createCalls.at(-1).skipPasswordChecks, false, 'new signup Clerk provisioning must enforce Clerk password checks');
assert.equal(provisioned.account.memberStatus, 'pending');

const phase32Service = createUserClerkAuthService({
  repository, clerkClient, userRepository, firebaseLinkRepository,
  firestoreClient: {
    async getAdminAccount() { return null; },
    async getUserAccount() { phase32FirestoreUserReads += 1; throw new Error('Phase 32 withdrawal must not read Firestore userAccounts'); },
  },
  memberRepository: {
    async findByFirebaseUid(uid) {
      return { firebaseUid: uid, email: 'new@example.com', name: '신규회원', team: '채용대행팀', phone: '010-1234-5678', status: 'active' };
    },
  },
  adminIdentityRepository: {
    async findByFirebaseUid() { return null; },
    async findByClerkUserId() { return null; },
  },
  accountLifecycleCompatibilityDisabled: true,
});
const phase32Withdrawn = await phase32Service.finalizeWithdrawal({
  clerkUserId: provisioned.clerkUser.clerkUserId,
  firebaseIdentity: { uid: 'firebase-new', idToken: 'token2' },
  password: 'newpass99',
});
assert.equal(phase32Withdrawn.authority, 'postgresql');
assert.equal(phase32Withdrawn.withdrawn, true);
assert.equal(postgresqlWithdrawalCalls, 1);
assert.equal(phase32FirestoreUserReads, 0, 'Phase 32 withdrawal authority must not require Firestore userAccounts');
assert.equal(phase32Withdrawn.account.memberStatus, 'retired');

firestoreAccounts.set('firebase-user', { ...firestoreAccounts.get('firebase-user'), fields: { ...firestoreAccounts.get('firebase-user').fields, status: 'retired', email: '', name: '탈퇴회원', team: '', phone: '', identityKey: '', recoveryKey: '' } });
deleteShouldFail = true;
const withdrawn = await service.finalizeWithdrawal({ clerkUserId: migrated.clerkUser.clerkUserId, firebaseIdentity: { uid: 'firebase-user', idToken: 'token' }, password: 'newpass88' });
assert.equal(withdrawn.authority, 'postgresql');
assert.equal(withdrawn.withdrawn, true);
assert.equal(withdrawn.clerkDeleted, false, 'Clerk cleanup failure must not roll back PostgreSQL withdrawal authority');
assert.equal(withdrawn.account.memberStatus, 'retired');
assert.equal(withdrawn.account.clerkAccountState, 'delete-pending');
assert.equal(withdrawn.clerkCleanupError, 'clerk_delete_temporarily_failed');

await assert.rejects(
  () => service.getCurrent({ clerkUserId: migrated.clerkUser.clerkUserId }),
  (error) => error?.code === 'user_account_retired',
);

console.log('[user-clerk-lifecycle-smoke] PASS (recent Firebase migration proof, signup provisioning, Clerk session authority, password verification/change, PostgreSQL withdrawal authority with deferred Clerk cleanup)');
