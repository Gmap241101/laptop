import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

let replacement = null;
const repository = {
  async replaceDomain(input) {
    replacement = input;
    return {
      domain: input.domain,
      source: 'postgresql',
      sourceMode: input.sourceMode,
      documentCount: input.documents.length,
      documents: input.documents,
      synchronized: true,
    };
  },
};
const service = createSiteContentService({ repository });
const result = await service.replaceAdminDomain({
  domain: 'home',
  actorClerkUserId: 'clerk-admin-34',
  documents: [{ key: 'homePage/config', payload: { title: 'Phase 34' } }],
});
assert.equal(replacement.sourceMode, 'postgresql-admin-direct');
assert.equal(replacement.actorClerkUserId, 'clerk-admin-34');
assert.equal(result.source, 'postgresql');
assert.equal(result.documentCount, 1);

const [app, repositorySource, serviceSource] = await Promise.all([
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/content/site-content-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/content/site-content-service.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ["request.method === 'PUT'", 'adminSiteContentDirectMatch', 'adminClerkAuthService.getCurrent', 'replaceAdminDomain', "authority: 'postgresql'", "sourceMode: 'postgresql-admin-direct'"]) {
  assert.ok(app.includes(marker), `backend direct authority marker: ${marker}`);
}
assert.ok(repositorySource.includes("sourceMode = 'postgresql-admin-direct'"));
assert.ok(repositorySource.includes('normalizedSourceMode'));
assert.ok(serviceSource.includes("sourceMode: 'postgresql-admin-direct'"));
console.log('[phase34-admin-content-authority-backend-smoke] PASS (Clerk-admin direct PostgreSQL full-domain replacement)');
