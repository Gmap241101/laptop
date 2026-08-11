import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getAccountRecoverySource } from '../../src/utils/memberPolicy.js';
import { createAccountRecoveryService } from '../../server/src/accounts/account-recovery-service.mjs';
import { createAdminClerkAuthService } from '../../server/src/auth/admin-clerk-auth-service.mjs';
import { createClerkBackendClient } from '../../server/src/clerk/clerk-api.mjs';

let capturedRecoveryKey = '';
const accountRecovery = createAccountRecoveryService({
  repository: {
    async findActiveByRecoveryKey(key) {
      capturedRecoveryKey = key;
      return { email: 'member@example.com', maskedEmail: 'me***@example.com' };
    },
  },
});

assert.deepEqual(
  await accountRecovery.findEmail({ name: '홍길동', team: '채용대행팀', phone: '010-1234-5678' }),
  { source: 'postgresql', found: true, maskedEmail: 'me***@example.com' },
);
const unicodeRecoveryInput = { name: 'Ａlice', team: 'ＱＡ　Team', phone: '010-1234-5678' };
await accountRecovery.findEmail(unicodeRecoveryInput);
const expectedRecoveryKey = createHash('sha256').update(getAccountRecoverySource(unicodeRecoveryInput)).digest('hex');
assert.equal(capturedRecoveryKey, expectedRecoveryKey, 'PostgreSQL recovery key generation must match the frontend NFKC recovery-key contract');
assert.deepEqual(
  await accountRecovery.verifyPasswordReset({ name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', email: 'member@example.com' }),
  { source: 'postgresql', verified: true, firebaseUid: '', email: 'member@example.com' },
);
assert.deepEqual(
  await accountRecovery.verifyPasswordReset({ name: '홍길동', team: '채용대행팀', phone: '010-1234-5678', email: 'wrong@example.com' }),
  { source: 'postgresql', verified: false, firebaseUid: '', email: '' },
);
assert.deepEqual(
  await accountRecovery.findEmail({ name: 'x', team: '', phone: 'invalid' }),
  { source: 'postgresql', found: false, maskedEmail: '' },
);

const registries = new Map([
  ['firebase-owner', {
    firebaseUid: 'firebase-owner', adminLoginId: 'owner', authEmail: 'owner@example.com',
    userName: 'Owner', adminRole: 'owner', status: 'active', clerkUserId: 'clerk-owner', clerkLinkState: 'linked',
  }],
  ['firebase-admin', {
    firebaseUid: 'firebase-admin', adminLoginId: 'admin', authEmail: 'admin@example.com',
    userName: 'Admin', adminRole: 'admin', status: 'active', clerkUserId: '', clerkLinkState: 'unlinked',
  }],
  ['firebase-target', {
    firebaseUid: 'firebase-target', adminLoginId: 'target', authEmail: 'target@example.com',
    userName: 'Target', adminRole: 'admin', status: 'active', clerkUserId: '', clerkLinkState: 'unlinked',
  }],
  ['firebase-target-owner', {
    firebaseUid: 'firebase-target-owner', adminLoginId: 'target-owner', authEmail: 'target-owner@example.com',
    userName: 'Target Owner', adminRole: 'owner', status: 'active', clerkUserId: '', clerkLinkState: 'unlinked',
  }],
]);
const usersById = new Map([
  ['clerk-owner', { clerkUserId: 'clerk-owner', primaryEmail: 'owner@example.com' }],
]);
const usersByEmail = new Map([['owner@example.com', usersById.get('clerk-owner')]]);
const createCalls = [];
const updateCalls = [];
const metadataCalls = [];

const repository = {
  async findByFirebaseUid(uid) { return registries.get(uid) || null; },
  async findByClerkUserId(id) { return [...registries.values()].find((row) => row.clerkUserId === id) || null; },
  async linkClerkIdentity({ firebaseUid, clerkUserId }) {
    const current = registries.get(firebaseUid);
    if (!current || current.status !== 'active') return null;
    const linked = { ...current, clerkUserId, clerkLinkState: 'linked', authAuthorityMode: 'clerk-authoritative-firebase-compatibility' };
    registries.set(firebaseUid, linked);
    return linked;
  },
  async markVerifiedLogin({ firebaseUid, clerkUserId }) {
    const current = registries.get(firebaseUid);
    return current?.clerkUserId === clerkUserId ? { ...current, lastLoginAt: 'now' } : null;
  },
};
const clerkClient = {
  async getUser(id) {
    const user = usersById.get(id);
    if (!user) { const error = new Error('missing'); error.code = 'clerk_user_not_found'; throw error; }
    return user;
  },
  async findUserByEmail(email) { return usersByEmail.get(email) || null; },
  async createUser(input) {
    createCalls.push(input);
    const user = { clerkUserId: `clerk-${input.email.split('@')[0]}`, primaryEmail: input.email };
    usersById.set(user.clerkUserId, user); usersByEmail.set(input.email, user); return user;
  },
  async updateUser(id, input) { updateCalls.push({ id, input }); return usersById.get(id); },
  async updateUserMetadata(id, input) { metadataCalls.push({ id, input }); return usersById.get(id); },
};
const firestoreClient = {
  async verifyAdmin({ firebaseUid }) {
    const row = registries.get(firebaseUid);
    if (!row) throw new Error('firebase admin missing');
    return { uid: firebaseUid, fields: { authEmail: row.authEmail } };
  },
  async getAdminAccount({ firebaseUid }) {
    const row = registries.get(firebaseUid);
    return row ? { uid: firebaseUid, fields: { authEmail: row.authEmail } } : null;
  },
};
const adminService = createAdminClerkAuthService({ repository, clerkClient, firestoreClient });

const current = await adminService.getCurrent({ clerkUserId: 'clerk-owner' });
assert.equal(current.authority, 'clerk');
assert.equal(current.admin.firebaseUid, 'firebase-owner');

const migrated = await adminService.migrateCurrent({
  firebaseIdentity: { uid: 'firebase-admin', idToken: 'firebase-token', authTime: Math.floor(Date.now() / 1000) },
  password: 'abc123',
});
assert.equal(migrated.authority, 'clerk');
assert.equal(migrated.admin.clerkLinkState, 'linked');
assert.equal(createCalls.at(-1).skipPasswordChecks, true, 'existing Firebase admin migration must allow Clerk migration password mode');
await assert.rejects(
  () => adminService.migrateCurrent({ firebaseIdentity: { uid: 'firebase-admin', idToken: 'firebase-token', authTime: Math.floor(Date.now() / 1000) - 301 }, password: 'abc123' }),
  (error) => error?.code === 'admin_recent_authentication_required',
);

const provisioned = await adminService.provisionTarget({
  actorClerkUserId: 'clerk-owner',
  firebaseIdentity: { uid: 'firebase-owner', idToken: 'firebase-token' },
  targetFirebaseUid: 'firebase-target',
  password: 'newpass88',
});
assert.equal(provisioned.provisioned, true);
assert.equal(provisioned.admin.clerkLinkState, 'linked');
assert.equal(createCalls.at(-1).skipPasswordChecks, false, 'new administrator provisioning must not bypass Clerk password checks');

await assert.rejects(
  () => adminService.provisionTarget({
    actorClerkUserId: migrated.admin.clerkUserId,
    firebaseIdentity: { uid: 'firebase-admin', idToken: 'firebase-token' },
    targetFirebaseUid: 'firebase-target-owner',
    password: 'newpass88',
  }),
  (error) => error?.code === 'admin_owner_required',
);
await assert.rejects(
  () => adminService.provisionTarget({
    actorClerkUserId: 'clerk-owner',
    firebaseIdentity: { uid: 'firebase-owner', idToken: 'firebase-token' },
    targetFirebaseUid: 'firebase-target-owner',
    password: 'short7',
  }),
  (error) => error?.code === 'admin_clerk_password_too_short',
);

const fetchCalls = [];
const backendClient = createClerkBackendClient({
  secretKey: 'sk_test_phase22',
  apiUrl: 'https://clerk.example/v1',
  fetchImpl: async (url, options = {}) => {
    fetchCalls.push({ url, options });
    const body = options.body ? JSON.parse(options.body) : {};
    const id = String(url).includes('/metadata') ? 'clerk-meta' : 'clerk-update';
    return new Response(JSON.stringify({
      id,
      primary_email_address_id: 'email_1',
      email_addresses: [{ id: 'email_1', email_address: 'admin@example.com', verification: { status: 'verified' } }],
      public_metadata: body.public_metadata || {},
      private_metadata: body.private_metadata || {},
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});
await backendClient.updateUser('clerk-update', { password: 'newpass88' });
await backendClient.updateUserMetadata('clerk-meta', { publicMetadata: { rentalSystemRole: 'admin' }, privateMetadata: { registry: 'postgresql' } });
assert.match(fetchCalls[0].url, /\/users\/clerk-update$/);
assert.equal(fetchCalls[0].options.method, 'PATCH');
assert.match(fetchCalls[1].url, /\/users\/clerk-meta\/metadata$/);
assert.equal(fetchCalls[1].options.method, 'PATCH');
assert.equal(JSON.parse(fetchCalls[1].options.body).public_metadata.rentalSystemRole, 'admin');

const appSource = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of [
  '/api/account-recovery/email',
  '/api/account-recovery/password-reset/verify',
  '/api/admin/auth/session',
  '/api/admin/auth/migrate',
  '/api/admin/identity-registry/:uid/provision',
  'accountRecoveryService.findEmail',
  'accountRecoveryService.verifyPasswordReset',
  'adminClerkAuthService.getCurrent',
  'adminClerkAuthService.migrateCurrent',
  'adminClerkAuthService.provisionTarget',
]) assert.ok(appSource.includes(marker), `missing Phase 22 app route marker: ${marker}`);

console.log('[server-account-auth-smoke] PASS (PostgreSQL recovery + Clerk admin authority/migration/provisioning + Clerk metadata endpoint policy)');
