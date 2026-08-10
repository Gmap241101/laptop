import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAccountAuthCutoverConfig } from '../../src/features/auth/accountAuthCutover.js';
import { createClerkStagingClient } from '../../src/clerk/clerkStagingClient.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
};

const enabledEnv = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED: 'true',
  VITE_ADMIN_CLERK_AUTH_ENABLED: 'true',
};
const storage = createStorage();
let config = readAccountAuthCutoverConfig({ env: enabledEnv, location: { search: '?accountRecovery=postgres&adminAuth=clerk' }, storage });
assert.equal(config.accountRecoveryRequested, true);
assert.equal(config.adminClerkAuthRequested, true);
config = readAccountAuthCutoverConfig({ env: enabledEnv, location: { search: '' }, storage });
assert.equal(config.accountRecoveryRequested, true, 'account recovery opt-in should persist for the staging session');
assert.equal(config.adminClerkAuthRequested, true, 'admin Clerk opt-in should persist for the staging session');
config = readAccountAuthCutoverConfig({ env: enabledEnv, location: { search: '?accountRecovery=firestore&adminAuth=firebase' }, storage });
assert.equal(config.accountRecoveryRequested, false, 'account recovery rollback query should clear session opt-in');
assert.equal(config.adminClerkAuthRequested, false, 'admin auth rollback query should clear session opt-in');
const disabled = readAccountAuthCutoverConfig({ env: { ...enabledEnv, VITE_CLERK_STAGING_ENABLED: 'false' }, location: { search: '?accountRecovery=postgres&adminAuth=clerk' }, storage: createStorage() });
assert.equal(disabled.accountRecoveryRequested, false);
assert.equal(disabled.adminClerkAuthRequested, false);

const accountRecoverySource = readFileSync('src/features/members/accountRecoveryService.js', 'utf8');
for (const marker of [
  'clerkStagingClient.findAccountRecoveryEmail',
  'clerkStagingClient.verifyPasswordResetIdentity',
  'readAccountAuthCutoverConfig',
  'ACCOUNT_RECOVERY_KEYS_COLLECTION_REF',
  "source: cutover.accountRecoveryRequested ? 'firestore-fallback' : 'firestore'", 
]) assert.ok(accountRecoverySource.includes(marker), `missing Phase 22 recovery frontend marker: ${marker}`);

const adminAuthSource = readFileSync('src/features/auth/useAdminAuthenticationController.js', 'utf8');
for (const marker of [
  'adminClerkSessionVerified',
  'clerkStagingClient.signInWithPassword',
  'clerkStagingClient.migrateAdminToClerk',
  'clerkStagingClient.getAdminClerkSession',
  'clerkStagingClient.verifyAdminClientTrust',
  'clientTrustRequired',
  "adminAuthSource: 'client-trust-required'",
  'adminClerkAuthRequested',
]) assert.ok(adminAuthSource.includes(marker), `missing Phase 22 admin login marker: ${marker}`);

const adminSessionInvalidationStart = adminAuthSource.indexOf('if (!authenticatedAdminId) return;');
const adminSessionInvalidationEnd = adminAuthSource.indexOf('const hasFirebaseAuthMismatch', adminSessionInvalidationStart);
const adminSessionInvalidationBlock = adminAuthSource.slice(adminSessionInvalidationStart, adminSessionInvalidationEnd);
assert.ok(
  adminSessionInvalidationBlock.includes('if (!currentAuthRoleReady) return;'),
  'admin app session invalidation must wait for the current Firebase administrator role lookup to finish'
);
assert.ok(
  adminAuthSource.includes('currentAuthAdminAccount,\n  ]);'),
  'admin app session invalidation effect must react to the resolved current administrator account'
);

const adminManagementSource = readFileSync('src/features/auth/useAdminAccountManagementController.js', 'utf8');
for (const marker of [
  'clerkStagingClient.provisionAdminClerkIdentity',
  'adminClerkAuthRequested ? 8 : 6',
  'syncAdminIdentityRegistry',
  "adminProvisionOperation: 'admin-create'",
  "adminProvisionOperation: 'admin-password-change'",
]) assert.ok(adminManagementSource.includes(marker), `missing Phase 22 admin management marker: ${marker}`);
assert.equal(adminManagementSource.includes('openSignUp'), false, 'admin management must not expose public Clerk self-signup');

const clerkClientSource = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
for (const marker of [
  "strategy: 'password'",
  'createdSessionId',
  'clerk.setActive',
  "signIn?.status === 'needs_client_trust'",
  'sendAdminClientTrustChallenge',
  'verifyAdminClientTrust',
  'requestAdminClerkMigration',
  'requestAdminClerkProvision',
]) assert.ok(clerkClientSource.includes(marker), `missing Phase 22 Clerk frontend client marker: ${marker}`);

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
assert.ok(diagnostics.includes("top: '184px'"), 'diagnostic panel must start below the toast area');
assert.ok(diagnostics.includes("maxHeight: 'calc(100vh - 200px)'"), 'diagnostic panel height must respect the lowered top offset');
assert.ok(diagnostics.includes('subscribeAccountAuthObservation'), 'diagnostics must subscribe to Phase 22 authority observations');
assert.ok(diagnostics.includes('Admin Client Trust:'), 'diagnostics must expose Client Trust progress');

const adminWorkspace = readFileSync('src/admin/AdminWorkspace.jsx', 'utf8');
for (const marker of [
  'Clerk 새 기기 확인 인증코드',
  'clientTrustRequired',
  'clientTrustDestination',
  'one-time-code',
]) assert.ok(adminWorkspace.includes(marker), `missing Phase 22 Client Trust UI marker: ${marker}`);

const authSessionSource = readFileSync('src/features/auth/authSessionService.js', 'utf8');
for (const marker of [
  'clientTrustCode',
  'clientTrustRequired',
  'clientTrustStrategy',
  'clientTrustDestination',
]) assert.ok(authSessionSource.includes(marker), `missing Phase 22 Client Trust form marker: ${marker}`);

const createTestClient = ({ legacy = false } = {}) => {
  const encodedDomain = Buffer.from('phase22-test.clerk.accounts.dev$').toString('base64');
  let sent = 0;
  let verified = 0;
  const signIn = {
    status: 'needs_client_trust',
    createdSessionId: null,
    supportedSecondFactors: [
      { strategy: 'email_code', emailAddressId: 'idn_test', safeIdentifier: 'm***@example.com' },
    ],
  };
  if (legacy) {
    signIn.prepareSecondFactor = async ({ strategy, emailAddressId }) => {
      assert.equal(strategy, 'email_code');
      assert.equal(emailAddressId, 'idn_test');
      sent += 1;
      return signIn;
    };
    signIn.attemptSecondFactor = async ({ strategy, code }) => {
      assert.equal(strategy, 'email_code');
      assert.equal(code, '123456');
      verified += 1;
      signIn.status = 'complete';
      signIn.createdSessionId = 'sess_legacy';
      return signIn;
    };
  } else {
    signIn.mfa = {
      sendEmailCode: async () => { sent += 1; },
      verifyEmailCode: async ({ code }) => {
        assert.equal(code, '123456');
        verified += 1;
        signIn.status = 'complete';
        signIn.createdSessionId = 'sess_modern';
      },
    };
  }
  const clerk = {
    loaded: true,
    session: null,
    user: { id: 'user_admin', primaryEmailAddress: { emailAddress: 'admin@example.com' } },
    load: async () => {},
    signOut: async () => { clerk.session = null; },
    setActive: async ({ session }) => { clerk.session = { id: session, getToken: async () => 'token' }; },
    client: {
      signIn: { create: async () => signIn },
      resetSignIn: () => {},
    },
  };
  const client = createClerkStagingClient({
    env: {
      MODE: 'production',
      VITE_CLERK_STAGING_ENABLED: 'true',
      VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${encodedDomain}`,
      VITE_API_URL: 'https://api.example.com',
    },
    windowRef: {
      Clerk: clerk,
      location: { search: '?clerkTest=1' },
      atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    },
    documentRef: {},
    fetchImpl: async () => { throw new Error('unexpected fetch'); },
  });
  return { client, getSent: () => sent, getVerified: () => verified, clerk };
};

for (const legacy of [false, true]) {
  const test = createTestClient({ legacy });
  const challenge = await test.client.signInWithPassword('admin@example.com', 'password123');
  assert.equal(challenge.status, 'needs_client_trust');
  assert.equal(challenge.clientTrustStrategy, 'email_code');
  assert.equal(test.getSent(), 1, 'Client Trust code should be prepared once');
  const completed = await test.client.verifyAdminClientTrust('123456');
  assert.equal(completed.status, 'complete');
  assert.equal(test.getVerified(), 1);
  assert.ok(test.clerk.session?.id, 'Client Trust verification should activate the Clerk session');
}

const myPage = readFileSync('src/features/members/useUserMyPageAccountController.js', 'utf8');
assert.ok(myPage.includes("operation: 'user-profile-edit'"), 'self-profile member authority diagnostic operation must be explicit');

console.log('[frontend-account-auth-smoke] PASS (staging opt-in/rollback + PostgreSQL recovery fallback + Clerk admin authority + Client Trust email-code verification + diagnostics contracts)');
