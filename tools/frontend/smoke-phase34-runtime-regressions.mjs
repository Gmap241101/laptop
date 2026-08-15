import assert from 'node:assert/strict';

import { createRentalRequestId, RENTAL_REQUEST_ID_PATTERN } from '../../src/features/requests/rentalRequestId.js';
import { createSiteContentDomainDocument } from '../../src/features/content/siteContentCutover.js';
import { formatUserAccountCreatedAt } from '../../src/features/members/memberAccountPolicy.js';
import { getClerkPasswordSignInErrorMessage } from '../../src/features/auth/loginErrorMessages.js';
import { requestAdminClerkDeviceTrust, requestAdminClerkDeviceTrustWrite, requestAdminMemberDirectoryAuditPostgresql, requestAdminMemberDirectoryRestorePostgresql, requestAdminRentalConfigSettingsPatch, requestAdminSignupPolicyPatch, requestCurrentUserRentalRestriction } from '../../src/clerk/clerkStagingClient.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (let index = 0; index < 25; index += 1) {
  const requestId = createRentalRequestId();
  assert.match(requestId, RENTAL_REQUEST_ID_PATTERN, `generated request ID must satisfy backend contract: ${requestId}`);
  assert.notEqual(requestId, 'REQ-');
}

const siteDocument = createSiteContentDomainDocument({
  key: 'homeBanners/banner-test',
  payload: { title: 'test', enabled: true, sortOrder: 7 },
});
assert.equal(siteDocument.key, 'homeBanners/banner-test');
assert.equal(siteDocument.enabled, true);
assert.equal(siteDocument.sortOrder, 7);
assert.equal(siteDocument.payload.title, 'test');

const clerk = { session: { async getToken() { return 'clerk-test-token'; } } };
let requestedUrl = '';
let requestedHeaders = null;
const fetchImpl = async (url, options = {}) => {
  requestedUrl = String(url);
  requestedHeaders = options.headers || {};
  return new Response(JSON.stringify({
    authenticated: true,
    authorized: true,
    rentalRestriction: {
      source: 'postgresql-authoritative',
      authoritative: true,
      exists: false,
      restriction: null,
      authorityMode: 'postgresql-authoritative',
      mirrorState: 'retired',
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const restrictionPayload = await requestCurrentUserRentalRestriction({
  clerk,
  apiBaseUrl: 'https://api.example.test',
  fetchImpl,
});
assert.equal(requestedUrl, 'https://api.example.test/api/users/me/rental-restriction');
assert.equal(requestedHeaders.Authorization, 'Bearer clerk-test-token');
assert.equal(restrictionPayload.rentalRestriction.source, 'postgresql-authoritative');
assert.equal(restrictionPayload.rentalRestriction.exists, false);

const deviceTrustFrontendRequests = [];
const deviceTrustFetch = async (url, options = {}) => {
  deviceTrustFrontendRequests.push({ url: String(url), options });
  if (options.method === 'GET') {
    return new Response(JSON.stringify({
      authenticated: true, authorized: true,
      clerkDeviceTrust: { source: 'clerk-platform-api', authority: 'clerk-device-trust', configured: true, enabled: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (options.method === 'PATCH') {
    assert.deepEqual(JSON.parse(options.body), { enabled: false });
    return new Response(JSON.stringify({
      authenticated: true, authorized: true,
      clerkDeviceTrust: { source: 'clerk-platform-api', authority: 'clerk-device-trust', configured: true, enabled: false },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`Unexpected Device Trust frontend request: ${options.method}`);
};
const deviceTrustReadPayload = await requestAdminClerkDeviceTrust({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl: deviceTrustFetch });
assert.equal(deviceTrustReadPayload.clerkDeviceTrust.enabled, true);
const deviceTrustWritePayload = await requestAdminClerkDeviceTrustWrite({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl: deviceTrustFetch, enabled: false });
assert.equal(deviceTrustWritePayload.clerkDeviceTrust.enabled, false);
assert.equal(deviceTrustFrontendRequests[0].url, 'https://api.example.test/api/admin/clerk-device-trust');
assert.equal(deviceTrustFrontendRequests[0].options.headers.Authorization, 'Bearer clerk-test-token');
assert.equal(deviceTrustFrontendRequests[1].options.method, 'PATCH');



const readinessSource = fs.readFileSync(new URL('../../src/selectors/appReadinessSelectors.js', import.meta.url), 'utf8');
const adminBaseBlock = readinessSource.match(/const adminBaseReady =[\s\S]*?const adminLoadError/)?.[0] || '';
assert.equal(adminBaseBlock.includes('firebaseReady'), false, 'administrator auth readiness must not depend on per-menu data readiness');
const adminLoadingBlock = readinessSource.match(/shouldShowAdminLoadingPage:[\s\S]*?shouldShowAdminLoginPage:/)?.[0] || '';
assert.equal(adminLoadingBlock.includes('!firebaseReady'), false, 'per-menu PostgreSQL loading must not reopen the administrator verification gate');

const identitySource = fs.readFileSync(new URL('../../src/features/auth/useAuthIdentityPolicySubscriptionController.js', import.meta.url), 'utf8');
const adminAccountEffectTail = identitySource.match(/setAdminAccountsReady\(false\);[\s\S]*?\}, \[authenticatedAdminId, currentAuthAdminAccount\?\.id, runtimeSurface\]\);/)?.[0] || '';
assert.ok(adminAccountEffectTail, 'administrator registry refresh must depend on administrator identity and dedicated app surface only');
assert.equal(adminAccountEffectTail.includes('adminTab'), false, 'administrator registry must not reload on every menu change');

const adminIdentitySource = fs.readFileSync(new URL('../../src/features/auth/useAdminIdentityPolicyController.js', import.meta.url), 'utf8');
assert.match(adminIdentitySource, /getAdminClerkSession\(\)/, 'dedicated administrator root must bootstrap from the administrator Clerk session');
assert.match(adminIdentitySource, /getAdminSystemConfiguration\(\s*'admin-security'\s*\)/, 'dedicated administrator root must load PostgreSQL administrator security policy');
assert.match(adminIdentitySource, /getAdminAccountsPostgresql\(\)/, 'dedicated administrator root must load the PostgreSQL administrator registry');
assert.equal(adminIdentitySource.includes('useAuthIdentityPolicySubscriptionController'), false, 'administrator identity lifecycle must not reuse the mixed user identity controller');

const adminAuthSource = fs.readFileSync(new URL('../../src/features/auth/useAdminAuthenticationController.js', import.meta.url), 'utf8');
const userLoginSource = fs.readFileSync(new URL('../../src/features/auth/useUserLoginController.js', import.meta.url), 'utf8');
const userSignupSource = fs.readFileSync(new URL('../../src/features/auth/useUserSignupController.js', import.meta.url), 'utf8');
const loginErrorMessagesSource = fs.readFileSync(new URL('../../src/features/auth/loginErrorMessages.js', import.meta.url), 'utf8');
const userAuthPanelSource = fs.readFileSync(new URL('../../src/user/UserAuthPanel.jsx', import.meta.url), 'utf8');
const deviceTrustPanelSource = fs.readFileSync(new URL('../../src/components/DeviceTrustVerificationPanel.jsx', import.meta.url), 'utf8');
const adminWorkspaceLoginSource = fs.readFileSync(new URL('../../src/admin/AdminWorkspace.jsx', import.meta.url), 'utf8');
assert.match(
  adminAuthSource,
  /const loginSecuritySettings = await loadAuthoritativeAdminSecuritySettings\(\);[\s\S]*?setAdminAuthenticatedSession\(nextAdminAccount\.id, loginSecuritySettings\)/,
  'Clerk-only administrator login must persist the PostgreSQL admin-security policy snapshot instead of the pre-login default policy'
);
assert.equal(
  adminAuthSource.includes('setAdminAuthenticatedSession(nextAdminAccount.id, normalizeSystemAdminSettings(systemAdminSettings))'),
  false,
  'administrator login must not persist a default/pre-hydration security policy snapshot'
);
assert.match(
  adminAuthSource,
  /const authoritativeSecurity = await loadAuthoritativeAdminSecuritySettings\(\);[\s\S]*?confirmedPolicyMismatch =[\s\S]*?adminAuthPolicyVersion !== authoritativeSecurity\.adminSecurityPolicyVersion/,
  'administrator policy mismatch logout must be confirmed against PostgreSQL before invalidating the Clerk session'
);
assert.match(adminAuthSource, /runtimeSurface === 'admin'[\s\S]*redirectUrl: '\/admin'/, 'administrator Clerk sign-out must explicitly return to the dedicated /admin login surface');
assert.match(userAuthPanelSource, /<DeviceTrustVerificationPanel[\s\S]*surface="user"/, 'user new-device verification must use the shared Device Trust code-entry panel');
assert.match(adminWorkspaceLoginSource, /<DeviceTrustVerificationPanel[\s\S]*surface="admin"/, 'administrator new-device verification must use the same shared Device Trust code-entry panel');
assert.match(deviceTrustPanelSource, /새로운 기기에서 로그인하셨습니다\.[\s\S]*로 보낸 인증코드를 입력해주세요\./, 'shared Device Trust panel must show the unified new-device verification message');
assert.match(deviceTrustPanelSource, /Array\.from\(\{ length: CODE_LENGTH \}/, 'Device Trust verification must render a fixed six-slot code input');
assert.match(deviceTrustPanelSource, /CODE_LENGTH = 6/, 'Device Trust email verification code UI must use six separated digits');
assert.match(deviceTrustPanelSource, /resendUserClientTrust\(\)|resendAdminClientTrust\(\)/, 'Device Trust panel must support verification-code resend');
assert.equal(deviceTrustPanelSource.includes('인증 완료 후 이 브라우저를 신뢰된 기기로 인식'), false, 'unsupported Device Trust recognition checkbox/message must not be rendered');
assert.equal(deviceTrustPanelSource.includes('Clerk Device Trust가 자동 적용'), false, 'implementation-detail Device Trust trust-message must not be rendered');
assert.match(userAuthPanelSource, /grid-cols-\[minmax\(0,5fr\)_minmax\(96px,1fr\)\]/, 'signup email input and verification action must use the requested 5:1 row layout');
assert.match(userAuthPanelSource, /signupEmailVerified[\s\S]*인증완료/, 'signup email verification must visibly switch to the verified state');
assert.match(userAuthPanelSource, /<ModalPortal[\s\S]*회원가입 이메일 인증[\s\S]*<DeviceTrustVerificationPanel/, 'signup email verification must use a modal with the shared six-digit verification UI');
assert.match(userAuthPanelSource, /resendUserSignupEmailVerification/, 'signup email verification modal must support email-code resend');
assert.match(userAuthPanelSource, /signupEmailVerificationRequested/, 'signup must remember that email verification was started');
assert.match(userAuthPanelSource, /이메일 인증을 완료해야 회원가입할 수 있습니다\./, 'closing an unfinished signup verification modal must explain that email verification is still required');
assert.equal(
  getClerkPasswordSignInErrorMessage({ errors: [{ code: 'form_identifier_not_found' }] }),
  '입력한 이메일로 등록된 로그인 계정을 찾을 수 없습니다. 이메일 주소를 확인해 주세요.',
);
assert.equal(
  getClerkPasswordSignInErrorMessage({ errors: [{ code: 'form_password_incorrect' }] }),
  '비밀번호가 올바르지 않습니다. 비밀번호를 다시 확인해 주세요.',
);
assert.equal(
  getClerkPasswordSignInErrorMessage({ errors: [{ code: 'form_password_or_identifier_incorrect' }] }),
  '이메일 또는 비밀번호가 올바르지 않습니다.',
  'enumeration-protected Clerk errors must use one concise shared credential message',
);
assert.match(userLoginSource, /getClerkPasswordSignInErrorMessage\(error\)/, 'user login must use the shared Clerk credential failure mapper');
assert.match(adminAuthSource, /getClerkPasswordSignInErrorMessage\(error\)/, 'administrator login must use the same shared Clerk credential failure mapper');
assert.equal(loginErrorMessagesSource.includes('관리자 비밀번호가 올바르지 않습니다.'), false, 'login credential messages must not diverge by user/admin surface');
assert.equal(loginErrorMessagesSource.includes('현재 Clerk 보안 설정상'), false, 'login credential toast must not expose Clerk implementation details');
assert.match(userAuthPanelSource, /회원가입 이용약관을 불러오는 중입니다\. 잠시 후 다시 시도해 주세요\./, 'signup terms step must explain loading state through toast instead of a disabled action');
assert.match(userAuthPanelSource, /disabled=\{userAuthLoading\}[\s\S]*회원가입/, 'final signup action must only be disabled while a signup submission is actively running');
assert.match(userSignupSource, /회원가입에 사용할 이메일 인증을 먼저 완료해 주세요\./, 'final signup submission must explain missing email verification through toast');
const signupValidationOrder = [
  '이메일을 입력해 주세요.',
  '이메일 주소 형식이 정확하지 않습니다.\\n인증받을 이메일 주소를 정확히 입력해 주세요.',
  '회원가입에 사용할 이메일 인증을 먼저 완료해 주세요.',
  '이름을 입력해 주세요.',
  '올바른 국내 연락처를 입력해 주세요.',
  '비밀번호를 입력해 주세요.',
  '비밀번호 확인을 입력해 주세요.',
  '필수 회원가입 약관을 확인하고 동의해 주세요.',
];
for (let index = 1; index < signupValidationOrder.length; index += 1) {
  assert.ok(
    userSignupSource.indexOf(signupValidationOrder[index - 1]) < userSignupSource.indexOf(signupValidationOrder[index]),
    `signup validation order must follow the visible signup flow: ${signupValidationOrder[index - 1]} -> ${signupValidationOrder[index]}`
  );
}
assert.ok(userAuthPanelSource.includes('form_param_format_invalid') && userAuthPanelSource.includes('이메일 주소 형식이 정확하지 않습니다.\\n인증받을 이메일 주소를 정확히 입력해 주세요.'), 'Clerk signup email format failures must use the requested two-line user-readable email-format toast without exposing the raw error code');
assert.ok(userSignupSource.includes('이메일 주소 형식이 정확하지 않습니다.\\n인증받을 이메일 주소를 정확히 입력해 주세요.'), 'local signup email validation must use the same requested two-line email-format message');
assert.match(userSignupSource, /비밀번호 확인을 입력해 주세요\./, 'signup must distinguish an empty password confirmation from a mismatch');
assert.match(userSignupSource, /회원가입 인증 서비스를 준비 중입니다\. 잠시 후 다시 시도해 주세요\./, 'final signup submission must explain auth readiness through toast');
assert.match(userSignupSource, /회원 중복 확인 정보가 아직 준비되지 않았습니다\. 잠시 후 다시 시도해 주세요\./, 'final signup submission must explain member identity readiness through toast');
assert.match(userLoginSource, /6자리 인증코드를 모두 입력해 주세요\./, 'user Device Trust controller must require all six verification-code digits');
assert.match(adminAuthSource, /6자리 인증코드를 모두 입력해 주세요\./, 'administrator Device Trust controller must require all six verification-code digits');
assert.match(adminAuthSource, /const syncAdminRouteIntentAfterAuthClear =[\s\S]*runtimeSurface === 'admin'[\s\S]*writeAdminRouteIntent\(\)/, 'administrator logout/session expiry must preserve administrator route intent instead of handing control to the user surface');

const adminClerkVerificationEffect = adminAuthSource.match(/useEffect\(\(\) => \{[\s\S]*?getAdminClerkSession\(\)[\s\S]*?return \(\) => \{ cancelled = true; \};[\s\S]*?\}, \[[\s\S]*?runtimeSurface,[\s\S]*?\]\);/)?.[0] || '';
assert.ok(adminClerkVerificationEffect, 'administrator Clerk session verification effect must remain present');
assert.equal(
  adminClerkVerificationEffect.includes('let cancelled = false;\n    setAdminClerkSessionVerified(false);'),
  false,
  'an already verified interactive administrator login must not be forced back through the login page while the Clerk session is rechecked'
);

let patchRequest = null;
const patchPayload = await requestAdminRentalConfigSettingsPatch({
  clerk,
  apiBaseUrl: 'https://api.example.test',
  fetchImpl: async (url, options = {}) => {
    patchRequest = { url: String(url), options };
    return new Response(JSON.stringify({
      authenticated: true,
      authorized: true,
      rentalConfigMutation: { authority: 'postgresql', operation: 'settings-patch' },
      siteContent: { source: 'postgresql', documents: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
  settings: { holidays: [{ date: '2026-08-15', enabled: true }] },
});
assert.equal(patchPayload.rentalConfigMutation.operation, 'settings-patch');
assert.equal(patchRequest.url, 'https://api.example.test/api/admin/site-content/rental-config/settings');
assert.equal(patchRequest.options.method, 'PATCH');
assert.equal(patchRequest.options.headers.Authorization, 'Bearer clerk-test-token');
assert.deepEqual(JSON.parse(patchRequest.options.body).settings.holidays, [{ date: '2026-08-15', enabled: true }]);


let memberApiRequests = [];
const memberApiFetch = async (url, options = {}) => {
  memberApiRequests.push({ url: String(url), options });
  if (String(url).endsWith('/api/admin/member-signup-policy')) {
    return new Response(JSON.stringify({ authenticated: true, authorized: true, signupPolicyMutation: { authority: 'postgresql', operation: 'signup-policy-patch', settings: { requireRegisteredMemberForSignup: true }, termsPolicy: {} } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (String(url).endsWith('/api/admin/member-directory/audit')) {
    return new Response(JSON.stringify({ authenticated: true, authorized: true, memberDirectoryAudit: { authority: 'postgresql', audit: { total: 1, normal: 1, profileRequired: 0, duplicates: 0, missing: 0, failed: 0 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ authenticated: true, authorized: true, memberDirectoryRestore: { authority: 'postgresql', restoredCount: 0, failed: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
await requestAdminSignupPolicyPatch({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl: memberApiFetch, policy: { requireRegisteredMemberForSignup: true } });
await requestAdminMemberDirectoryAuditPostgresql({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl: memberApiFetch });
await requestAdminMemberDirectoryRestorePostgresql({ clerk, apiBaseUrl: 'https://api.example.test', fetchImpl: memberApiFetch });
assert.deepEqual(memberApiRequests.map((item) => item.url), [
  'https://api.example.test/api/admin/member-signup-policy',
  'https://api.example.test/api/admin/member-directory/audit',
  'https://api.example.test/api/admin/member-directory/restore-mismatches',
]);
assert.ok(memberApiRequests.every((item) => item.options.headers.Authorization === 'Bearer clerk-test-token'), 'member policy/audit requests must use Clerk bearer authorization');

const memberDirectoryAuditSource = fs.readFileSync(new URL('../../src/features/members/useAdminMemberDirectoryAuditActions.js', import.meta.url), 'utf8');
assert.equal(memberDirectoryAuditSource.includes('retiredLegacyDataCompat'), false, 'active administrator member-directory audit must not import the retired compatibility shell');
assert.equal(/\bgetDocs\b|\bsetDoc\b|\bwriteBatch\b|commitFirestoreOperations|firebaseAuth\.currentUser/.test(memberDirectoryAuditSource), false, 'active administrator member-directory audit must not execute Firebase-shaped data operations');
assert.match(memberDirectoryAuditSource, /auditAdminMemberDirectory\(\)/, 'full member-directory audit must use the Clerk/PostgreSQL API');
assert.match(memberDirectoryAuditSource, /restoreAdminMemberDirectoryMismatches\(\)/, 'directory mismatch restore must use the Clerk/PostgreSQL API');

const signupPolicySource = fs.readFileSync(new URL('../../src/features/members/useAdminSignupPolicyActions.js', import.meta.url), 'utf8');
assert.equal(signupPolicySource.includes('replacePolicyContentDomainInPostgresql'), false, 'signup-policy save must not replace full site-content domains from the browser');
assert.match(signupPolicySource, /saveAdminSignupPolicy\(/, 'signup-policy save must use the dedicated PostgreSQL endpoint');
assert.match(signupPolicySource, /error\?\.code \|\| error\?\.name/, 'signup-policy failures must expose an actionable error code');


const formattedCreatedAt = formatUserAccountCreatedAt({ createdAt: '2026-07-01T01:02:03.000Z' });
assert.notEqual(formattedCreatedAt, '-', 'PostgreSQL ISO member signup timestamp must render in member detail/edit views');
const memberEditSource = fs.readFileSync(new URL('../../src/features/members/useAdminMemberAccountEditActions.js', import.meta.url), 'utf8');
assert.match(memberEditSource, /createdAt:[\s\S]*adminMemberProfileWrite\?\.profile\?\.createdAt[\s\S]*account\?\.createdAt/, 'administrator member edit state must preserve createdAt');

const appShellSource = fs.readFileSync(new URL('../../src/shell/AppShell.jsx', import.meta.url), 'utf8');
assert.equal(appShellSource.includes('Firebase 원격 DB 기준으로 데이터를 불러오고 있습니다.'), false, 'retired Firebase loading copy must not remain');
assert.equal(appShellSource.includes('PostgreSQL 운영 DB 기준으로 데이터를 불러오고 있습니다.'), true);
const rentalDataSource = fs.readFileSync(new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url), 'utf8');
assert.equal(rentalDataSource.includes('firestore-one-time-fallback'), false, 'asset runtime must not retain Firestore fallback source labels');
assert.match(
  rentalDataSource,
  /import\s*\{[\s\S]*?isLegacyFirestoreReadFallbackAllowed,[\s\S]*?readLegacyFirestoreReadFallbackConfig,[\s\S]*?recordLegacyFirestoreReadFallbackBlocked,[\s\S]*?\}\s*from '\.\.\/compatibility\/legacyFirestoreReadFallbackCutover\.js'/,
  'user rental runtime must import every legacy-read fallback helper it invokes so authenticated rental rendering cannot fail with ReferenceError'
);

const dashboardSummarySource = fs.readFileSync(new URL('../../src/hooks/useDashboardSummary.js', import.meta.url), 'utf8');
assert.equal(dashboardSummarySource.includes('DASHBOARD_SUMMARY_LIVE_REFRESH_INTERVAL_MS'), false, 'dashboard synchronization must not retain a timer interval');
assert.equal(/setInterval\([^\n]*refreshDashboardSummary|setInterval\([^\n]*refreshIfVisible/.test(dashboardSummarySource), false, 'dashboard must not poll PostgreSQL while the administrator leaves the window open');
assert.match(dashboardSummarySource, /refreshIfVisible\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'dashboard must refresh once on entry and once after an actual window leave/return');
assert.match(dashboardSummarySource, /document\.visibilityState === 'hidden'[\s\S]*markWindowAway\(\);[\s\S]*refreshAfterWindowReturn\(\)/, 'dashboard must treat hidden-to-visible restoration as a return event');
assert.match(dashboardSummarySource, /subscribeAdminRentalRequestCutoverObservation\(refreshAfterMutation\)/, 'administrator rental-request writes must immediately invalidate the dashboard summary');
assert.match(dashboardSummarySource, /subscribeAssetDomainCutoverObservation\(refreshAfterMutation\)/, 'asset writes must immediately invalidate the dashboard summary');
assert.match(dashboardSummarySource, /subscribeMemberAuthorityObservation\(refreshAfterMutation\)/, 'member writes must immediately invalidate the dashboard summary');
assert.match(dashboardSummarySource, /const dashboardPayload = await clerkStagingClient\.getAdminRentalDashboard\('', referenceDate\);[\s\S]*applySummary\(core\);[\s\S]*Promise\.allSettled/, 'dashboard critical rental counts must render before slower supplemental PostgreSQL reads finish');
assert.match(dashboardSummarySource, /includeCounts: false/, 'dashboard request previews must not recalculate rental tab counts already returned by the dashboard endpoint');
assert.match(dashboardSummarySource, /getAdminSystemDataOverview\(\)[\s\S]*dataIntegritySource: 'postgresql-background'/, 'system integrity diagnostics must refresh in the background instead of blocking dashboard readiness');

const dataManagementPanelSource = fs.readFileSync(new URL('../../src/admin/AdminSettingsPanel.jsx', import.meta.url), 'utf8');
assert.match(dataManagementPanelSource, /SYSTEM_MANAGEMENT_TAB\.FOLLOWUP[\s\S]*'후속 조치'/, 'data-management follow-up actions must have a dedicated submenu');
assert.match(dataManagementPanelSource, /무결성 후속 조치/, 'data-management warnings must expose follow-up actions instead of ending at a passive warning');
assert.match(dataManagementPanelSource, /메타데이터 재동기화/, 'asset catalog metadata mismatch must expose a safe reconciliation action');
assert.match(dataManagementPanelSource, /기기 대여 신청 관리 열기/, 'non-auto-repairable rental-reference issues must provide a direct administrator follow-up navigation');
const dataMaintenanceControllerSource = fs.readFileSync(new URL('../../src/features/settings/useAdminDataMaintenanceController.js', import.meta.url), 'utf8');
assert.match(dataMaintenanceControllerSource, /reconcileAdminSystemDataAssetCatalogMetadata/, 'data-management controller must execute PostgreSQL catalog metadata reconciliation');

const adminRequestsSource = fs.readFileSync(new URL('../../src/features/requests/useAdminRequestsController.js', import.meta.url), 'utf8');
assert.equal(/setInterval\([^\n]*refreshPostgresRequests/.test(adminRequestsSource), false, 'administrator rental-request list must not poll PostgreSQL while the window remains open');
assert.match(adminRequestsSource, /refreshPostgresRequests\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'administrator rental-request list must refresh on entry and actual window return');
assert.match(adminRequestsSource, /let firebaseIdToken = '';[\s\S]*if \(!rentalWriteMirrorRetirementConfig\.enabled\) \{[\s\S]*firebaseAuth\.currentUser/, 'Phase 34 PostgreSQL administrator request reads must not require a retired Firebase principal');
assert.equal(/setInterval\([^\n]*refreshPostgresRequests/.test(rentalDataSource), false, 'signed-in user rental requests must not poll PostgreSQL while the window remains open');
assert.equal(/setInterval\([^\n]*refreshPostgresCatalog/.test(rentalDataSource), false, 'rental asset and availability status must not poll PostgreSQL while the window remains open');
assert.match(rentalDataSource, /refreshPostgresRequests\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'signed-in user rental requests must refresh on entry and actual window return');
assert.match(rentalDataSource, /scheduleInitialCatalogRefresh\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'rental asset and availability status must refresh once after initial scheduling and again only after actual window return');
assert.match(rentalDataSource, /view === 'user'[\s\S]*userTab === 'home'[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame\(refreshPostgresCatalog\)/, 'home asset/status fetch must be deferred until after the first paint instead of competing with initial rendering');
assert.match(rentalDataSource, /domain: POLICY_CONTENT_DOMAINS\.RENTAL_CONFIG,[\s\S]*?useCache: true/, 'user rental configuration must retain request sharing for subsequent consumers');
assert.match(rentalDataSource, /view === 'user' && userTab === 'home'[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame\(loadPublicConfig\)/, 'home rental configuration must start after first paint instead of competing with the critical home bootstrap');

const adminDashboardSource = fs.readFileSync(new URL('../../src/admin/AdminDashboardPanel.jsx', import.meta.url), 'utf8');
assert.match(adminDashboardSource, /진입·복귀 동기화 ·/, 'dashboard control must describe entry/return synchronization instead of continuous polling');

const richTextContentSource = fs.readFileSync(new URL('../../src/components/RichTextContent.jsx', import.meta.url), 'utf8');
assert.match(richTextContentSource, /targetOrigin = new URL\(iframe\.getAttribute\('src'\)/, 'YouTube postMessage target origin must be derived from the actual sanitized iframe URL');
assert.match(richTextContentSource, /if \(disposed \|\| !iframeLoaded \|\| !iframe\.contentWindow\) return;/, 'YouTube player messages must wait until the cross-origin iframe has loaded');
const youtubeListenerSetup = richTextContentSource.match(/window\.addEventListener\('message', handleMessage\);[\s\S]*?return \(\) => \{/)?.[0] || '';
assert.ok(youtubeListenerSetup, 'YouTube listener lifecycle must remain present');
assert.equal(/iframe\.addEventListener\('load', handleLoad\);\s*scheduleRetries\(\);/.test(youtubeListenerSetup), false, 'YouTube commands must not be posted immediately against the iframe about:blank document before the load event');


const userHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../../admin/index.html', import.meta.url), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const userMainSource = fs.readFileSync(new URL('../../src/user-main.jsx', import.meta.url), 'utf8');
const adminMainSource = fs.readFileSync(new URL('../../src/admin-main.jsx', import.meta.url), 'utf8');
const renderUserRootSource = fs.readFileSync(new URL('../../src/bootstrap/renderUserRoot.jsx', import.meta.url), 'utf8');
const userHomeBootstrapServiceSource = fs.readFileSync(new URL('../../src/user/userHomeBootstrapService.js', import.meta.url), 'utf8');
const userHomeBootstrapScreenSource = fs.readFileSync(new URL('../../src/user/UserHomeBootstrapScreen.jsx', import.meta.url), 'utf8');
const renderAppRootSource = fs.readFileSync(new URL('../../src/bootstrap/renderAppRoot.jsx', import.meta.url), 'utf8');
const renderAdminRootSource = fs.readFileSync(new URL('../../src/bootstrap/renderAdminRoot.jsx', import.meta.url), 'utf8');
const userAppSource = fs.readFileSync(new URL('../../src/UserApp.jsx', import.meta.url), 'utf8');
const userShellSource = fs.readFileSync(new URL('../../src/user/UserShell.jsx', import.meta.url), 'utf8');
const userWorkspaceSource = fs.readFileSync(new URL('../../src/user/UserWorkspace.jsx', import.meta.url), 'utf8');
const userNavigationSource = fs.readFileSync(new URL('../../src/routing/useAppNavigationController.js', import.meta.url), 'utf8');
const userHomeSource = fs.readFileSync(new URL('../../src/user/UserHomePanel.jsx', import.meta.url), 'utf8');
const boardSubscriptionControllerSource = fs.readFileSync(new URL('../../src/features/boards/useBoardContentSubscriptionController.js', import.meta.url), 'utf8');
const userRuntimeErrorBoundarySource = fs.readFileSync(new URL('../../src/user/UserRuntimeErrorBoundary.jsx', import.meta.url), 'utf8');
const adminAppSource = fs.readFileSync(new URL('../../src/admin/AdminApp.jsx', import.meta.url), 'utf8');
const adminWorkspaceSource = fs.readFileSync(new URL('../../src/admin/AdminWorkspace.jsx', import.meta.url), 'utf8');
const adminContextAssemblerSource = fs.readFileSync(new URL('../../src/admin/useAdminContextAssembler.js', import.meta.url), 'utf8');
const appDynamicContextValuesSource = fs.readFileSync(new URL('../../src/context/appDynamicContextValues.js', import.meta.url), 'utf8');
const adminAccountSecuritySource = fs.readFileSync(new URL('../../src/admin/AdminAccountSecurityPanel.jsx', import.meta.url), 'utf8');
assert.match(adminAccountSecuritySource, /title="새 기기 로그인 인증"/, 'account-security settings must expose the shared new-device login verification control');
assert.match(adminAccountSecuritySource, /새로운 기기에서 이메일 인증 사용/, 'Device Trust control must describe the requested yes/no behavior');
assert.match(adminAccountSecuritySource, /getAdminClerkDeviceTrust\(\)/, 'Device Trust control must read the live Clerk setting instead of trusting PostgreSQL state');
assert.match(adminAccountSecuritySource, /saveAdminClerkDeviceTrust\(/, 'Device Trust control must write the live Clerk setting');
assert.match(adminAccountSecuritySource, /device-trust-settings-update/, 'Device Trust changes must be recorded in system settings audit history');
assert.match(adminAccountSecuritySource, /deviceTrustDraft[\s\S]*'예'[\s\S]*'아니오'/, 'Device Trust setting must visibly expose yes/no state');
const contextSliceSource = fs.readFileSync(new URL('../../src/context/appContextSlices.js', import.meta.url), 'utf8');
const adminShellSource = fs.readFileSync(new URL('../../src/admin/AdminShell.jsx', import.meta.url), 'utf8');
const adminNavigationSource = fs.readFileSync(new URL('../../src/admin/useAdminNavigationController.js', import.meta.url), 'utf8');
const appRoutesSource = fs.readFileSync(new URL('../../src/routing/appRoutes.js', import.meta.url), 'utf8');
const userSessionSource = fs.readFileSync(new URL('../../src/features/auth/useUserAuthenticationSessionController.js', import.meta.url), 'utf8');
const membershipSource = fs.readFileSync(new URL('../../src/features/members/useUserMembershipStatusController.js', import.meta.url), 'utf8');

assert.match(userHtml, /src="\/src\/user-main\.jsx"/, 'user root must have a dedicated entrypoint');
assert.match(adminHtml, /src="\/src\/admin-main\.jsx"/, 'administrator root must have a dedicated entrypoint');
assert.equal(userHtml.includes('/src/admin-main.jsx'), false, 'user HTML must not bootstrap the administrator entrypoint');
assert.equal(adminHtml.includes('/src/user-main.jsx'), false, 'administrator HTML must not bootstrap the user entrypoint');
assert.equal(vercelConfig.rewrites?.[0]?.source, '/admin', 'Vercel must resolve /admin to the dedicated administrator document before the user SPA fallback');
assert.equal(vercelConfig.rewrites?.[0]?.destination, '/admin/index.html');
assert.match(userMainSource, /clearAdminRouteIntent\(\)/, 'user document must clear stale administrator route intent');
assert.match(adminMainSource, /writeAdminRouteIntent\(\)/, 'administrator document must establish administrator route intent before React mounts');
assert.match(userMainSource, /renderUserRoot/, 'user entrypoint must mount the dedicated user runtime root after the authenticated rental ReferenceError was resolved');
assert.equal(userMainSource.includes("import { renderUserRoot } from './bootstrap/renderUserRoot.jsx'"), false, 'user entrypoint must not synchronously load the full UserApp graph before public-home warmup starts');
assert.ok(userMainSource.indexOf('preloadUserHomeBootstrap()') < userMainSource.indexOf("import('./bootstrap/renderUserRoot.jsx')"), 'single home bootstrap request must begin before the full user runtime root is requested');
assert.match(userMainSource, /initialRoute\.view === 'user' && initialRoute\.userTab === 'home'/, 'critical home bootstrap must run only for the public home route and not burden direct login, board, or rental routes');
assert.equal(userMainSource.includes('requestNoticeBoard'), false, 'user entrypoint must not compete with first paint by starting home notice reads');
assert.equal(userMainSource.includes('requestPolicyContentDomain'), false, 'user entrypoint must not compete with first paint by starting rental configuration reads');
assert.equal(userMainSource.includes('requestSiteContentDomain'), false, 'user entrypoint must use one dedicated bootstrap request instead of separate site/home requests');
assert.match(userHomeBootstrapServiceSource, /\/api\/user\/home-bootstrap/, 'user home bootstrap must use one dedicated PostgreSQL endpoint');
assert.match(userHomeBootstrapServiceSource, /primeSiteContentDomainPromise\(SITE_CONTENT_DOMAINS\.SITE_SETTINGS/, 'home bootstrap must seed the site-settings in-flight cache');
assert.match(userHomeBootstrapServiceSource, /primeSiteContentDomainPromise\(SITE_CONTENT_DOMAINS\.HOME/, 'home bootstrap must seed the home in-flight cache');
assert.equal(userMainSource.includes('renderAppRoot'), false, 'user entrypoint must no longer fall back to the shared App/AppShell recovery runtime');
assert.match(renderUserRootSource, /React\.lazy\(\(\) => import\('\.\.\/UserApp\.jsx'\)\)/, 'full UserApp must be a lazy chunk so it cannot block the first user-home paint');
assert.match(renderUserRootSource, /fallback=\{homeFallback\}/, 'user root must paint the lightweight real home shell while the full UserApp chunk loads');
assert.match(userHomeBootstrapScreenSource, /preloadUserHomeBootstrap/, 'lightweight home shell must consume the same in-flight home bootstrap request');
assert.equal(renderUserRootSource.includes("import UserApp from '../UserApp.jsx'"), false, 'user root must not statically import the full UserApp graph');
assert.match(renderUserRootSource, /UserRuntimeErrorBoundary/, 'isolated user root must retain a top-level render error boundary');
assert.match(adminMainSource, /renderAdminRoot/, 'administrator entrypoint must mount the dedicated administrator root');
assert.equal(userMainSource.includes('renderAdminRoot'), false, 'user entrypoint must not import the administrator root');
assert.equal(adminMainSource.includes('renderUserRoot'), false, 'administrator entrypoint must not import the user root');
assert.match(renderAdminRootSource, /import AdminApp from '\.\.\/admin\/AdminApp\.jsx'/, 'administrator document must mount AdminApp directly');
assert.equal(renderAdminRootSource.includes('../App.jsx'), false, 'administrator document must not mount the legacy shared App root');
assert.match(userAppSource, /from '\.\/user\/UserShell\.jsx'/, 'isolated UserApp must render the dedicated user shell');
assert.match(userAppSource, /from '\.\/user\/useUserContextAssembler\.js'/, 'isolated UserApp must use the user-only context assembler');
assert.match(adminAppSource, /from '\.\/AdminShell\.jsx'/, 'AdminApp must render the administrator-only shell');
assert.equal(adminAppSource.includes('../user/'), false, 'AdminApp must not import user source modules');
assert.equal(userShellSource.includes('AdminWorkspace'), false, 'user shell must not contain the administrator workspace');
assert.equal(/(?:import\s+[^;]*|import\s*\()[\s\S]*?AppDialogs\.jsx/.test(userShellSource), false, 'user shell must not import mixed administrator dialogs');
assert.match(userShellSource, /UserDialogs/, 'user shell must mount user-only dialogs');
assert.match(userShellSource, /UserRuntimeErrorBoundary/, 'quarantined UserShell keeps its panel boundary for future isolated-runtime validation');
assert.match(userRuntimeErrorBoundarySource, /componentDidCatch\(error, errorInfo\)/, 'user runtime error boundary must catch protected-panel render failures instead of allowing an all-white root');
assert.match(userWorkspaceSource, /import UserHomePanel from '\.\/UserHomePanel\.jsx'/, 'user home panel must remain eagerly linked for immediate first-page rendering');
assert.match(userWorkspaceSource, /const UserRentalPanel = memo\(lazy\(\(\) => import\('\.\/UserRentalPanel\.jsx'\)\)\)/, 'rental panel must be lazy-loaded on first use like administrator subpanels');
assert.match(userWorkspaceSource, /const UserAuthPanel = memo\(lazy\(\(\) => import\('\.\/UserAuthPanel\.jsx'\)\)\)/, 'authentication panel must remain lazy-loaded on first use');
assert.match(userWorkspaceSource, /<Suspense fallback=\{null\}>/, 'user lazy panels must use a silent Suspense boundary');
assert.equal(userWorkspaceSource.includes('화면을 불러오는 중입니다.'), false, 'user lazy navigation must not expose a first-load explanatory placeholder');
assert.equal(userWorkspaceSource.includes('requestIdleCallback'), false, 'user home must not preload lazy panels during idle time and compete with the initial page');
assert.equal(userWorkspaceSource.includes('preloadCurrentUserPanels'), false, 'user home must not eagerly preload first-use panel chunks');
assert.match(userNavigationSource, /startTransition\(\(\) => \{[\s\S]*setView\('user'\);[\s\S]*setUserTab\(normalizedUserTab\);[\s\S]*\}\);/, 'user tab commits must use a transition so the previous panel remains visible while a first-use chunk downloads');
assert.match(adminNavigationSource, /window\.history\.pushState\(/, 'administrator menu changes must create same-document browser history entries');
assert.match(adminNavigationSource, /window\.addEventListener\('popstate', handlePopState\)/, 'administrator browser Back must restore the previous administrator menu through popstate');
assert.match(adminNavigationSource, /replaceAdminHistoryEntry\(currentTab, \{ boundary: true \}\);[\s\S]*pushAdminHistoryEntry\(currentTab\)/, 'administrator history must install a same-surface boundary so Back cannot fall through directly to the user document');
assert.match(adminNavigationSource, /historyMode: 'none'/, 'popstate restoration must not create another administrator history entry');
assert.match(userShellSource, /const showDataLoadingOverlay = userTab !== 'home' && !firebaseReady;/, 'initial home rendering must not be blurred behind the rental-data readiness overlay');
assert.match(userHomeSource, /loading=\{index === 0 \? 'eager' : 'lazy'\}/, 'only the first hero image should be eager; later hero images must be lazy');
assert.match(userHomeSource, /fetchPriority=\{index === 0 \? 'high' : 'auto'\}/, 'the first hero image should receive high fetch priority');
assert.match(userHomeSource, /domain: SITE_CONTENT_DOMAINS\.HOME,[\s\S]*?useCache: true/, 'user home must consume the early in-flight HOME request instead of forcing a duplicate uncached read');
assert.match(userHomeSource, /const hasPromotionBanners = bannersReady && promotionBanners\.length > 0;/, 'promotion layout must resolve from authoritative active banner metadata');
assert.match(userHomeSource, /!bannersReady \? \([\s\S]*초기화면 콘텐츠 배치 확인 중[\s\S]*\) : \([\s\S]*hasPromotionBanners \? 'lg:grid-cols-2' : 'grid-cols-1'/, 'notice/promotion row must wait for banner-presence resolution so the rendered notice never changes width');
assert.match(userHomeSource, /\{hasPromotionBanners && \([\s\S]*promotionSlots\.map/, 'promotion column must not render when there are no active promotion banners');
assert.match(userHomeSource, /loading=\{index < 2 \? 'eager' : 'lazy'\}[\s\S]*fetchPriority=\{index < 2 \? 'high' : 'auto'\}/, 'the first visible promotion row must receive eager/high image priority while lower promotion rows remain lazy');
assert.match(userHomeSource, /loading="lazy" decoding="async"/, 'below-the-fold quick-link images must use lazy asynchronous decoding');
assert.equal(adminShellSource.includes('UserWorkspace'), false, 'administrator shell must not contain the user workspace');
assert.equal(adminShellSource.includes('UserFooter'), false, 'administrator shell must not contain the user footer');
assert.equal(adminShellSource.includes('UserPopupLayer'), false, 'administrator shell must not contain the user popup layer');
assert.equal(adminShellSource.includes("React.lazy(() => import('./AdminWorkspace.jsx'))"), false, 'administrator workspace shell must remain eagerly linked so the admin layout appears immediately');
assert.equal(adminShellSource.includes("React.lazy(() => import('./AdminDialogs.jsx'))"), false, 'administrator dialogs must remain eagerly linked into the separate admin document');
assert.match(adminWorkspaceSource, /import AdminDashboardPanelView from '\.\/AdminDashboardPanel\.jsx'/, 'administrator dashboard must be eagerly linked for immediate post-login rendering');
assert.match(adminWorkspaceSource, /const loadAdminRequestsPanel = \(\) => import\('\.\/AdminRequestsPanel\.jsx'\);[\s\S]*const AdminRequestsPanel = memo\(lazy\(loadAdminRequestsPanel\)\);/, 'administrator request panel must remain lazy-loaded while exposing an explicit intent loader');
assert.match(adminWorkspaceSource, /<Suspense fallback=\{null\}>/, 'administrator lazy panels must use a silent Suspense boundary');
assert.match(adminWorkspaceSource, /ADMIN_PANEL_INTENT_LOADERS/, 'slow first-use administrator panels must expose explicit module/data intent loaders');
assert.match(adminWorkspaceSource, /onCommitted: \(\) => preloadAdminPanelOnIntent\(key\)/, 'administrator intent preload must also run when the requested tab change is committed');
assert.match(adminWorkspaceSource, /onPointerEnter=\{\(\) => preloadAdminPanelOnIntent\(key\)\}/, 'desktop pointer intent must start first-use module/data loading before the click transition');
assert.match(adminWorkspaceSource, /onPointerDown=\{\(\) => preloadAdminPanelOnIntent\(key\)\}/, 'touch and immediate pointer clicks must start first-use module/data loading before the tab commit');
assert.match(adminWorkspaceSource, /onFocus=\{\(\) => preloadAdminPanelOnIntent\(key\)\}/, 'keyboard focus intent must start first-use module/data loading before the click transition');
assert.match(adminWorkspaceSource, /requestSiteContentDomain\(\{ domain: SITE_CONTENT_DOMAINS\.HOME, useCache: true \}\)/, 'home-management intent must prefetch its PostgreSQL domain while its lazy chunk loads');
assert.match(adminWorkspaceSource, /requestNoticeBoard\(\{ page: 1, useCache: true \}\)/, 'notice-management intent must prefetch the first authoritative board response');
assert.match(adminWorkspaceSource, /requestFaqBoard\(\{ page: 1, categoryId: 'all', useCache: true \}\)/, 'FAQ-management intent must prefetch the first authoritative board response');
assert.match(adminWorkspaceSource, /getAdminRentalRequests\('', \{[\s\S]*tab: 'pending'[\s\S]*page: 1[\s\S]*pageSize: 10/, 'rental-request intent must prefetch the default first administrator page');
assert.match(adminContextAssemblerSource, /adminRequestsPrerequisitesReady:\s*Boolean\(sourceValues\.isAdminAuthenticated\)[\s\S]*sourceValues\.currentAuthRoleReady[\s\S]*!sourceValues\.currentAuthRoleErrorMessage/, 'administrator rental-request readiness must use Clerk/PostgreSQL administrator authority');
assert.doesNotMatch(adminContextAssemblerSource, /adminRequestsPrerequisitesReady:[\s\S]{0,220}(?:firebaseAuthReady|firebaseAuthUser)/, 'administrator rental-request readiness must not wait for retired Firebase authentication state');
assert.match(appDynamicContextValuesSource, /adminRequestsPrerequisitesReady:\s*Boolean\(sourceValues\.isAdminAuthenticated\)[\s\S]*sourceValues\.currentAuthRoleReady[\s\S]*!sourceValues\.currentAuthRoleErrorMessage/, 'legacy context assembly must preserve the Clerk/PostgreSQL administrator readiness contract');
assert.doesNotMatch(appDynamicContextValuesSource, /adminRequestsPrerequisitesReady:[\s\S]{0,220}(?:firebaseAuthReady|firebaseAuthUser)/, 'legacy context assembly must not reintroduce the retired Firebase administrator readiness gate');
assert.equal(adminWorkspaceSource.includes('관리 메뉴를 불러오는 중입니다.'), false, 'administrator menu must never render the old first-load explanatory placeholder');
assert.equal(adminWorkspaceSource.includes('선택한 관리 기능의 코드를 처음 한 번만 불러옵니다.'), false, 'administrator menu must not expose code-loading copy');
assert.match(adminNavigationSource, /startTransition\(\(\) => \{[\s\S]*setAdminTab\(nextTab\);[\s\S]*\}\);/, 'administrator tab commits must use a transition so the previous panel stays visible while a first-use chunk downloads');
assert.match(contextSliceSource, /accountSecurity:[^\n]*rebaseAdminAuthenticatedSession[^\n]*setSystemAdminSettings[^\n]*setUserSessionPolicy/, 'account-security panel context must receive authoritative policy state setters and current-session rebasing');
assert.match(adminAppSource, /setSystemAdminSettings,[\s\S]*setUserSessionPolicy,[\s\S]*rebaseAdminAuthenticatedSession,[\s\S]*userSessionPolicy,/, 'administrator root must expose policy setters to the account-security panel');
assert.match(adminAccountSecuritySource, /adminWriteResult\?\.systemConfiguration\?\.payload/, 'administrator security save must consume the authoritative PostgreSQL response payload');
assert.match(adminAccountSecuritySource, /rebaseAdminAuthenticatedSession\(savedAdminPolicy\);[\s\S]*setSystemAdminSettings\(savedAdminPolicy\);[\s\S]*setAdminDraft\(savedAdminPolicy\);/, 'administrator policy save must rebase the current session and update visible administrator state immediately');
assert.match(adminAccountSecuritySource, /setUserSessionPolicy\(savedUserPolicy\);[\s\S]*setUserDraft\(savedUserPolicy\);/, 'user session policy save must update visible administrator state immediately');
assert.match(adminAuthSource, /const rebaseAdminAuthenticatedSession = useCallback\(/, 'administrator auth state must support rebasing the current owner session onto the just-saved security policy');
assert.match(appRoutesSource, /currentSurface === APP_SURFACE\.ADMIN && nextView !== 'admin'/, 'background user navigation must be blocked inside the administrator document');
assert.match(appRoutesSource, /currentSurface === APP_SURFACE\.USER && nextView === 'admin'/, 'user-to-admin navigation must perform a cross-document navigation');
assert.match(userSessionSource, /runtimeSurface !== 'user'/, 'user session lifecycle effects must be disabled on the administrator document');
assert.match(membershipSource, /runtimeSurface !== 'user'/, 'user membership lifecycle effects must be disabled on the administrator document');
assert.match(identitySource, /runtimeSurface === 'admin'/, 'identity bootstrap must use the administrator Clerk session only on the administrator document');
assert.match(identitySource, /runtimeSurface === 'user'/, 'identity bootstrap must use the user Clerk session only on the user document');

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const collectSourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  if (entry.isDirectory()) return collectSourceFiles(entryPath);
  return /\.(?:js|jsx)$/.test(entry.name) ? [entryPath] : [];
});
const sourceFileTexts = collectSourceFiles(sourceRoot).map((file) => ({
  file,
  source: fs.readFileSync(file, 'utf8'),
}));
const forbiddenDatabaseSuccessWording = sourceFileTexts.flatMap(({ file, source }) => {
  const matches = source.match(/(?:DB 저장 성공|DB 상태 변경 성공|DB 삭제 성공|Clerk\/DB 저장 성공|Clerk 계정\/DB 등록 성공|PostgreSQL에 저장되었습니다)/g) || [];
  return matches.map((match) => `${path.relative(sourceRoot, file).replaceAll('\\', '/')}:${match}`);
});
assert.deepEqual(forbiddenDatabaseSuccessWording, [], 'successful mutation toasts must describe the service change as successfully saved/applied instead of exposing DB/PostgreSQL implementation wording');
const saveFailurePhrases = ['저장에 실패했습니다.', '저장하지 못했습니다.', '등록에 실패했습니다.', '수정에 실패했습니다.', '삭제에 실패했습니다.'];
const saveFailureCodeViolations = [];
for (const { file, source } of sourceFileTexts) {
  for (const phrase of saveFailurePhrases) {
    let offset = 0;
    while ((offset = source.indexOf(phrase, offset)) >= 0) {
      const before = source.slice(Math.max(0, offset - 120), offset);
      const after = source.slice(offset, Math.min(source.length, offset + 600));
      const delegatedPostgresAssetError = /showPostgresAssetError\([^)]*$/.test(before);
      if (!after.includes('오류 코드:') && !delegatedPostgresAssetError) {
        saveFailureCodeViolations.push(`${path.relative(sourceRoot, file).replaceAll('\\', '/')}:${source.slice(0, offset).split('\n').length}:${phrase}`);
      }
      offset += phrase.length;
    }
  }
}
assert.deepEqual(saveFailureCodeViolations, [], `save/register/edit/delete failure toasts must expose an error code: ${saveFailureCodeViolations.join(', ')}`);
const resolveLocalImport = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
};

const collectLocalImportGraph = (entryFile) => {
  const pending = [entryFile];
  const visited = new Set();
  const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  while (pending.length > 0) {
    const currentFile = pending.pop();
    if (!currentFile || visited.has(currentFile)) continue;
    visited.add(currentFile);
    const source = fs.readFileSync(currentFile, 'utf8');
    let match;
    while ((match = importPattern.exec(source))) {
      const resolved = resolveLocalImport(currentFile, match[1]);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  return [...visited].map((file) => path.relative(sourceRoot, file).replaceAll('\\', '/'));
};

const collectLocalStaticImportGraph = (entryFile) => {
  const pending = [entryFile];
  const visited = new Set();
  const importPattern = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)['"]([^'"]+)['"]/g;
  while (pending.length > 0) {
    const currentFile = pending.pop();
    if (!currentFile || visited.has(currentFile)) continue;
    visited.add(currentFile);
    const source = fs.readFileSync(currentFile, 'utf8');
    let match;
    while ((match = importPattern.exec(source))) {
      const resolved = resolveLocalImport(currentFile, match[1]);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }
  return [...visited].map((file) => path.relative(sourceRoot, file).replaceAll('\\', '/'));
};

const userImportGraph = collectLocalImportGraph(fileURLToPath(new URL('../../src/user-main.jsx', import.meta.url)));
const adminImportGraph = collectLocalImportGraph(fileURLToPath(new URL('../../src/admin-main.jsx', import.meta.url)));
const userStaticImportGraph = collectLocalStaticImportGraph(fileURLToPath(new URL('../../src/user-main.jsx', import.meta.url)));
const userForbiddenImports = userImportGraph.filter((file) =>
  file === 'admin/AdminApp.jsx' ||
  file === 'admin/AdminShell.jsx'
);
const adminForbiddenImports = adminImportGraph.filter((file) =>
  file === 'App.jsx' ||
  file === 'UserApp.jsx' ||
  file === 'shell/AppShell.jsx' ||
  file.startsWith('user/') ||
  /(^|\/)useUser(?:Login|Signup|AuthenticationSession|MembershipStatus|MyPageAccount|RentalRequest|RequestHistoryAction|AccountRecovery)Controller\.(?:js|jsx)$/.test(file)
);
assert.deepEqual(userForbiddenImports, [], `user import graph must not reach the physically separated administrator application root/shell: ${userForbiddenImports.join(', ')}`);
assert.deepEqual(adminForbiddenImports, [], `administrator import graph must not reach user application/lifecycle modules: ${adminForbiddenImports.join(', ')}`);
assert.equal(userStaticImportGraph.includes('UserApp.jsx'), false, 'initial user entry static graph must stop before the full UserApp lazy chunk');
assert.equal(userStaticImportGraph.includes('user/UserShell.jsx'), false, 'initial user entry static graph must not pull UserShell before first paint');
assert.ok(userStaticImportGraph.includes('user/userHomeBootstrapService.js'), 'initial user entry static graph must contain the lightweight home bootstrap service');
assert.equal(userImportGraph.includes('App.jsx'), false, 'user import graph must not fall back to the shared legacy App root');
assert.equal(userImportGraph.includes('shell/AppShell.jsx'), false, 'user import graph must not fall back to the shared legacy AppShell');
assert.equal(userImportGraph.some((file) => file.startsWith('admin/')), false, 'user import graph must not contain administrator source modules');
assert.ok(adminImportGraph.includes('admin/AdminApp.jsx'), 'administrator import graph must include AdminApp');


const diagnosticsSource = fs.readFileSync(new URL('../../src/clerk/ClerkStagingDiagnostics.jsx', import.meta.url), 'utf8');
const adminSettingsSource = fs.readFileSync(new URL('../../src/admin/AdminSettingsPanel.jsx', import.meta.url), 'utf8');
const adminSystemSettingsControllerSource = fs.readFileSync(new URL('../../src/features/settings/useAdminSystemSettingsController.js', import.meta.url), 'utf8');
const signupPolicyActionsSource = fs.readFileSync(new URL('../../src/features/members/useAdminSignupPolicyActions.js', import.meta.url), 'utf8');
const adminAccountSecurityAuditSource = fs.readFileSync(new URL('../../src/admin/AdminAccountSecurityPanel.jsx', import.meta.url), 'utf8');
const clerkStagingClientSource = fs.readFileSync(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8');
const memberDirectorySaveActionsSource = fs.readFileSync(new URL('../../src/features/members/useAdminMemberDirectorySaveActions.js', import.meta.url), 'utf8');
const userMyPageSource = fs.readFileSync(new URL('../../src/user/UserMyPagePanel.jsx', import.meta.url), 'utf8');
const packageSource = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
assert.equal(diagnosticsSource.includes('Firebase runtime:'), false, 'staging diagnostics must not expose retired-provider runtime tags');
assert.equal(diagnosticsSource.includes('External Firebase SDK/network'), false, 'staging diagnostics must not expose retired-provider SDK tags');
assert.equal(diagnosticsSource.includes('Legacy Firestore sync controls'), false, 'staging diagnostics must not expose retired-provider sync tags');
assert.equal(adminSettingsSource.includes('phase34-firebase-free-runtime'), false, 'system info version tag must use current Clerk/PostgreSQL authority naming');
assert.equal(adminSettingsSource.includes('title="\uc678\ubd80 Firebase runtime"'), false, 'system info must not render obsolete provider status cards');
assert.match(adminSettingsSource, /getAdminSystemSettingsAudit\(50\)/, 'system settings history must load from the administrator PostgreSQL audit API');
assert.match(adminSettingsSource, /appendAdminSystemSettingsAudit\(audit\)/, 'system settings saves must append PostgreSQL audit entries instead of using the old skipped stub');
assert.equal(adminSettingsSource.includes("Object.freeze({ skipped: true, source: 'postgresql-runtime' })"), false, 'system settings history must not remain a no-op stub');
assert.match(adminSettingsSource, /사이트 기본 설정, 홈 화면 기본 설정, 서비스 운영, 대여 정책, 휴일 관리, 회원가입 정책, 계정 보안 설정/, 'system settings audit UI must describe the actual expanded audit scope');
assert.match(adminSystemSettingsControllerSource, /appendAdminSystemSettingsAudit\([\s\S]*rental-policy-settings-update/, 'rental policy saves must append the PostgreSQL system settings audit');
assert.match(adminSystemSettingsControllerSource, /holiday-settings-update/, 'holiday saves must append the PostgreSQL system settings audit');
assert.match(signupPolicyActionsSource, /appendAdminSystemSettingsAudit\([\s\S]*signup-policy-settings-update/, 'signup policy saves must append the PostgreSQL system settings audit');
assert.match(adminAccountSecurityAuditSource, /appendAdminSystemSettingsAudit\([\s\S]*account-security-settings-update/, 'account security saves must append the PostgreSQL system settings audit');
assert.match(clerkStagingClientSource, /member_directory_sync_payload_invalid/, 'member-directory sync response contract failures must expose a stable error code instead of the generic Error name');
assert.match(clerkStagingClientSource, /async signOut\(options = undefined\)[\s\S]*clerk\.signOut\(options\)/, 'Clerk wrapper must forward an explicit administrator sign-out redirect option when supplied');

assert.doesNotMatch(clerkStagingClientSource, /requestMemberShadowStatus|requestMemberShadowSync|requestMemberShadowComparison|syncMemberShadow|compareMemberShadow|getMemberShadow/, 'frontend Clerk client must not expose retired member shadow APIs after canonical consolidation');
assert.doesNotMatch(clerkStagingClientSource, /requestRentalRequestShadowSync|requestRentalRequestShadowComparison|syncRentalRequestShadow|compareRentalRequestShadow/, 'frontend Clerk client must not expose retired rental-request shadow APIs after canonical consolidation');
assert.match(clerkStagingClientSource, /payload\?\.readCandidate\?\.source !== 'postgresql-authoritative'/, 'member profile read candidate must require the canonical PostgreSQL authority source');

assert.match(memberDirectorySaveActionsSource, /syncAdminMemberDirectory\(\{[\s\S]*entries: directoryEntries[\s\S]*version: nextSettings\.memberDirectoryVersion[\s\S]*teams: nextTeams[\s\S]*settings: nextSettings/, 'department/user saves must synchronize the directory and organization configuration through one authoritative PostgreSQL mutation');
assert.equal(memberDirectorySaveActionsSource.includes('patchPolicyContentDomainInPostgresql'), false, 'department/user saves must not perform a second browser-side rental-config write after directory synchronization');
assert.equal(memberDirectorySaveActionsSource.includes('requestPolicyContentDomain'), false, 'department/user saves must not require a browser-side rental-config read before synchronization');
assert.equal(memberDirectorySaveActionsSource.includes('replacePolicyContentDomainInPostgresql'), false, 'department/user saves must not replace the complete rental-config domain');
assert.match(memberDirectorySaveActionsSource, /부서·사용자 명부가 성공적으로 저장 및 반영되었습니다/, 'successful department/user saves must use the service-oriented saved/applied wording');
assert.match(memberDirectorySaveActionsSource, /부서·사용자 PostgreSQL 저장에 실패했습니다\.[\s\S]*오류 코드:/, 'failed department/user saves must retain PostgreSQL failure wording and expose an error code');
assert.equal(userMyPageSource.includes('Firebase Auth \ub85c\uadf8\uc778 \uc774\uba54\uc77c'), false, 'my-page login email labels must use current Clerk naming');
assert.equal(packageSource.includes('audit:firestore'), false, 'current package scripts must use external-runtime audit naming');

const signupTermsManagerSource = fs.readFileSync(new URL('../../src/admin/AdminSignupTermsManager.jsx', import.meta.url), 'utf8');
const richTextEditorSource = fs.readFileSync(new URL('../../src/components/RichTextEditor.jsx', import.meta.url), 'utf8');
const adminDialogsSource = fs.readFileSync(new URL('../../src/admin/AdminDialogs.jsx', import.meta.url), 'utf8');
const userDialogsSource = fs.readFileSync(new URL('../../src/user/UserDialogs.jsx', import.meta.url), 'utf8');
const appDialogsSource = fs.readFileSync(new URL('../../src/dialogs/AppDialogs.jsx', import.meta.url), 'utf8');
const modalPortalSource = fs.readFileSync(new URL('../../src/components/ModalPortal.jsx', import.meta.url), 'utf8');
assert.match(userDialogsSource, /whitespace-pre-line[^>]*>\{toast\.message\}<\/span>/, 'user toast renderer must preserve requested line breaks');
assert.match(appDialogsSource, /whitespace-pre-line[^>]*>\{toast\.message\}<\/span>/, 'shared toast renderer must preserve requested line breaks');
assert.match(adminDialogsSource, /whitespace-pre-line[^>]*>\{toast\.message\}<\/span>/, 'administrator toast renderer must preserve line breaks consistently');
const boardPostControllerSource = fs.readFileSync(new URL('../../src/features/boards/useAdminBoardPostController.js', import.meta.url), 'utf8');
const popupPostControllerSource = fs.readFileSync(new URL('../../src/features/boards/useAdminPopupPostController.js', import.meta.url), 'utf8');
const footerControllerSource = fs.readFileSync(new URL('../../src/features/boards/useAdminFooterContentController.js', import.meta.url), 'utf8');
const footerPanelSource = fs.readFileSync(new URL('../../src/admin/AdminFooterPanel.jsx', import.meta.url), 'utf8');
const homeBannerPanelSource = fs.readFileSync(new URL('../../src/admin/AdminHomeBannerPanel.jsx', import.meta.url), 'utf8');
const homeManagementPanelSource = fs.readFileSync(new URL('../../src/admin/AdminHomeManagementPanel.jsx', import.meta.url), 'utf8');
const siteContentCutoverSource = fs.readFileSync(new URL('../../src/features/content/siteContentCutover.js', import.meta.url), 'utf8');
const boardContentCutoverSource = fs.readFileSync(new URL('../../src/features/boards/boardContentCutover.js', import.meta.url), 'utf8');
const siteContentRefreshRevisionSource = fs.readFileSync(new URL('../../src/features/content/useSiteContentRefreshRevision.js', import.meta.url), 'utf8');
const userFooterSource = fs.readFileSync(new URL('../../src/user/UserFooter.jsx', import.meta.url), 'utf8');
const popupFooterControllerSource = fs.readFileSync(new URL('../../src/features/boards/usePopupFooterContentSubscriptionController.js', import.meta.url), 'utf8');
const adminSiteContentCatalogSource = fs.readFileSync(new URL('../../src/features/boards/adminSiteContentCatalogService.js', import.meta.url), 'utf8');
const adminPopupPanelSource = fs.readFileSync(new URL('../../src/admin/AdminPopupPanel.jsx', import.meta.url), 'utf8');
const rentalDataSubscriptionSource = fs.readFileSync(new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url), 'utf8');
const adminAssetCategoriesPanelSource = fs.readFileSync(new URL('../../src/admin/AdminAssetCategoriesPanel.jsx', import.meta.url), 'utf8');
const modalScrollFiles = [
  '../../src/admin/AdminDialogs.jsx',
  '../../src/admin/AdminFooterPanel.jsx',
  '../../src/admin/AdminHomeBannerPanel.jsx',
  '../../src/admin/AdminHolidayManagementPanel.jsx',
  '../../src/admin/AdminMemberAccountEditDialog.jsx',
  '../../src/admin/AdminMemberTermsDialog.jsx',
  '../../src/admin/AdminRequestDialogs.jsx',
  '../../src/admin/AdminSignupTermsManager.jsx',
  '../../src/components/TermsContentDialog.jsx',
  '../../src/components/TermsVersionDialog.jsx',
  '../../src/dialogs/AppDialogs.jsx',
  '../../src/user/UserDialogs.jsx',
  '../../src/user/UserPopupLayer.jsx',
];

assert.match(signupTermsManagerSource, /patchPolicyContentDomainInPostgresql/, 'signup terms manager must save changed terms through the PostgreSQL partial content endpoint');
assert.equal(signupTermsManagerSource.includes('replacePolicyContentDomainInPostgresql'), false, 'signup terms edits must not resend the complete terms domain and historical version set');
assert.match(richTextEditorSource, /const resolvedMaxHeight = maxHeight \?\? minHeight;/, 'rich text editor must constrain the visual/source editor to an internal scroll height');
assert.equal((richTextEditorSource.match(/maxHeight: resolvedMaxHeight/g) || []).length, 2, 'both source-mode and visual rich-text bodies must use the same internal max height');
assert.match(richTextEditorSource, /mk-rich-text-scroll[^"]*overflow-y-auto/, 'rich text editor bodies must scroll internally instead of growing the surrounding modal');
for (const [name, source] of [['admin', adminDialogsSource], ['user', userDialogsSource], ['compatibility', appDialogsSource]]) {
  assert.match(source, /fixed top-6 right-6 z-\[220\]/, `${name} toast must render above every modal/backdrop layer`);
  assert.match(source, /confirmModal && \([\s\S]*?fixed inset-0 z-\[200\]/, `${name} confirm dialog must render above editor popup layers while remaining below toast`);
}
assert.match(modalPortalSource, /createPortal\(backdrop, document\.body\)/, 'popup modals must portal to document.body so viewport backdrops are not clipped by panel/card ancestors');
assert.match(modalPortalSource, /documentElement\.style\.overflow = 'hidden'/, 'modal portal must lock root document scrolling while a popup is open');
assert.match(modalPortalSource, /body\.style\.overflow = 'hidden'/, 'modal portal must lock body scrolling while a popup is open');
assert.match(modalPortalSource, /modalScrollLockCount/, 'modal scroll lock must support nested popup/confirm layers without unlocking the document early');
assert.match(footerControllerSource, /patchSiteContentDomainInPostgresql/, 'footer management must use PostgreSQL document-level patches');
assert.equal(footerControllerSource.includes('replaceSiteContentDomainInPostgresql'), false, 'footer management must not resend the complete footer domain on ordinary saves');
assert.match(footerControllerSource, /저장되지 않은 푸터 페이지 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'footer rich-text editor must confirm before discarding unsaved changes');
assert.match(boardPostControllerSource, /저장되지 않은 공지사항 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'notice rich-text editor must confirm before discarding unsaved changes');
assert.match(boardPostControllerSource, /저장되지 않은 FAQ 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'FAQ rich-text editor must confirm before discarding unsaved changes');
assert.match(popupPostControllerSource, /저장되지 않은 팝업 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'popup rich-text editor must confirm before discarding unsaved changes');
assert.match(signupTermsManagerSource, /저장되지 않은 이용약관 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'signup-terms rich-text editor must confirm before discarding unsaved changes');
assert.match(homeBannerPanelSource, /저장되지 않은 배너 변경사항이 있습니다\. 저장하지 않고 닫으시겠습니까\?/, 'home banner editor must use the shared custom confirm layer before discarding unsaved changes');
assert.equal(homeBannerPanelSource.includes("window.confirm('저장하지 않은 배너 변경사항을 취소하시겠습니까?')"), false, 'home banner editor must not fall back to the browser-native confirm dialog');
assert.match(footerControllerSource, /sanitizeRichTextHtml/, 'footer page dialog normalization must import the rich-text sanitizer instead of throwing before the dialog opens');
assert.match(footerControllerSource, /addressId: String\(sourcePage\?\.addressId \|\| ''\)/, 'legacy footer pages must require an explicit address ID on their next content-page edit after targeted content hydration');
assert.match(siteContentCutoverSource, /addressClaims/, 'site-content PostgreSQL partial patches must carry footer address uniqueness claims');
assert.match(siteContentCutoverSource, /cached\?\.promise && \(cached\.pending \|\| cached\.expiresAt > nowMillis\)/, 'site-content cache must always share an in-flight domain request even when a slow request exceeds the short resolved-result TTL');
assert.match(siteContentCutoverSource, /cacheEntry\.expiresAt = Date\.now\(\) \+ DOMAIN_CACHE_TTL_MS/, 'site-content cache TTL must begin after a successful response instead of at request start');
assert.equal(siteContentCutoverSource.startsWith("import { clerkStagingClient }"), false, 'public site-content reads must not synchronously pull the large Clerk client into the critical home warmup chunk');
assert.match(siteContentCutoverSource, /await import\('\.\.\/\.\.\/clerk\/clerkStagingClient\.js'\)/, 'administrator site-content writes must lazy-load Clerk only when an authenticated mutation needs it');
assert.equal(boardContentCutoverSource.includes("import { clerkStagingClient } from '../../clerk/clerkStagingClient.js'"), false, 'public notice warmup must not synchronously pull Clerk into the user entry chunk');
assert.match(boardContentCutoverSource, /await import\('\.\.\/\.\.\/clerk\/clerkStagingClient\.js'\)/, 'administrator board mutations must lazy-load Clerk on demand');
assert.match(boardSubscriptionControllerSource, /shouldLoadUserHomeNotice[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame\(loadNotice\)/, 'home notice read must be deferred until after the first paint');
assert.match(popupFooterControllerSource, /scheduleAfterUserFirstPaint/, 'noncritical user popup/footer reads must be deferred until after the first paint');
assert.match(popupFooterControllerSource, /shouldLoadUserPopup && !shouldLoadAdminPopup[\s\S]*scheduleAfterUserFirstPaint/, 'user popup reads must not compete with critical home bootstrap requests');
assert.match(popupFooterControllerSource, /shouldLoadUserFooter[\s\S]*scheduleAfterUserFirstPaint/, 'user footer reads must not compete with critical home bootstrap requests');
assert.match(siteContentRefreshRevisionSource, /window\.addEventListener\('blur', markAway\)/, 'site-content return refresh must record a real window-away state');
assert.match(siteContentRefreshRevisionSource, /if \(!wasAway \|\| document\.visibilityState === 'hidden'\) return;/, 'site-content return refresh must not read PostgreSQL again on ordinary focus events without a prior away state');
assert.match(userFooterSource, /openFooterPage\(page\.addressId \|\| page\.id\)/, 'footer navigation must prefer the administrator-defined public address ID');
assert.match(userFooterSource, /const legacyRouteId = publicAddressId \? '' : String\(page\.id \|\| ''\)\.trim\(\)/, 'converted footer pages must stop treating the old internal ID as their active public route');
assert.match(popupFooterControllerSource, /page\.addressId/, 'footer route resolution must resolve PostgreSQL pages by public address ID before legacy internal ID');
assert.match(popupFooterControllerSource, /!String\(page\.addressId \|\| ''\)\.trim\(\) && page\.id === selectedFooterPageId/, 'legacy internal-ID routing must remain only for footer pages that have not yet been converted to an administrator address ID');
assert.match(footerControllerSource, /upserts:\s*\[\s*createFooterConfigDocument/, 'footer common-info save must patch only the config document');
assert.match(footerControllerSource, /deletes:\s*\[`footerPages\/\$\{page\.id\}`\]/, 'footer page deletion must delete only the targeted PostgreSQL content document');
assert.match(footerControllerSource, /normalizeFooterPageAddressId/, 'footer content pages must normalize an administrator-defined public address ID');
assert.match(footerControllerSource, /isValidFooterPageAddressId/, 'footer content page address IDs must be validated before PostgreSQL writes');
assert.match(footerControllerSource, /\[a-z0-9_-\]/, 'footer public address IDs must allow underscores in addition to lowercase letters, digits, and hyphens');
assert.ok(footerPanelSource.includes('md:grid-cols-[minmax(0,4fr)_minmax(180px,1fr)]'), 'footer title and bold-title control must use the compact 4:1 row on non-mobile viewports');
assert.ok(footerPanelSource.includes('border-t border-slate-100 pt-5 sm:flex-row sm:justify-end'), 'footer modal actions must retain the shared editor action-row styling inside the padded modal body');
assert.ok(footerPanelSource.includes('max-h-[94vh] w-full max-w-5xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl'), 'footer editor modal must use the same neutral shell styling as the popup editor');
assert.equal(footerPanelSource.includes('border-orange-200 bg-white'), false, 'footer editor modal chrome must not use the old orange/yellow shell styling');
assert.equal(footerPanelSource.includes('border-orange-100 bg-orange-50'), false, 'footer editor modal header must not use the old orange/yellow header styling');
assert.ok(footerPanelSource.includes('border-orange-300 bg-orange-50 ring-1 ring-orange-200'), 'footer title-display selection cards must retain a visible orange selected state inside the otherwise neutral modal shell');
assert.equal(footerPanelSource.includes('text-orange-600 focus:ring-orange-500'), false, 'footer editor modal checkbox styling must not introduce a footer-only orange accent');
assert.ok(homeBannerPanelSource.includes('max-h-[94vh] w-full max-w-5xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl'), 'home banner editor modal must use the same neutral shell styling as the popup editor');
assert.equal(homeBannerPanelSource.includes('border-orange-100 bg-orange-50'), false, 'home banner editor modal header must not use the old orange/yellow header styling');
assert.match(popupFooterControllerSource, /preloadAdminPopupCatalog\(\{ force: !isInitialLoad \}\)/, 'administrator popup management must use the lightweight PostgreSQL catalog instead of the public full-content domain');
assert.match(popupFooterControllerSource, /preloadAdminFooterCatalog\(\{ force: !isInitialLoad \}\)/, 'administrator footer management must use the lightweight PostgreSQL catalog instead of the public full-content domain');
assert.equal((popupFooterControllerSource.match(/requestSiteContentDomain\(\{[\s\S]*?domain: SITE_CONTENT_DOMAINS\.FOOTER[\s\S]*?\}\)/g) || []).length, 1, 'the full footer-domain request must remain only for the user runtime where footer content is rendered');
assert.match(adminSiteContentCatalogSource, /ADMIN_CATALOG_CACHE_TTL_MS = 60_000/, 'administrator popup/footer catalogs must share a short-lived in-memory cache');
assert.match(adminSiteContentCatalogSource, /catalogPending/, 'administrator popup/footer catalog reads must share in-flight promises');
assert.match(adminSiteContentCatalogSource, /documentContentPending/, 'administrator popup/footer rich-content reads must share in-flight promises');
assert.match(adminWorkspaceSource, /popupPosts:[\s\S]*preloadData: \(\) => preloadAdminPopupCatalog\(\)/, 'popup management must preload the lightweight catalog on administrator navigation intent');
assert.match(adminWorkspaceSource, /footerManagement:[\s\S]*preloadData: \(\) => preloadAdminFooterCatalog\(\)/, 'footer management must preload the lightweight catalog on administrator navigation intent');
assert.match(popupPostControllerSource, /patchSiteContentDomainInPostgresql/, 'popup saves must use targeted PostgreSQL PATCH mutations');
assert.equal(popupPostControllerSource.includes('replaceSiteContentDomainInPostgresql'), false, 'popup saves must not replace the complete popup domain just to mutate one list item');
assert.match(popupPostControllerSource, /preloadAdminPopupPostContent\(post\)/, 'popup editor/toggle actions must hydrate only the targeted full popup document');
assert.match(footerControllerSource, /preloadAdminFooterPageContent\(page\)/, 'footer editor/toggle actions must hydrate only the targeted full footer page');
assert.match(adminPopupPanelSource, /onPointerEnter=\{\(\) => \{ void preloadAdminPopupPostContent\(post\)/, 'popup edit intent must preload only the selected rich-content document');
assert.match(footerPanelSource, /onPointerEnter=\{\(\) => \{ void preloadAdminFooterPageContent\(page\)/, 'footer edit intent must preload only the selected rich-content document');
assert.match(popupFooterControllerSource, /popupLoadedRevisionRef/, 'popup management must retain successfully loaded data for the current site-content revision');
assert.match(popupFooterControllerSource, /footerLoadedRevisionRef/, 'footer management must retain successfully loaded data for the current site-content revision');
assert.match(popupFooterControllerSource, /popupRefreshRevision = useSiteContentRefreshRevision\(SITE_CONTENT_DOMAINS\.POPUP\)/, 'popup management must track only popup-domain refreshes');
assert.match(popupFooterControllerSource, /footerRefreshRevision = useSiteContentRefreshRevision\(SITE_CONTENT_DOMAINS\.FOOTER\)/, 'footer management must track only footer-domain refreshes');
assert.equal(popupFooterControllerSource.includes('USER_SITE_CONTENT_REFRESH_DOMAINS'), false, 'popup and footer mutations must not share one revision that invalidates the unrelated management screen');
assert.match(popupFooterControllerSource, /if \(!shouldLoadPopup\) return undefined;/, 'popup management must not clear cached rows merely because another administrator tab is active');
assert.match(popupFooterControllerSource, /if \(!shouldLoadFooter\) return undefined;/, 'footer management must not clear cached rows merely because another administrator tab is active');
assert.equal((homeBannerPanelSource.match(/requestSiteContentDomain\(/g) || []).length, 1, 'home banner management must load banners and display config from one home-domain request');
assert.match(homeManagementPanelSource, /const activeBannerPlacement = \['hero', 'promotion', 'quickLink'\]\.includes\(activeTab\)/, 'home management must derive one active banner placement for all banner sub-tabs');
assert.equal((homeManagementPanelSource.match(/<AdminHomeBannerPanel/g) || []).length, 1, 'home banner sub-tabs must reuse one panel instance instead of remounting three separate panel branches');
assert.match(footerControllerSource, /addressClaims:/, 'footer content writes must send authoritative address uniqueness claims to PostgreSQL');
assert.match(siteContentCutoverSource, /globalThis\.crypto\?\.randomUUID\?\.\(\)/, 'site-content ids must be generated independently of any retired external datastore');
assert.match(appRoutesSource, /`\/info\/\$\{encodeURIComponent\(routeId\)\}`/, 'footer content pages must use the administrator-defined /info/:id canonical route');
assert.match(appRoutesSource, /pathname\.startsWith\('\/info\/'\)/, 'footer content routes must resolve under the isolated /info/:id namespace');
assert.doesNotMatch(appRoutesSource, /pathname\.startsWith\('\/footer\/'\)/, 'the superseded /footer/:id candidate route must not remain active');
assert.ok(footerPanelSource.includes('페이지 주소 ID'), 'footer content editor must expose the administrator-defined address ID field');
assert.ok(footerPanelSource.includes('/info/'), 'footer content editor must preview the /info/<addressId> canonical URL');
assert.ok(!footerPanelSource.includes('/footer/'), 'footer content editor must not advertise the superseded /footer/<addressId> route');
assert.ok(footerPanelSource.includes('다른 푸터 페이지와 중복될 수 없습니다.'), 'footer editor must explain address uniqueness');
assert.match(rentalDataSubscriptionSource, /assetCutoverConfig\.readRequested[\s\S]*assetCategories: authoritativeAssetCategoriesRef\.current/, 'rental-config must not regain persistent asset-category authority after PostgreSQL cutover');
assert.match(rentalDataSubscriptionSource, /authoritativeAssetCategoriesRef\.current = categories/, 'PostgreSQL asset catalog categories must become the sole authoritative category snapshot before merged runtime state catches up');
assert.match(adminAppSource, /const assetCategoryCatalogReady = Boolean\([\s\S]*publicCatalogAssetsReady[\s\S]*JSON\.stringify\(data\.assetCategories \|\| \[\]\) === JSON\.stringify\(splitPublicConfig\.assetCategories \|\| \[\]\)/, 'administrator category UI must wait until the merged data snapshot matches the authoritative PostgreSQL catalog');
assert.match(adminAssetCategoriesPanelSource, /PostgreSQL 자산 카테고리를 불러오는 중입니다\./, 'administrator category UI must show one loading state instead of a stale partial category list');
assert.match(adminSettingsSource, /<div className="font-bold">💡 운영 안내<\/div>[\s\S]*<p>이 화면은[\s\S]*<p><b>• 기존 관리 메뉴 유지 항목:<\/b>[\s\S]*<p><b>• 관리 가능 범위:<\/b>/, 'home-management operating guidance must use structural block rows so line breaks render reliably');
assert.equal(adminSettingsSource.includes('&nbsp;&nbsp; <b>• 기존 관리 메뉴 유지 항목:</b>'), false, 'home-management operating guidance must not fake line breaks with non-breaking spaces');

for (const relativePath of modalScrollFiles) {
  const modalSource = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(modalSource, /ModalPortal/, `${relativePath} popup layers must portal to document.body for full viewport backdrop coverage`);
  assert.equal(/<div[^>]*className="fixed inset-0/.test(modalSource), false, `${relativePath} must not render popup backdrops directly inside panel/card DOM ancestry`);
  assert.equal(/overflow-y-auto rounded-2xl/.test(modalSource), false, `${relativePath} must not expose a native outer modal scrollbar against the rounded shell`);
  if (/overflow-y-auto/.test(modalSource)) {
    assert.match(modalSource, /mk-modal-scroll-shell|overflow-hidden/, `${relativePath} scrollable modal shells must preserve rounded corners while retaining wheel/touch scrolling`);
  }
}

console.log('[phase34-runtime-regressions-frontend-smoke] PASS');


const adminSignupTermsManagerOptimizedSource = fs.readFileSync(new URL('../../src/admin/AdminSignupTermsManager.jsx', import.meta.url), 'utf8');
assert.ok(adminSignupTermsManagerOptimizedSource.includes('preloadAdminSignupTermsCatalog'), 'administrator terms manager must use lightweight PostgreSQL catalog');
assert.equal(adminSignupTermsManagerOptimizedSource.includes('requestPolicyContentDomain'), false, 'administrator terms manager must not load the full terms domain on entry');
assert.equal(adminSignupTermsManagerOptimizedSource.includes('termVersions'), false, 'administrator terms manager must not preload historical version bodies');
const accountLifecycleOrderedTermsSource = fs.readFileSync(new URL('../../server/src/accounts/account-lifecycle-service.mjs', import.meta.url), 'utf8');
assert.match(accountLifecycleOrderedTermsSource, /displayOrder: Number\.isFinite/, 'terms reconsent authority must retain displayOrder');
