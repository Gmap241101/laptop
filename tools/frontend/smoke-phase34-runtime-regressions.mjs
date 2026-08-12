import assert from 'node:assert/strict';

import { createRentalRequestId, RENTAL_REQUEST_ID_PATTERN } from '../../src/features/requests/rentalRequestId.js';
import { createSiteContentDomainDocument } from '../../src/features/content/siteContentCutover.js';
import { formatUserAccountCreatedAt } from '../../src/features/members/memberAccountPolicy.js';
import { requestAdminRentalConfigSettingsPatch, requestCurrentUserRentalRestriction } from '../../src/clerk/clerkStagingClient.js';
import fs from 'node:fs';

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


const userHtml = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const adminHtml = fs.readFileSync(new URL('../../admin/index.html', import.meta.url), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const userMainSource = fs.readFileSync(new URL('../../src/user-main.jsx', import.meta.url), 'utf8');
const adminMainSource = fs.readFileSync(new URL('../../src/admin-main.jsx', import.meta.url), 'utf8');
const appRoutesSource = fs.readFileSync(new URL('../../src/routing/appRoutes.js', import.meta.url), 'utf8');
const userSessionSource = fs.readFileSync(new URL('../../src/features/auth/useUserAuthenticationSessionController.js', import.meta.url), 'utf8');
const membershipSource = fs.readFileSync(new URL('../../src/features/members/useUserMembershipStatusController.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

assert.match(userHtml, /src="\/src\/user-main\.jsx"/, 'user root must have a dedicated entrypoint');
assert.match(adminHtml, /src="\/src\/admin-main\.jsx"/, 'administrator root must have a dedicated entrypoint');
assert.equal(userHtml.includes('/src/admin-main.jsx'), false, 'user HTML must not bootstrap the administrator entrypoint');
assert.equal(adminHtml.includes('/src/user-main.jsx'), false, 'administrator HTML must not bootstrap the user entrypoint');
assert.equal(vercelConfig.rewrites?.[0]?.source, '/admin', 'Vercel must resolve /admin to the dedicated administrator document before the user SPA fallback');
assert.equal(vercelConfig.rewrites?.[0]?.destination, '/admin/index.html');
assert.match(userMainSource, /clearAdminRouteIntent\(\)/, 'user document must clear stale administrator route intent');
assert.match(adminMainSource, /writeAdminRouteIntent\(\)/, 'administrator document must establish administrator route intent before React mounts');
assert.match(appRoutesSource, /currentSurface === APP_SURFACE\.ADMIN && nextView !== 'admin'/, 'background user navigation must be blocked inside the administrator document');
assert.match(appRoutesSource, /currentSurface === APP_SURFACE\.USER && nextView === 'admin'/, 'user-to-admin navigation must perform a cross-document navigation');
assert.match(userSessionSource, /runtimeSurface !== 'user'/, 'user session lifecycle effects must be disabled on the administrator document');
assert.match(membershipSource, /runtimeSurface !== 'user'/, 'user membership lifecycle effects must be disabled on the administrator document');
assert.match(identitySource, /runtimeSurface === 'admin'/, 'identity bootstrap must use the administrator Clerk session only on the administrator document');
assert.match(identitySource, /runtimeSurface === 'user'/, 'identity bootstrap must use the user Clerk session only on the user document');
assert.match(appSource, /function App\(\{ runtimeSurface = 'user' \}\)/, 'App must receive a fixed document surface from the entrypoint');
assert.match(appSource, /useUserAuthenticationSessionController\(\{[\s\S]*?runtimeSurface,/, 'App must pass the document surface to the user session controller');
assert.match(appSource, /useAdminAuthenticationController\(\{[\s\S]*?runtimeSurface,/, 'App must pass the document surface to the administrator authentication controller');
assert.match(appShellSource, /React\.lazy\(\(\) => import\('\.\.\/admin\/AdminWorkspace\.jsx'\)\)/, 'administrator workspace UI must remain lazy and absent from the initial user UI render path');

console.log('[phase34-runtime-regressions-frontend-smoke] PASS');
