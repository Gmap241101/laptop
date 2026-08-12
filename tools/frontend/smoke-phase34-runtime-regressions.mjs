import assert from 'node:assert/strict';

import { createRentalRequestId, RENTAL_REQUEST_ID_PATTERN } from '../../src/features/requests/rentalRequestId.js';
import { createSiteContentDomainDocument } from '../../src/features/content/siteContentCutover.js';
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
const adminAccountEffectTail = identitySource.match(/setAdminAccountsReady\(false\);[\s\S]*?\}, \[authenticatedAdminId, currentAuthAdminAccount\?\.id\]\);/)?.[0] || '';
assert.ok(adminAccountEffectTail, 'administrator registry refresh must depend on administrator identity only');
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

const appShellSource = fs.readFileSync(new URL('../../src/shell/AppShell.jsx', import.meta.url), 'utf8');
assert.equal(appShellSource.includes('Firebase 원격 DB 기준으로 데이터를 불러오고 있습니다.'), false, 'retired Firebase loading copy must not remain');
assert.equal(appShellSource.includes('PostgreSQL 운영 DB 기준으로 데이터를 불러오고 있습니다.'), true);
const rentalDataSource = fs.readFileSync(new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url), 'utf8');
assert.equal(rentalDataSource.includes('firestore-one-time-fallback'), false, 'asset runtime must not retain Firestore fallback source labels');

console.log('[phase34-runtime-regressions-frontend-smoke] PASS');
