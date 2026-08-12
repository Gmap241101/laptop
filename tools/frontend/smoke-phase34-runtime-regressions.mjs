import assert from 'node:assert/strict';

import { createRentalRequestId, RENTAL_REQUEST_ID_PATTERN } from '../../src/features/requests/rentalRequestId.js';
import { createSiteContentDomainDocument } from '../../src/features/content/siteContentCutover.js';
import { requestCurrentUserRentalRestriction } from '../../src/clerk/clerkStagingClient.js';

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

console.log('[phase34-runtime-regressions-frontend-smoke] PASS');
