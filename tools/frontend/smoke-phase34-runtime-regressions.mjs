import assert from 'node:assert/strict';

import { createRentalRequestId, RENTAL_REQUEST_ID_PATTERN } from '../../src/features/requests/rentalRequestId.js';
import { createSiteContentDomainDocument } from '../../src/features/content/siteContentCutover.js';
import { formatUserAccountCreatedAt } from '../../src/features/members/memberAccountPolicy.js';
import { requestAdminRentalConfigSettingsPatch, requestCurrentUserRentalRestriction } from '../../src/clerk/clerkStagingClient.js';
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

const adminRequestsSource = fs.readFileSync(new URL('../../src/features/requests/useAdminRequestsController.js', import.meta.url), 'utf8');
assert.equal(/setInterval\([^\n]*refreshPostgresRequests/.test(adminRequestsSource), false, 'administrator rental-request list must not poll PostgreSQL while the window remains open');
assert.match(adminRequestsSource, /refreshPostgresRequests\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'administrator rental-request list must refresh on entry and actual window return');
assert.equal(/setInterval\([^\n]*refreshPostgresRequests/.test(rentalDataSource), false, 'signed-in user rental requests must not poll PostgreSQL while the window remains open');
assert.equal(/setInterval\([^\n]*refreshPostgresCatalog/.test(rentalDataSource), false, 'rental asset and availability status must not poll PostgreSQL while the window remains open');
assert.match(rentalDataSource, /refreshPostgresRequests\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'signed-in user rental requests must refresh on entry and actual window return');
assert.match(rentalDataSource, /scheduleInitialCatalogRefresh\(\);[\s\S]*window\.addEventListener\('blur', markWindowAway\);[\s\S]*window\.addEventListener\('focus', refreshAfterWindowReturn\)/, 'rental asset and availability status must refresh once after initial scheduling and again only after actual window return');
assert.match(rentalDataSource, /view === 'user'[\s\S]*userTab === 'home'[\s\S]*requestAnimationFrame[\s\S]*requestAnimationFrame\(refreshPostgresCatalog\)/, 'home asset/status fetch must be deferred until after the first paint instead of competing with initial rendering');

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
const renderAppRootSource = fs.readFileSync(new URL('../../src/bootstrap/renderAppRoot.jsx', import.meta.url), 'utf8');
const renderAdminRootSource = fs.readFileSync(new URL('../../src/bootstrap/renderAdminRoot.jsx', import.meta.url), 'utf8');
const userAppSource = fs.readFileSync(new URL('../../src/UserApp.jsx', import.meta.url), 'utf8');
const userShellSource = fs.readFileSync(new URL('../../src/user/UserShell.jsx', import.meta.url), 'utf8');
const userWorkspaceSource = fs.readFileSync(new URL('../../src/user/UserWorkspace.jsx', import.meta.url), 'utf8');
const userNavigationSource = fs.readFileSync(new URL('../../src/routing/useAppNavigationController.js', import.meta.url), 'utf8');
const userHomeSource = fs.readFileSync(new URL('../../src/user/UserHomePanel.jsx', import.meta.url), 'utf8');
const userRuntimeErrorBoundarySource = fs.readFileSync(new URL('../../src/user/UserRuntimeErrorBoundary.jsx', import.meta.url), 'utf8');
const adminAppSource = fs.readFileSync(new URL('../../src/admin/AdminApp.jsx', import.meta.url), 'utf8');
const adminWorkspaceSource = fs.readFileSync(new URL('../../src/admin/AdminWorkspace.jsx', import.meta.url), 'utf8');
const adminAccountSecuritySource = fs.readFileSync(new URL('../../src/admin/AdminAccountSecurityPanel.jsx', import.meta.url), 'utf8');
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
assert.equal(userMainSource.includes('renderAppRoot'), false, 'user entrypoint must no longer fall back to the shared App/AppShell recovery runtime');
assert.match(renderUserRootSource, /import UserApp from '\.\.\/UserApp\.jsx'/, 'user document must mount UserApp directly');
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
assert.match(userShellSource, /const showDataLoadingOverlay = userTab !== 'home' && !firebaseReady;/, 'initial home rendering must not be blurred behind the rental-data readiness overlay');
assert.match(userHomeSource, /loading=\{index === 0 \? 'eager' : 'lazy'\}/, 'only the first hero image should be eager; later hero images must be lazy');
assert.match(userHomeSource, /fetchPriority=\{index === 0 \? 'high' : 'auto'\}/, 'the first hero image should receive high fetch priority');
assert.match(userHomeSource, /const shouldReservePromotionColumn = !bannersReady \|\| promotionBanners\.length > 0;/, 'home layout must reserve the desktop promotion column before PostgreSQL home-content hydration completes');
assert.match(userHomeSource, /promotionRenderSlots = bannersReady[\s\S]*PROMOTION_LAYOUTS\['2x1'\]\.slots/, 'home layout must render deterministic promotion placeholders before banner metadata arrives');
assert.match(userHomeSource, /loading=\{index < 2 \? 'eager' : 'lazy'\}[\s\S]*fetchPriority=\{index < 2 \? 'high' : 'auto'\}/, 'the first visible promotion row must receive eager/high image priority while lower promotion rows remain lazy');
assert.match(userHomeSource, /shouldReservePromotionColumn \? 'lg:grid-cols-2' : 'grid-cols-1'/, 'notice width must not expand to a full desktop row before promotion banners finish loading');
assert.match(userHomeSource, /loading="lazy" decoding="async"/, 'below-the-fold quick-link images must use lazy asynchronous decoding');
assert.equal(adminShellSource.includes('UserWorkspace'), false, 'administrator shell must not contain the user workspace');
assert.equal(adminShellSource.includes('UserFooter'), false, 'administrator shell must not contain the user footer');
assert.equal(adminShellSource.includes('UserPopupLayer'), false, 'administrator shell must not contain the user popup layer');
assert.equal(adminShellSource.includes("React.lazy(() => import('./AdminWorkspace.jsx'))"), false, 'administrator workspace shell must remain eagerly linked so the admin layout appears immediately');
assert.equal(adminShellSource.includes("React.lazy(() => import('./AdminDialogs.jsx'))"), false, 'administrator dialogs must remain eagerly linked into the separate admin document');
assert.match(adminWorkspaceSource, /import AdminDashboardPanelView from '\.\/AdminDashboardPanel\.jsx'/, 'administrator dashboard must be eagerly linked for immediate post-login rendering');
assert.match(adminWorkspaceSource, /const AdminRequestsPanel = memo\(lazy\(\(\) => import\('\.\/AdminRequestsPanel\.jsx'\)\)\)/, 'administrator subpanels must remain lazy-loaded on first use');
assert.match(adminWorkspaceSource, /<Suspense fallback=\{null\}>/, 'administrator lazy panels must use a silent Suspense boundary');
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

const userImportGraph = collectLocalImportGraph(fileURLToPath(new URL('../../src/user-main.jsx', import.meta.url)));
const adminImportGraph = collectLocalImportGraph(fileURLToPath(new URL('../../src/admin-main.jsx', import.meta.url)));
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
assert.ok(userImportGraph.includes('UserApp.jsx'), 'user import graph must include the dedicated UserApp root');
assert.ok(userImportGraph.includes('user/UserShell.jsx'), 'user import graph must include the dedicated UserShell');
assert.equal(userImportGraph.includes('App.jsx'), false, 'user import graph must not fall back to the shared legacy App root');
assert.equal(userImportGraph.includes('shell/AppShell.jsx'), false, 'user import graph must not fall back to the shared legacy AppShell');
assert.equal(userImportGraph.some((file) => file.startsWith('admin/')), false, 'user import graph must not contain administrator source modules');
assert.ok(adminImportGraph.includes('admin/AdminApp.jsx'), 'administrator import graph must include AdminApp');

console.log('[phase34-runtime-regressions-frontend-smoke] PASS');
