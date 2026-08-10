import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readUserAccountLifecycleCutoverConfig } from '../../src/features/auth/userAccountLifecycleCutover.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
};

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_USER_CLERK_AUTH_ENABLED: 'true',
  VITE_USER_CLERK_LIFECYCLE_ENABLED: 'true',
};
const storage = createStorage();
const enabled = readUserAccountLifecycleCutoverConfig({ env, location: { search: '?userAuth=clerk&userLifecycle=clerk' }, storage });
assert.equal(enabled.userAuthRequested, true);
assert.equal(enabled.userLifecycleRequested, true);
const latched = readUserAccountLifecycleCutoverConfig({ env, location: { search: '' }, storage });
assert.equal(latched.userAuthRequested, true);
assert.equal(latched.userLifecycleRequested, true);
const rolledBack = readUserAccountLifecycleCutoverConfig({ env, location: { search: '?userAuth=firebase&userLifecycle=firebase' }, storage });
assert.equal(rolledBack.userAuthRequested, false);
assert.equal(rolledBack.userLifecycleRequested, false);

const clientSource = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
for (const marker of [
  '/api/users/auth/session', '/api/users/auth/migrate', '/api/users/auth/provision',
  '/api/users/me/password/verify', '/api/users/me/password/change', '/api/users/me/withdrawal/finalize',
  'signInUserWithPassword', 'verifyUserClientTrust', 'getUserClerkSession', 'provisionUserClerkIdentity',
]) assert.ok(clientSource.includes(marker), `missing Phase 23 Clerk client marker: ${marker}`);

const loginSource = readFileSync('src/features/auth/useUserLoginController.js', 'utf8');
for (const marker of [
  'readUserAccountLifecycleCutoverConfig', 'migrateUserToClerk', 'signInUserWithPassword',
  "userAuthSource: 'clerk'", "userClientTrustStatus: 'verified'", 'clientTrustRequired: true',
  'getUserClerkSession', 'user_clerk_session_identity_mismatch',
]) assert.ok(loginSource.includes(marker), `missing Phase 23 user login marker: ${marker}`);

const panelSource = readFileSync('src/user/UserAuthPanel.jsx', 'utf8');
for (const marker of ['Clerk 새 기기 확인 인증코드', '인증코드 확인', 'clientTrustRequired', 'one-time-code']) {
  assert.ok(panelSource.includes(marker), `missing Phase 23 user Client Trust UI marker: ${marker}`);
}

const signupSource = readFileSync('src/features/auth/useUserSignupController.js', 'utf8');
for (const marker of [
  'signupFirestoreCommitted = true', 'provisionUserClerkIdentity', "signupClerkProvision: 'provisioned'",
  '회원가입은 완료됐지만 Clerk 계정 연결을 완료하지 못했습니다', '!signupFirestoreCommitted',
]) assert.ok(signupSource.includes(marker), `missing Phase 23 signup lifecycle marker: ${marker}`);

const securitySource = readFileSync('src/features/members/useUserMyPageSecurity.js', 'utf8');
for (const marker of [
  'verifyUserPassword(currentPassword)', 'changeUserPassword(', 'verifiedPasswordRef',
  'Firebase password rollback error', "passwordAuthoritySource: 'clerk'", "passwordFirebaseCompatibility: 'synced'",
]) assert.ok(securitySource.includes(marker), `missing Phase 23 password authority marker: ${marker}`);

const withdrawalSource = readFileSync('src/features/members/useUserMyPageAccountController.js', 'utf8');
for (const marker of [
  'verifyUserPassword(withdrawalPassword)', 'finalizeUserWithdrawal(', 'withdrawalAuthorityFinalized',
  "withdrawalAuthority: 'postgresql'", "withdrawalFirebaseCleanup: firebaseCleanup", '!withdrawalAuthorityFinalized',
]) assert.ok(withdrawalSource.includes(marker), `missing Phase 23 withdrawal authority marker: ${marker}`);

const diagnosticsSource = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of [
  'Clerk Staging Test · Phase 23', "top: '184px'", 'Phase 23 user Clerk authentication + account lifecycle authority',
  'User Clerk authority requested:', 'Password authority source:', 'Withdrawal authority:',
]) assert.ok(diagnosticsSource.includes(marker), `missing Phase 23 diagnostics marker: ${marker}`);

console.log('[frontend-user-clerk-lifecycle-smoke] PASS (opt-in/rollback latches, user Clerk login + Client Trust, signup provision, password authority rollback, withdrawal authority, diagnostics)');
