import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

const stored = new Map();
const repository = {
  async getDomain(domain) { return stored.get(domain) || null; },
  async getRentalConfigBootstrapContext() {
    return { assetCategories: ['노트북'], teams: ['개발팀'], memberDirectoryVersion: 2, memberDirectoryEntryCount: 1, termsPolicy: {} };
  },
  async replaceDomain({ domain, documents, actorClerkUserId, sourceMode = 'postgresql-admin-direct' }) {
    const value = { domain, source: 'postgresql', authoritative: true, synchronized: true, sourceMode, documentCount: documents.length, documents, actorClerkUserId };
    stored.set(domain, value);
    return value;
  },
};
const service = createSiteContentService({ repository });

const rentalConfig = await service.getDomain('rental-config');
assert.equal(rentalConfig.source, 'postgresql');
assert.equal(rentalConfig.documents[0].key, 'rentalSystem/publicConfig');
assert.equal(rentalConfig.sourceMode, 'postgresql-self-heal');

const terms = await service.replaceAdminDomain({
  domain: 'terms',
  documents: [{ key: 'signupTermsPolicy/current', payload: { enabled: true, revision: 2 } }],
  actorClerkUserId: 'user_admin',
});
assert.equal(terms.source, 'postgresql');
assert.equal(terms.sourceMode, 'postgresql-admin-direct');
assert.equal((await service.getDomain('terms')).documentCount, 1);

const migration = readFileSync('server/migrations/026_phase34_rental_config_postgresql_bootstrap.sql', 'utf8');
for (const marker of ["'rental-config'", "'rentalSystem/publicConfig'", "'postgresql-self-heal'", 'phase34_rental_config_postgresql_bootstrap']) {
  assert.ok(migration.includes(marker), `missing Phase 34 rental-config migration marker: ${marker}`);
}
assert.equal(migration.includes('firestore.googleapis.com'), false);

console.log('[policy-terms-backend-smoke] PASS (Phase 34 PostgreSQL rental-config self-heal + terms authority)');
