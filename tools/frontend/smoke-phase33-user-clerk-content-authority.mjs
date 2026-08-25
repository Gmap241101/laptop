import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createClerkPostgresqlUserPrincipal,
  readUserFirebaseAuthRetirementConfig,
} from '../../src/features/auth/userFirebaseAuthRetirement.js';
import { readAccountAuthCutoverConfig } from '../../src/features/auth/accountAuthCutover.js';

const createStorage = () => {
  const data = new Map();
  return {
    getItem(key) { return data.get(key) || null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
};
const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED: 'true',
  VITE_USER_FIREBASE_AUTH_COMPATIBILITY_DISABLED: 'true',
  VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED: 'true',
  VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};
const storage = createStorage();
const retirement = readUserFirebaseAuthRetirementConfig({ env, location: { search: '' }, storage });
assert.equal(retirement.requested, true);
assert.equal(retirement.rollbackRequested, false);
const rollback = readUserFirebaseAuthRetirementConfig({ env, location: { search: '?userFirebaseAuth=firebase' }, storage });
assert.equal(rollback.requested, false);
assert.equal(rollback.rollbackRequested, true);
const plainAdminAuthority = readAccountAuthCutoverConfig({
  env,
  location: { search: '' },
  storage: createStorage(),
});
assert.equal(plainAdminAuthority.adminClerkAuthorityRequired, true);
assert.equal(plainAdminAuthority.adminClerkAuthRequested, true);

const principal = createClerkPostgresqlUserPrincipal({ uid: 'clerk-native:test', email: 'User@Example.com', displayName: '사용자' });
assert.equal(principal.uid, 'clerk-native:test');
assert.equal(principal.email, 'user@example.com');
assert.equal(principal.providerId, 'clerk-postgresql');
assert.equal(await principal.getIdToken(), '');

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [
  login, signup, authRuntime, session, myPageSecurity, myPageAccount, recovery, recoveryService,
  client, termsCompliance, termsPanel, home, popupFooter, siteSettings, rentalData, termsService,
  diagnostics, userApp, adminApp, renderUserRoot, contextSlices, siteCutover, policyCutover, adminContentSync, boardCutover,
] = await Promise.all([
  read('src/features/auth/useUserLoginController.js'),
  read('src/features/auth/useUserSignupController.js'),
  read('src/features/auth/useAuthIdentityPolicySubscriptionController.js'),
  read('src/features/auth/useUserAuthenticationSessionController.js'),
  read('src/features/members/useUserMyPageSecurity.js'),
  read('src/features/members/useUserMyPageAccountController.js'),
  read('src/features/auth/useUserAccountRecoveryController.js'),
  read('src/features/members/accountRecoveryService.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/features/terms/useUserTermsCompliance.js'),
  read('src/user/UserTermsConsentPanel.jsx'),
  read('src/user/UserHomePanel.jsx'),
  read('src/features/boards/usePopupFooterContentSubscriptionController.js'),
  read('src/features/settings/useSiteSettingsController.js'),
  read('src/features/requests/useRentalDataSubscriptionController.js'),
  read('src/features/terms/termsService.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/UserApp.jsx'),
  read('src/admin/AdminApp.jsx'),
  read('src/bootstrap/renderUserRoot.jsx'),
  read('src/context/appContextSlices.js'),
  read('src/features/content/siteContentCutover.js'),
  read('src/features/content/policyContentCutover.js'),
  read('src/features/content/useAdminPublicContentSynchronizationController.js'),
  read('src/features/boards/boardContentCutover.js'),
]);

for (const [source, marker] of [[siteCutover, 'VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED'], [policyCutover, 'VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED']]) {
  assert.ok(source.includes(marker), `content authority flag ${marker}`);
  assert.ok(source.includes('authorityRequested'));
  assert.ok(source.includes('fallbackAllowed'));
}
for (const marker of ['readUserFirebaseAuthRetirementConfig', 'createClerkPostgresqlUserPrincipal', 'firebaseRetirement.requested']) assert.ok(login.includes(marker), `login ${marker}`);
for (const marker of ['signupUserNative', 'createClerkPostgresqlUserPrincipal', 'firebaseRetirement.requested']) assert.ok(signup.includes(marker), `signup ${marker}`);
for (const marker of ['readUserFirebaseAuthRetirementConfig', 'clerkStagingClient.getUserClerkSession', 'setFirebaseAuthReady(true)']) assert.ok(authRuntime.includes(marker), `auth runtime ${marker}`);
assert.ok(session.includes('readUserFirebaseAuthRetirementConfig'));
for (const marker of ['readUserFirebaseAuthRetirementConfig', "passwordFirebaseCompatibility: 'retired'", "changeUserPassword(\n            '',"]) assert.ok(myPageSecurity.includes(marker), `mypage security ${marker}`);
for (const marker of ['readUserFirebaseAuthRetirementConfig', "firebaseCleanup = firebaseRetirement.requested ? 'retired'", 'if (!firebaseRetirement.requested) {\n        await updateProfile']) assert.ok(myPageAccount.includes(marker), `mypage account ${marker}`);
for (const marker of ['startUserPasswordReset', 'completeUserPasswordReset', "passwordResetStage === 'code'"]) assert.ok(recovery.includes(marker), `recovery ${marker}`);
assert.ok(recoveryService.includes('readUserFirebaseAuthRetirementConfig'));
for (const marker of ['reset_password_email_code', 'optionalFirebaseAuthorizationHeader', 'signupUserNative']) assert.ok(client.includes(marker), `client ${marker}`);
for (const source of [termsCompliance, termsPanel]) assert.ok(source.includes('terms_consent_postgresql_bootstrap_required'), 'terms bootstrap must fail closed after user Firebase retirement');
for (const source of [home, popupFooter, siteSettings, rentalData, termsService]) assert.ok(source.includes('authorityRequested'), 'public content must honor PostgreSQL authority without silent Firestore fallback');
for (const marker of ['Clerk Staging Test · Phase 33', 'Phase 33 user Clerk-only auth + public content PostgreSQL authority', 'phase33-user-clerk-content-authority-20260811-2210', 'phase33-admin-clerk-authority-coupling-hotfix-20260812-1104', 'Frontend hotfix revision:', "top: '184px'"]) assert.ok(diagnostics.includes(marker), `diagnostics ${marker}`);
assert.ok(diagnostics.includes("const PHASE32_RUNTIME_REVISION = 'phase32-new-member-runtime-authority-20260811-2108';"), 'Phase 32 diagnostics revision constant must remain defined');
assert.equal((diagnostics.match(/PHASE32_RUNTIME_REVISION/g) || []).length, 2, 'Phase 32 diagnostics revision must have one definition and one render reference');
assert.ok(renderUserRoot.includes('UserRuntimeErrorBoundary'), 'user runtime must retain an isolated render error boundary');
assert.ok(renderUserRoot.includes('<ClerkStagingDiagnostics runtimeSurface="user" />'), 'user diagnostics must remain an independently rendered lazy surface');
assert.ok(contextSlices.includes('passwordResetForm passwordResetLoading passwordResetStage passwordResetVerificationResult'), 'password reset stage must be included in user auth context');
assert.ok(userApp.includes('passwordResetStage'));
assert.ok((userApp.match(/setFirebaseAuthUser,/g) || []).length >= 4, 'UserApp must pass the synthetic user setter to Phase 33 auth controllers');

for (const [source, envMarker, writeParam] of [
  [siteCutover, 'VITE_SITE_CONTENT_WRITE_THROUGH_ENABLED', 'siteContentWrite'],
  [policyCutover, 'VITE_POLICY_CONTENT_WRITE_THROUGH_ENABLED', 'policyContentWrite'],
]) {
  assert.ok(source.includes('|| authorityEnabled'), `${envMarker} must be implied by Phase 33 public authority`);
  assert.ok(source.includes('queryWriteRollback'), `${writeParam} must retain explicit rollback`);
  assert.ok(source.includes('(authorityEnabled && !queryRollback && !queryWriteRollback)'), `${writeParam} must be required under public authority`);
}
for (const marker of [
  'syncAllSiteContentDomainsFromFirestore',
  'syncAllPolicyContentDomainsFromFirestore',
  'siteConfig.authorityRequested && siteConfig.writeThroughRequested',
  'policyConfig.authorityRequested && policyConfig.writeThroughRequested',
  'mk_phase33_public_content_authority_repair_20260812_1104',
]) assert.ok(adminContentSync.includes(marker), `admin public content synchronization ${marker}`);
assert.ok(siteCutover.includes('phase33-public-content-full-server-sync-hotfix-20260812-0117'), 'backend full-domain synchronization revision must remain unchanged');
assert.ok(adminApp.includes('useAdminPublicContentSynchronizationController'), 'AdminApp must run Phase 33 administrator content reconciliation');

for (const marker of ['DOMAIN_CACHE_TTL_MS = 5_000', 'publishSiteContentInvalidation', 'firestore-server-backend-full-domain']) {
  assert.ok(siteCutover.includes(marker), `Phase 33 site-content refresh/verification marker missing: ${marker}`);
}

for (const [source, label] of [[siteCutover, 'site content'], [boardCutover, 'board content']]) {
  assert.ok(source.includes("clerkStagingClient.initialize()"), `${label} must initialize ClerkJS before requesting an administrator token`);
  assert.ok(!source.includes('globalThis.Clerk?.session'), `${label} must not race ClerkJS hydration through globalThis.Clerk.session`);
}

console.log('[phase33-user-clerk-content-authority-frontend-smoke] PASS (Clerk-only user runtime, Clerk reset, PG-only public content authority, rollback switches, diagnostics)');
