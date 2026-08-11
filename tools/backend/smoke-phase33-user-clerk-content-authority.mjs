import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';

const links = [];
const accounts = new Map();
const repository = {
  async findByClerkUserId(clerkUserId) {
    return [...accounts.values()].find((item) => item.clerkUserId === clerkUserId) || null;
  },
  async findByFirebaseUid(uid) { return accounts.get(uid) || null; },
  async linkAuthority({ appUserId, firebaseUid }) {
    const previous = accounts.get(firebaseUid) || {};
    accounts.set(firebaseUid, { ...previous, appUserId, firebaseUid, memberStatus: previous.memberStatus || 'active' });
    return true;
  },
  async markVerifiedLogin({ firebaseUid }) { return accounts.get(firebaseUid); },
  async markPasswordAuthority({ firebaseUid }) { return accounts.get(firebaseUid); },
  async finalizePostgresqlWithdrawal() { return true; },
  async syncMemberFromCompatibility() { throw new Error('Phase 33 native path must not sync from Firestore'); },
};
const clerkUsers = new Map();
let sequence = 0;
const clerkClient = {
  async getUser(id) { return clerkUsers.get(id); },
  async findUserByEmail(email) { return [...clerkUsers.values()].find((item) => item.primaryEmail === email) || null; },
  async createUser({ email, firstName, privateMetadata, publicMetadata }) {
    const user = { clerkUserId: `clerk-33-${++sequence}`, primaryEmail: email, firstName, privateMetadata, publicMetadata };
    clerkUsers.set(user.clerkUserId, user);
    return user;
  },
  async updateUser(id, patch) { return { ...clerkUsers.get(id), ...patch }; },
  async updateUserMetadata(id, patch) {
    const next = { ...clerkUsers.get(id), ...patch };
    clerkUsers.set(id, next);
    return next;
  },
  async verifyPassword() { return true; },
  async deleteUser(id) { clerkUsers.delete(id); },
};
const userRepository = {
  async upsertFromClerk(user) { return { id: sequence + 100, clerkUserId: user.clerkUserId }; },
};
const firebaseLinkRepository = {
  async link(appUserId, identity) { links.push({ appUserId, identity }); return { appUserId, firebaseUid: identity.uid }; },
};
let firestoreReads = 0;
const firestoreClient = {
  async getUserAccount() { firestoreReads += 1; throw new Error('Phase 33 user flow must not read Firestore userAccounts'); },
  async getAdminAccount() { firestoreReads += 1; throw new Error('Phase 33 user flow must not read Firestore adminAccounts'); },
};
const memberRepository = {
  async findByFirebaseUid(uid) { return accounts.get(uid) || null; },
};
const adminIdentityRepository = {
  async findByFirebaseUid() { return null; },
  async findByClerkUserId() { return null; },
};
let nativeSignup = null;
let rollbackCalls = 0;
const accountLifecycleService = {
  async signup({ firebaseIdentity, input }) {
    nativeSignup = { firebaseIdentity, input };
    accounts.set(firebaseIdentity.uid, {
      firebaseUid: firebaseIdentity.uid,
      firebaseEmail: input.email,
      primaryEmail: input.email,
      email: input.email,
      memberStatus: 'active',
      name: input.name,
      team: input.team,
    });
    return { source: 'postgresql', status: 'active' };
  },
  async rollbackUnlinkedSignup() { rollbackCalls += 1; },
};

const service = createUserClerkAuthService({
  repository,
  clerkClient,
  userRepository,
  firebaseLinkRepository,
  firestoreClient,
  memberRepository,
  adminIdentityRepository,
  accountLifecycleService,
  accountLifecycleCompatibilityDisabled: true,
  userFirebaseAuthCompatibilityDisabled: true,
});

const signup = await service.signupNative({
  password: 'Password1234',
  input: { email: 'native33@example.com', name: 'Phase33 사용자', team: 'QA팀', phone: '010-1234-5678', terms: { policyRevision: 1, decisions: [] } },
});
assert.equal(signup.authority, 'clerk');
assert.equal(signup.source, 'postgresql');
assert.equal(signup.firebaseAuthCompatibility, 'retired');
assert.match(signup.legacyMemberKey, /^clerk-native:[0-9a-f]{64}$/);
assert.equal(nativeSignup.firebaseIdentity.uid, signup.legacyMemberKey);
assert.equal(nativeSignup.firebaseIdentity.idToken, 'clerk-native-signup');
assert.equal(firestoreReads, 0);
assert.equal(rollbackCalls, 0);
assert.equal(links.at(-1).identity.idToken, '');
assert.equal(links.at(-1).identity.signInProvider, 'clerk-native');

const legacyUid = 'legacy-firebase-key-33';
accounts.set(legacyUid, {
  firebaseUid: legacyUid,
  firebaseEmail: 'recovery33@example.com',
  primaryEmail: 'recovery33@example.com',
  email: 'recovery33@example.com',
  memberStatus: 'active',
  status: 'active',
  name: '기존회원',
  team: 'QA팀',
});
const recovered = await service.ensureRecoveryClerkIdentity({ firebaseUid: legacyUid, email: 'recovery33@example.com' });
assert.equal(recovered.authority, 'clerk');
assert.equal(recovered.ready, true);
assert.equal(firestoreReads, 0);
assert.equal(links.at(-1).identity.uid, legacyUid);
assert.equal(links.at(-1).identity.signInProvider, 'clerk-recovery');

const [appSource, envSource, memberSource, rentalWriteSource, rentalActionSource, restrictionSource] = await Promise.all([
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/config/env.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/rentals/rental-request-write-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/rentals/rental-request-user-action-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/restrictions/rental-restriction-service.mjs', import.meta.url), 'utf8'),
]);
for (const marker of [
  "runtimeRevision: 'phase33-user-clerk-content-authority-20260811-2210'",
  'userFirebaseAuthCompatibilityDisabled',
  "userAuthenticationSource: config.userFirebaseAuthCompatibilityDisabled ? 'clerk-postgresql'",
  "passwordResetDelivery: config.userFirebaseAuthCompatibilityDisabled ? 'clerk-email-code'",
  "'/api/users/signup/clerk'",
  'authenticateUserAuthority',
]) assert.ok(appSource.includes(marker), `missing backend Phase 33 marker: ${marker}`);
assert.ok(envSource.includes("FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED"));
assert.ok(memberSource.includes('userFirebaseAuthCompatibilityDisabled'));
assert.ok(rentalWriteSource.includes('writeMirrorEnabled') && rentalWriteSource.includes('firebaseIdentity?.idToken'));
assert.ok(rentalActionSource.includes('writeMirrorEnabled') && rentalActionSource.includes('firebaseIdentity?.idToken'));
assert.ok(restrictionSource.includes('firebaseCompatibilityRequired'));

console.log('[phase33-user-clerk-content-authority-backend-smoke] PASS (native Clerk signup/recovery, zero user Firestore reads, PostgreSQL user mutation auth, Phase 33 runtime contract)');
