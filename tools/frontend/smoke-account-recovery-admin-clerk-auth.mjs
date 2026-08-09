import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAccountAuthCutoverConfig } from '../../src/features/auth/accountAuthCutover.js';

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
  'adminClerkAuthRequested',
]) assert.ok(adminAuthSource.includes(marker), `missing Phase 22 admin login marker: ${marker}`);

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
  'requestAdminClerkMigration',
  'requestAdminClerkProvision',
]) assert.ok(clerkClientSource.includes(marker), `missing Phase 22 Clerk frontend client marker: ${marker}`);

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
assert.ok(diagnostics.includes("top: '184px'"), 'diagnostic panel must start below the toast area');
assert.ok(diagnostics.includes("maxHeight: 'calc(100vh - 200px)'"), 'diagnostic panel height must respect the lowered top offset');
assert.ok(diagnostics.includes('subscribeAccountAuthObservation'), 'diagnostics must subscribe to Phase 22 authority observations');

const myPage = readFileSync('src/features/members/useUserMyPageAccountController.js', 'utf8');
assert.ok(myPage.includes("operation: 'user-profile-edit'"), 'self-profile member authority diagnostic operation must be explicit');

console.log('[frontend-account-auth-smoke] PASS (staging opt-in/rollback + PostgreSQL recovery fallback + Clerk admin authority + diagnostics contracts)');
