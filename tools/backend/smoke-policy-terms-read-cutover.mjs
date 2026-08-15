import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

const stored = new Map();
const repository = {
  async getDomain(domain) { return stored.get(domain) || null; },
  async getDocument(domain, key) {
    return (stored.get(domain)?.documents || []).find((document) => document.key === key) || null;
  },
  async getSignupTermContentContext(termId) {
    const documents = stored.get('terms')?.documents || [];
    return {
      policy: documents.find((document) => document.key === 'signupTermsPolicy/current') || null,
      term: documents.find((document) => document.key === `signupTerms/${termId}`) || null,
    };
  },
  async getSignupTermsAdminCatalog() {
    const documents = stored.get('terms')?.documents || [];
    return {
      policy: documents.find((document) => document.key === 'signupTermsPolicy/current') || null,
      terms: documents.filter((document) => document.key.startsWith('signupTerms/')),
    };
  },
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
  documents: [
    {
      key: 'signupTermsPolicy/current',
      payload: {
        enabled: true,
        revision: 2,
        activeTerms: [{ id: 'privacy', title: '개인정보 처리', required: true, version: 3, versionId: 'privacy-v3', contentHash: 'hash-v3', contentHtml: '<p>must-not-be-in-list</p>', contentText: 'must-not-be-in-list' }],
      },
    },
    {
      key: 'signupTerms/privacy',
      enabled: true,
      payload: { id: 'privacy', title: '개인정보 처리', required: true, enabled: true, currentVersion: 3, currentVersionId: 'privacy-v3', contentHash: 'hash-v3', contentHtml: '<p>실제 약관 본문</p>', contentText: '실제 약관 본문' },
    },
  ],
  actorClerkUserId: 'user_admin',
});
assert.equal(terms.source, 'postgresql');
assert.equal(terms.sourceMode, 'postgresql-admin-direct');
assert.equal((await service.getDomain('terms')).documentCount, 2);
const signupTermsPolicy = await service.getSignupTermsPolicy();
assert.equal(signupTermsPolicy.source, 'postgresql');
assert.equal(signupTermsPolicy.key, 'signupTermsPolicy/current');
assert.equal(signupTermsPolicy.payload.revision, 2);
assert.equal(signupTermsPolicy.payload.activeTerms[0].contentHtml, undefined, 'signup terms list payload must not include rich HTML content');
assert.equal(signupTermsPolicy.payload.activeTerms[0].contentText, undefined, 'signup terms list payload must not include rich text fallback');
const signupTermContent = await service.getSignupTermContent('privacy');
assert.equal(signupTermContent.source, 'postgresql');
assert.equal(signupTermContent.term.id, 'privacy');
assert.equal(signupTermContent.term.contentHtml, '<p>실제 약관 본문</p>');
assert.equal(signupTermContent.term.contentHash, 'hash-v3');
const adminTermsCatalog = await service.getAdminSignupTermsCatalog();
assert.equal(adminTermsCatalog.source, 'postgresql');
assert.equal(adminTermsCatalog.terms.length, 1);
assert.equal(adminTermsCatalog.terms[0].contentHtml, '<p>실제 약관 본문</p>');
assert.equal(adminTermsCatalog.policy.activeTerms[0].contentHtml, undefined, 'admin catalog policy must not duplicate rich HTML content');
assert.equal(adminTermsCatalog.policy.activeTerms[0].contentText, undefined, 'admin catalog policy must not duplicate rich text fallback');
const adminTermContent = await service.getAdminSignupTermContent('privacy');
assert.equal(adminTermContent.source, 'postgresql');
assert.equal(adminTermContent.term.contentHtml, '<p>실제 약관 본문</p>');

const repositorySource = readFileSync('server/src/content/site-content-repository.mjs', 'utf8');
assert.match(repositorySource, /document_key LIKE 'signupTerms\/%'/, 'admin terms catalog must select current signup term documents');
assert.equal(repositorySource.includes("document_key LIKE 'signupTermVersions/%'"), false, 'admin terms catalog must not preload historical version documents');
assert.match(repositorySource, /jsonb_array_elements\(COALESCE\(payload->'activeTerms'/, 'admin terms catalog must project duplicate rich policy content at SQL read time');
assert.match(repositorySource, /payload - 'contentHtml' - 'contentText'/, 'admin terms catalog must not transfer full current rich bodies on list load');
assert.match(repositorySource, /contentPreview/, 'admin terms catalog should return only a bounded text preview for the list');

const migration = readFileSync('server/migrations/026_phase34_rental_config_postgresql_bootstrap.sql', 'utf8');
for (const marker of ["'rental-config'", "'rentalSystem/publicConfig'", "'postgresql-self-heal'", 'phase34_rental_config_postgresql_bootstrap']) {
  assert.ok(migration.includes(marker), `missing Phase 34 rental-config migration marker: ${marker}`);
}
assert.equal(migration.includes('firestore.googleapis.com'), false);

console.log('[policy-terms-backend-smoke] PASS (Phase 34 PostgreSQL rental-config self-heal + dedicated signup terms policy authority)');
