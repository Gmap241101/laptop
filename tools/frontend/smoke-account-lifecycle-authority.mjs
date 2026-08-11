import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAccountLifecycleAuthorityConfig, readAccountLifecycleAuthorityFromPayload, requestAccountLifecycleAuthorityStatus } from '../../src/features/auth/accountLifecycleAuthority.js';
import { clearAdminRouteIntent, pushAppPath, replaceAppPath, writeAdminRouteIntent } from '../../src/routing/appRoutes.js';

const storage = new Map();
const config = readAccountLifecycleAuthorityConfig({
  env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED: 'true', VITE_API_URL: 'https://api.example.test/' },
  location: { search: '?accountLifecycle=postgres' },
  storage: { getItem(key) { return storage.get(key) || null; }, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } },
});
assert.equal(config.enabled, true);
assert.equal(config.requested, true);
assert.equal(config.apiBaseUrl, 'https://api.example.test');
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
const [signup, termsPanel, termsCompliance, userWorkspace, recovery, userAuthPanel, client, diagnostics, cutover] = await Promise.all([
  read('src/features/auth/useUserSignupController.js'),
  read('src/user/UserTermsConsentPanel.jsx'),
  read('src/features/terms/useUserTermsCompliance.js'),
  read('src/user/UserWorkspace.jsx'),
  read('src/features/auth/useUserAccountRecoveryController.js'),
  read('src/user/UserAuthPanel.jsx'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/features/auth/accountLifecycleAuthority.js'),
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
assert.ok(recovery.includes('sendPasswordResetEmail(firebaseAuth'), 'Firebase password reset delivery must remain until Firebase Auth compatibility is retired');
assert.ok(!recovery.includes('startUserPasswordReset'), 'Phase 32 must not create an unsynchronized Clerk-only password reset path');
assert.ok(!userAuthPanel.includes('passwordResetCodeStage'), 'password reset UI must remain the compatibility flow in Phase 32');
for (const marker of ['requestAccountLifecycleSignup', 'requestUserTermsConsentBootstrap', 'bootstrapUserTermsConsent', '/api/users/me/terms-consent/bootstrap']) assert.ok(client.includes(marker), marker);
assert.ok(!client.includes('reset_password_email_code'), 'Clerk-only password reset must not be enabled while Firebase password compatibility remains');
for (const marker of ['Clerk Staging Test · Phase 32', 'Phase 32 signup + terms consent PostgreSQL account lifecycle authority', 'Terms consent legacy bootstrap:', 'Password reset delivery:', 'phase32-canonical-member-profile-read-20260811-2054', 'Runtime revision:', "top: '184px'"]) assert.ok(diagnostics.includes(marker), marker);
for (const source of [signup, termsPanel, termsCompliance]) assert.ok(!source.includes('backendApplied: true'), 'Phase 32 operation observations must not hardcode backend authority');
assert.ok(cutover.includes('readAccountLifecycleAuthorityFromPayload'));
assert.ok(cutover.includes("passwordResetDelivery === 'firebase-auth-compatibility-preserved'"));
for (const marker of ['phase32Diagnostic', 'attempts = 3', 'sleepImpl', "searchParams.set('_ts'"]) assert.ok(cutover.includes(marker), `diagnostic retry ${marker}`);
console.log('[account-lifecycle-authority-frontend-smoke] PASS (payload-derived Phase 32 authority, fail-safe admin route intent, signup/terms cutover, Firebase reset preservation, diagnostics)');
