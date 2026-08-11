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
const identityPolicySource = readFileSync('src/features/auth/useAuthIdentityPolicySubscriptionController.js', 'utf8');
const authSessionServiceSource = readFileSync('src/features/auth/authSessionService.js', 'utf8');
for (const marker of [
  'readUserAccountLifecycleCutoverConfig', 'migrateUserToClerk', 'signInUserWithPassword',
  "userAuthSource: 'clerk'", "userClientTrustStatus: 'verified'", 'clientTrustRequired: true',
  'getUserClerkSession', 'user_clerk_session_identity_mismatch',
  'beginUserAuthTransition', 'bindUserAuthTransitionIdentity', 'completeUserAuthTransition',
]) assert.ok(loginSource.includes(marker), `missing Phase 23 user login marker: ${marker}`);

for (const marker of [
  "authoritativeMemberStatus = ''",
  "authoritativeMemberStatusSource = ''",
  "authoritativeMemberProfileSource = ''",
  "const postgresMemberStatus = String(authoritativeMemberStatus || '').trim();",
  'const postgresStatusAuthoritative = Boolean(',
  "String(authoritativeMemberStatusSource || '').trim() === 'postgresql'",
  "String(authoritativeMemberProfileSource || '').trim() === 'postgresql'",
  'if (!postgresStatusAuthoritative)',
  "authoritativeMemberStatus = authority?.memberStatus || '';",
  'verifiedPayload?.compatibility?.memberStatusSource',
  'verifiedPayload?.compatibility?.memberProfileSource',
]) assert.ok(loginSource.includes(marker), `PostgreSQL member status must bypass stale Firestore approval/directory status during Clerk-authoritative login: ${marker}`);

const membershipSource = readFileSync('src/features/members/useUserMembershipStatusController.js', 'utf8');
for (const marker of [
  'hasEstablishedUserSession',
  'readUserAccountLifecycleCutoverConfig',
  'clerkStagingClient.getUserClerkSession()',
  'sessionPayload?.compatibility?.memberStatusSource',
  'sessionPayload?.userAuthentication?.memberStatus',
  "postgresStatusSource === 'postgresql'",
  'await clerkStagingClient.signOut()',
]) assert.ok(membershipSource.includes(marker), `inactive-member watcher must confirm PostgreSQL status before post-login logout: ${marker}`);

const userSessionSource = readFileSync('src/features/auth/useUserAuthenticationSessionController.js', 'utf8');
for (const marker of [
  'readUserAccountLifecycleCutoverConfig',
  'lifecycleConfig.userAuthRequested',
  "window.location.pathname.replace(/\\/+$/, '') === '/login'",
  'const persistedSession = readUserAuthSession();',
  'persistedSession.userId === firebaseAuthUser.uid',
  'setUserAuthenticatedSession(',
  'const authTransition = readUserAuthTransition();',
  "authTransition.status === 'completed'",
  "authTransition.status === 'pending'",
]) {
  assert.ok(
    userSessionSource.includes(marker),
    `user session expiry must preserve the Firebase compatibility session only while the Phase 23 Clerk login is pending on /login: ${marker}`
  );
}


for (const marker of [
  "const USER_AUTH_TRANSITION_KEY = 'mk_laptop_user_auth_transition';",
  'beginUserAuthTransition',
  'bindUserAuthTransitionIdentity',
  'completeUserAuthTransition',
  'readUserAuthTransition',
  'clearUserAuthTransition',
]) assert.ok(authSessionServiceSource.includes(marker), `missing explicit user auth transition marker: ${marker}`);

for (const marker of [
  'const authTransition = readUserAuthTransition();',
  'if (!authTransition)',
  "clearUserAuthenticatedSession('firebase-auth-signed-out');",
]) assert.ok(identityPolicySource.includes(marker), `Firebase auth null-state handling must preserve the user session while the Phase 23 login transaction is active: ${marker}`);

for (const marker of [
  "reason = 'unspecified'",
  'clearUserAuthSession(reason);',
  'if (clearTransition)',
  'clearUserAuthTransition(reason);',
]) assert.ok(userSessionSource.includes(marker), `user session clearing must not destroy the Phase 23 login transition unless the caller explicitly requests it: ${marker}`);

for (const marker of [
  "const USER_AUTH_SESSION_TRACE_KEY = 'mk_laptop_user_auth_session_trace';",
  'readUserAuthSessionTrace',
  'subscribeUserAuthSessionTrace',
  "appendUserAuthSessionTrace('session-clear'",
]) assert.ok(authSessionServiceSource.includes(marker), `missing user session trace contract: ${marker}`);

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
  'Clerk Staging Test · Phase 32', "top: '184px'", 'Phase 23 user Clerk authentication + account lifecycle authority',
  'User Clerk authority requested:', 'Password authority source:', 'Withdrawal authority:',
  'User session last event:', 'User session trace:',
  'disabled={!state.firebaseSignedIn || !state.memberShadowFirebaseUid}',
  'disabled={state.firestoreWatcherDisabled || !state.appReadProfile}',
]) assert.ok(diagnosticsSource.includes(marker), `missing Phase 23 diagnostics marker: ${marker}`);
assert.ok(
  !diagnosticsSource.includes("throw new Error('The application Firestore member profile has not been observed yet.')"),
  'diagnostics must not surface a transient missing member-profile observation as an error'
);

const stagingClientSource = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
assert.ok(
  stagingClientSource.includes("response.status === 404 && payload?.error === 'member_shadow_not_found'"),
  'legacy member shadow comparison must treat member_shadow_not_found as not-applicable instead of a diagnostic error'
);

console.log('[frontend-user-clerk-lifecycle-smoke] PASS (opt-in/rollback latches, user Clerk login + Client Trust, signup provision, password authority rollback, withdrawal authority, diagnostics)');
