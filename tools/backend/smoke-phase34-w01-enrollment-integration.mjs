import assert from 'node:assert/strict';
import { createUserClerkAuthService } from '../../server/src/auth/user-clerk-auth-service.mjs';
import { createAdminClerkAuthService } from '../../server/src/auth/admin-clerk-auth-service.mjs';
import { createSystemConfigService } from '../../server/src/settings/system-config-service.mjs';

let locked = false;
let policy = { deviceTrustEmailVerificationEnabled: true, policyRevision: 4 };
const systemConfigService = createSystemConfigService({ repository: {
  async withDeviceTrustLock(work) {
    if (locked) throw Object.assign(new Error('busy'), { status: 409, code: 'clerk_device_trust_change_in_progress' });
    locked = true;
    try { return await work(); } finally { locked = false; }
  },
  async get(key) { return key === 'device-trust-policy' ? { payload: policy } : null; },
  async put() {}, async listAudit() { return []; }, async appendAudit() {},
  async appendDeviceTrustAudit() {}, async listDeviceTrustAudit() { return []; },
}});
const users = new Map();
let sequence = 0;
let rollbackCount = 0;
let linkedCount = 0;
const clerkClient = {
  async getUser(id) {
    const user = users.get(id);
    if (!user) throw Object.assign(new Error('missing'), { status: 404 });
    return { ...user };
  },
  async findUserByEmail(email) { return [...users.values()].find(u => u.primaryEmail === email) || null; },
  async createUser(input) {
    const clerkUserId = `new_clerk_${++sequence}`;
    const user = { clerkUserId, primaryEmail: input.email, primaryEmailVerified: true,
      publicMetadata: input.publicMetadata || {}, privateMetadata: input.privateMetadata || {},
      bypassClientTrust: input.bypassClientTrust };
    users.set(clerkUserId, user);
    return { ...user };
  },
  async updateUser(id, updates) {
    const user = users.get(id);
    if (!user) throw Object.assign(new Error('missing'), { status: 404 });
    const next = { ...user, bypassClientTrust: updates.bypass_client_trust ?? user.bypassClientTrust };
    users.set(id, next);
    return { ...next };
  },
  async updateUserMetadata(id, metadata) {
    const user = users.get(id);
    const next = { ...user, ...metadata };
    users.set(id, next);
    return { ...next };
  },
  async verifyPassword() { return { verified: true }; },
  async deleteUser(id) { users.delete(id); },
};
const userService = createUserClerkAuthService({
  repository: {
    async findByClerkUserId() { return null; },
    async findByFirebaseUid(key) { return { firebaseUid: key, memberStatus: 'pending' }; },
    async linkAuthority() { linkedCount++; return true; },
  }, clerkClient,
  userRepository: { async upsertFromClerk() { return { id: 14 }; } },
  firebaseLinkRepository: { async link() {} },
  memberRepository: { async findByFirebaseUid() { return null; } },
  adminIdentityRepository: { async findByFirebaseUid() { return null; }, async findByClerkUserId() { return null; } },
  accountLifecycleService: {
    async signup() { return { status: 'pending' }; },
    async provisionAdminMember() { return { status: 'pending' }; },
    async rollbackUnlinkedSignup() { rollbackCount++; },
  },
  accountLifecycleCompatibilityDisabled: true, userFirebaseAuthCompatibilityDisabled: true,
  systemConfigService,
});
const profile = { email: 'test@example.invalid', name: '홍길동', team: '시험팀', phone: '010-1234-5678' };
let release;
const hold = systemConfigService.withDeviceTrustLock(() => new Promise(resolve => { release = resolve; }));
await assert.rejects(() => userService.signupNative({ input: profile, password: 'Password1234' }),
  e => e.code === 'clerk_device_trust_change_in_progress');
assert.equal(users.size, 0, 'failed concurrent signup may not leave an active Clerk identity');
assert.equal(linkedCount, 0, 'failed concurrent signup may not link PG identity');
assert.equal(rollbackCount, 0, 'blocked enrollment must not create PG signup state before policy lock');
release(); await hold;
policy = { deviceTrustEmailVerificationEnabled: false, policyRevision: 5 };
const result = await userService.signupNative({ input: profile, password: 'Password1234' });
assert.equal(users.get(result.clerkUser.clerkUserId).bypassClientTrust, true);
assert.equal(linkedCount, 1);
assert.equal(result.status, 'pending');
// A pre-created Clerk SDK signup may carry a stale policy. Authority linking
// only succeeds after it is patched and independently GET-verified under lock.
users.set('sdk_user', { clerkUserId: 'sdk_user', primaryEmail: 'sdk@example.invalid', primaryEmailVerified: true,
  bypassClientTrust: false, privateMetadata: {}, publicMetadata: {} });
const verified = await userService.signupVerifiedCurrent({ clerkUserId: 'sdk_user', input: { ...profile, email: 'sdk@example.invalid' } });
assert.equal(verified.emailVerification, 'clerk-email-code');
assert.equal(users.get('sdk_user').bypassClientTrust, true);
const adminRepo = {
  async findByClerkUserId() { return { status: 'active', clerkLinkState: 'linked', adminRole: 'owner' }; },
  async findByAuthEmail() { return null; },
  async listActive() { return []; },
  async create(input) { return { ...input, status: 'active', clerkLinkState: 'linked' }; },
};
const adminService = createAdminClerkAuthService({ repository: adminRepo, clerkClient, systemConfigService });
const admin = await adminService.create({ actorClerkUserId: 'owner', input: {
  adminLoginId: 'admin_mock', email: 'admin@example.invalid', organizationName: '시험부서',
  userName: '관리자', password: 'Password1234', adminRole: 'admin',
} });
assert.equal(users.get(admin.account.clerkUserId).bypassClientTrust, true);
console.log('[phase34-w01-enrollment-integration] PASS: lock conflict before PG write, native signup, SDK precreated signup, admin creation, latest policy reconciliation');
