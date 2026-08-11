import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAccountLifecycleAuthorityConfig, readAccountLifecycleAuthorityFromPayload, requestAccountLifecycleAuthorityStatus } from '../../src/features/auth/accountLifecycleAuthority.js';
import { clearAdminRouteIntent, pushAppPath, replaceAppPath, writeAdminRouteIntent } from '../../src/routing/appRoutes.js';
import { readUserAccountLifecycleCutoverConfig } from '../../src/features/auth/userAccountLifecycleCutover.js';
import { readMemberAuthorityCutoverConfig } from '../../src/features/members/memberAuthorityCutover.js';
import { readMemberProfileCutoverConfig } from '../../src/features/members/memberProfileReadCutover.js';
import { readRentalRestrictionCutoverConfig } from '../../src/features/requests/rentalRestrictionReadCutover.js';
import { readRentalRequestCutoverConfig } from '../../src/features/requests/rentalRequestReadCutover.js';
import { readRentalRequestWriteCutoverConfig } from '../../src/features/requests/rentalRequestWriteCutover.js';
import { readRentalRequestUserActionCutoverConfig } from '../../src/features/requests/rentalRequestUserActionCutover.js';
import { readLegacyFirestoreReadFallbackConfig, isLegacyFirestoreReadFallbackAllowed } from '../../src/features/compatibility/legacyFirestoreReadFallbackCutover.js';

const storage = new Map();
const config = readAccountLifecycleAuthorityConfig({
  env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED: 'true', VITE_API_URL: 'https://api.example.test/' },
  location: { search: '?accountLifecycle=postgres' },
  storage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } },
});
assert.equal(config.enabled, true);
assert.equal(config.requested, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');

const defaultAuthorityStorageMap = new Map();
const defaultAuthorityStorage = {
  getItem(key) { return defaultAuthorityStorageMap.get(key) || null; },
  setItem(key, value) { defaultAuthorityStorageMap.set(key, String(value)); },
  removeItem(key) { defaultAuthorityStorageMap.delete(key); },
};
const defaultAuthorityEnv = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
assert.equal(readAccountLifecycleAuthorityConfig({ env: defaultAuthorityEnv, location: { search: '' }, storage: defaultAuthorityStorage }).requested, true, 'Phase 32 enabled flag must be default-on without a query latch');
assert.equal(readAccountLifecycleAuthorityConfig({ env: defaultAuthorityEnv, location: { search: '?accountLifecycle=firebase' }, storage: defaultAuthorityStorage }).requested, false, 'explicit rollback query must disable Phase 32 for the session');
assert.equal(readAccountLifecycleAuthorityConfig({ env: defaultAuthorityEnv, location: { search: '' }, storage: defaultAuthorityStorage }).requested, false, 'rollback mode must persist for the current browser session');
assert.equal(readAccountLifecycleAuthorityConfig({ env: defaultAuthorityEnv, location: { search: '?accountLifecycle=postgres' }, storage: defaultAuthorityStorage }).requested, true, 'explicit PostgreSQL query must restore Phase 32 authority');

const dependencyEnv = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED: 'true',
  VITE_USER_CLERK_AUTH_ENABLED: 'true',
  VITE_USER_CLERK_LIFECYCLE_ENABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED: 'true',
  VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED: 'true',
  VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED: 'true',
  VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED: 'true',
  VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED: 'true',
  VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED: 'true',
  VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED: 'true',
  VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED: 'true',
  VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
const dependencyStorageMap = new Map();
const dependencyStorage = {
  getItem(key) { return dependencyStorageMap.get(key) || null; },
  setItem(key, value) { dependencyStorageMap.set(key, String(value)); },
  removeItem(key) { dependencyStorageMap.delete(key); },
};
const lifecycleLocation = { search: '?accountLifecycle=postgres' };
assert.equal(readAccountLifecycleAuthorityConfig({ env: dependencyEnv, location: lifecycleLocation, storage: dependencyStorage }).requested, true);
const forcedUserLifecycle = readUserAccountLifecycleCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedUserLifecycle.userAuthRequested, true);
assert.equal(forcedUserLifecycle.userLifecycleRequested, true);
assert.equal(forcedUserLifecycle.forcedByAccountLifecycle, true);
const forcedMember = readMemberAuthorityCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedMember.memberRequested, true);
assert.equal(forcedMember.restrictionRequested, true);
const forcedProfileRead = readMemberProfileCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedProfileRead.requested, true);
assert.equal(forcedProfileRead.firestoreWatcherDisabled, true);
const forcedRestrictionRead = readRentalRestrictionCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedRestrictionRead.requested, true);
const forcedRentalRead = readRentalRequestCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedRentalRead.requested, true);
assert.equal(forcedRentalRead.firestoreWatcherDisabled, true);
assert.equal(readRentalRequestWriteCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage }).requested, true);
assert.equal(readRentalRequestUserActionCutoverConfig({ env: dependencyEnv, location: { search: '' }, storage: dependencyStorage }).requested, true);
const forcedFallback = readLegacyFirestoreReadFallbackConfig({ env: { ...dependencyEnv, VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED: 'true' }, location: { search: '' }, storage: dependencyStorage });
assert.equal(forcedFallback.requested, true);
assert.equal(forcedFallback.forcedByAccountLifecycle, true);
assert.equal(isLegacyFirestoreReadFallbackAllowed(forcedFallback), false);
const status = await requestAccountLifecycleAuthorityStatus({
  config,
  fetchImpl: async () => new Response(JSON.stringify({ compatibility: {
    accountLifecycleCompatibilityDisabled: true,
    signupProfileSource: 'postgresql',
    termsConsentSource: 'postgresql',
    passwordResetDelivery: 'firebase-auth-compatibility-preserved',
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
});
assert.equal(status.backendApplied, true);
assert.equal(status.signupSource, 'postgresql');
assert.equal(status.termsConsentSource, 'postgresql');
assert.equal(status.passwordResetDelivery, 'firebase-auth-compatibility-preserved');
assert.equal(status.error, null);

let transientCalls = 0;
const transientStatus = await requestAccountLifecycleAuthorityStatus({
  config,
  attempts: 3,
  sleepImpl: async () => {},
  fetchImpl: async () => {
    transientCalls += 1;
    if (transientCalls < 3) {
      return new Response(JSON.stringify({ compatibility: {
        accountLifecycleCompatibilityDisabled: false,
        signupProfileSource: 'firestore-compatibility-source',
        termsConsentSource: 'firestore',
        passwordResetDelivery: 'firebase-auth-compatibility-preserved',
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ compatibility: {
      accountLifecycleCompatibilityDisabled: true,
      signupProfileSource: 'postgresql',
      termsConsentSource: 'postgresql',
      passwordResetDelivery: 'firebase-auth-compatibility-preserved',
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
assert.equal(transientCalls, 3);
assert.equal(transientStatus.backendApplied, true);
assert.equal(transientStatus.signupSource, 'postgresql');
assert.equal(transientStatus.termsConsentSource, 'postgresql');
assert.equal(transientStatus.error, null);

let persistentCalls = 0;
const persistentMismatch = await requestAccountLifecycleAuthorityStatus({
  config,
  attempts: 3,
  sleepImpl: async () => {},
  fetchImpl: async () => {
    persistentCalls += 1;
    return new Response(JSON.stringify({ compatibility: {
      accountLifecycleCompatibilityDisabled: false,
      signupProfileSource: 'firestore-compatibility-source',
      termsConsentSource: 'firestore',
      passwordResetDelivery: 'firebase-auth-compatibility-preserved',
    } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
assert.equal(persistentCalls, 3);
assert.equal(persistentMismatch.backendApplied, false);
assert.equal(persistentMismatch.error, 'backend-account-lifecycle-authority-not-applied');

const payloadAuthority = readAccountLifecycleAuthorityFromPayload({ compatibility: {
  accountLifecycleCompatibilityDisabled: true,
  signupProfileSource: 'postgresql',
  termsConsentSource: 'postgresql',
  passwordResetDelivery: 'firebase-auth-compatibility-preserved',
} }, { requested: true });
assert.deepEqual(payloadAuthority, {
  requested: true,
  backendApplied: true,
  signupSource: 'postgresql',
  termsConsentSource: 'postgresql',
  passwordResetDelivery: 'firebase-auth-compatibility-preserved',
  userFirebaseAuthCompatibilityDisabled: false,
  userAuthenticationSource: '',
  userLegacyMemberKeySource: '',
});

const originalWindow = globalThis.window;
const routeStorage = new Map();
const routeWindow = {
  location: { pathname: '/admin' },
  sessionStorage: {
    getItem(key) { return routeStorage.get(key) || null; },
    setItem(key, value) { routeStorage.set(key, value); },
    removeItem(key) { routeStorage.delete(key); },
  },
  history: {
    pushState(_state, _title, path) { routeWindow.location.pathname = path; },
    replaceState(_state, _title, path) { routeWindow.location.pathname = path; },
  },
};
globalThis.window = routeWindow;
writeAdminRouteIntent();
pushAppPath('user', 'home');
assert.equal(routeWindow.location.pathname, '/admin', 'admin route intent must block user pushState writers');
replaceAppPath('user', 'mypage');
assert.equal(routeWindow.location.pathname, '/admin', 'admin route intent must block user replaceState writers');
clearAdminRouteIntent();
replaceAppPath('user', 'mypage');
assert.equal(routeWindow.location.pathname, '/mypage', 'explicitly cleared admin route intent must allow user navigation');
if (originalWindow === undefined) delete globalThis.window;
else globalThis.window = originalWindow;

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [signup, termsPanel, termsCompliance, userWorkspace, recovery, userAuthPanel, client, diagnostics, cutover, authIdentityPolicy, withdrawalController, rentalCreateController, rentalActionController, membershipStatusController] = await Promise.all([
  read('src/features/auth/useUserSignupController.js'),
  read('src/user/UserTermsConsentPanel.jsx'),
  read('src/features/terms/useUserTermsCompliance.js'),
  read('src/user/UserWorkspace.jsx'),
  read('src/features/auth/useUserAccountRecoveryController.js'),
  read('src/user/UserAuthPanel.jsx'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/features/auth/accountLifecycleAuthority.js'),
  read('src/features/auth/useAuthIdentityPolicySubscriptionController.js'),
  read('src/features/members/useUserMyPageAccountController.js'),
  read('src/features/requests/useUserRentalRequestController.js'),
  read('src/features/requests/useUserRequestHistoryActionController.js'),
  read('src/features/members/useUserMembershipStatusController.js'),
]);
for (const marker of ['readAccountLifecycleAuthorityConfig', 'readAccountLifecycleAuthorityFromPayload', 'accountLifecycleConfig.requested', 'bootstrapUserSignup', 'signupPayload?.signupLifecycle?.firestoreBootstrap']) assert.ok(signup.includes(marker), marker);
assert.ok(signup.includes('createUserWithEmailAndPassword'), 'Firebase Auth compatibility identity must remain during Phase 32');
assert.ok(signup.includes('runTransaction(userSignupDb'), 'legacy signup rollback path must remain available when Phase 32 is disabled');
for (const marker of ['getUserTermsConsent', 'bootstrapUserTermsConsent', 'saveUserTermsConsent', 'readAccountLifecycleAuthorityFromPayload', 'payload?.termsConsent?.firestoreMirror']) assert.ok(termsPanel.includes(marker), marker);
assert.ok(termsPanel.includes('loadUserTermConsentStates'), 'legacy terms path must remain for rollback');
for (const marker of ['readAccountLifecycleAuthorityConfig', 'readAccountLifecycleAuthorityFromPayload', 'getUserTermsConsent', 'bootstrapUserTermsConsent']) assert.ok(termsCompliance.includes(marker), `terms compliance ${marker}`);
assert.ok(termsCompliance.includes('SIGNUP_TERMS_POLICY_DOC_REF'), 'legacy Firestore policy watcher must remain only for rollback');
assert.ok(userWorkspace.includes('termsComplianceRefreshKey'), 'terms gate must refresh PostgreSQL compliance after save');
assert.ok(userWorkspace.includes('onCompleted={() => setTermsComplianceRefreshKey'), 'terms completion must release the gate by re-reading PostgreSQL state');
assert.ok(recovery.includes('sendPasswordResetEmail(firebaseAuth'), 'Phase 32 rollback path must retain Firebase password reset delivery');
assert.ok(recovery.includes('startUserPasswordReset'), 'Phase 33 must add Clerk email-code password reset without deleting the rollback path');
assert.ok(userAuthPanel.includes("passwordResetStage === 'code'"), 'Phase 33 reset UI must support the Clerk email-code completion stage');
for (const marker of ['requestAccountLifecycleSignup', 'requestUserTermsConsentBootstrap', 'bootstrapUserTermsConsent', '/api/users/me/terms-consent/bootstrap']) assert.ok(client.includes(marker), marker);
assert.ok(client.includes('reset_password_email_code'), 'Phase 33 must support Clerk email-code password reset');
for (const marker of ['Clerk Staging Test · Phase 33', 'Phase 32 signup + terms consent PostgreSQL account lifecycle authority', 'Terms consent legacy bootstrap:', 'Password reset delivery:', 'phase33-user-clerk-content-authority-20260811-2210', 'Runtime revision:', "top: '184px'"]) assert.ok(diagnostics.includes(marker), marker);
for (const source of [signup, termsPanel, termsCompliance]) assert.ok(!source.includes('backendApplied: true'), 'Phase 32 operation observations must not hardcode backend authority');
assert.ok(cutover.includes('readAccountLifecycleAuthorityFromPayload'));
assert.ok(cutover.includes("['firebase-auth-compatibility-preserved', 'clerk-email-code'].includes(authority.passwordResetDelivery)"));
for (const marker of ['phase32Diagnostic', 'attempts = 3', 'sleepImpl', "searchParams.set('_ts'"]) assert.ok(cutover.includes(marker), `diagnostic retry ${marker}`);

for (const marker of ['readAccountLifecycleAuthorityConfig', "view !== 'admin'", '!authenticatedAdminId', 'setCurrentAuthRoleReady(true)']) {
  assert.ok(authIdentityPolicy.includes(marker), `Phase 32 general-user role authority marker: ${marker}`);
}
assert.ok(authIdentityPolicy.includes('adminAccounts/{uid}'), 'Phase 32 role bypass must document why user Firestore admin-role reads are skipped');
for (const marker of ['lifecycleConfig.userLifecycleRequested', 'finalizeUserWithdrawal(', "withdrawalAuthority: 'postgresql'", 'user_withdrawal_restriction_blocked']) {
  assert.ok(withdrawalController.includes(marker), `Phase 32 PostgreSQL withdrawal marker: ${marker}`);
}
for (const marker of ['writeCutoverConfig.requested', 'currentUserRestrictionReady', 'rentalRequestsReady', 'currentUserRentalRestrictionStatus']) {
  assert.ok(rentalCreateController.includes(marker), `Phase 32 rental-create preflight marker: ${marker}`);
}
for (const marker of ['userActionCutoverConfig.requested', 'currentUserRestrictionReady', 'rentalRequestsReady', 'currentUserRentalRestrictionStatus']) {
  assert.ok(rentalActionController.includes(marker), `Phase 32 rental-action preflight marker: ${marker}`);
}
for (const marker of ['readMemberAuthorityCutoverConfig', 'memberAuthorityConfig.memberRequested', 'verifyMemberDirectory(firebaseIdToken)', "authority: 'postgresql'"]) {
  assert.ok(membershipStatusController.includes(marker), `Phase 32 PostgreSQL member-directory verification marker: ${marker}`);
}
for (const marker of ['requestMemberDirectoryAuthorityVerification', '/api/users/me/member-directory/verify', 'memberDirectoryVerification']) {
  assert.ok(client.includes(marker), `Phase 32 member-directory API client marker: ${marker}`);
}
console.log('[account-lifecycle-authority-frontend-smoke] PASS (payload-derived Phase 32 authority, fail-safe admin route intent, signup/terms cutover, Firebase reset preservation, diagnostics)');
