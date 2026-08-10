import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

const stored = new Map();
const repository = {
  async getDomain(domain) { return stored.get(domain) || null; },
  async replaceDomain({ domain, documents, actorClerkUserId }) {
    const value = { domain, source: 'postgresql', synchronized: true, authoritative: false, sourceMode: 'firestore-write-through', documentCount: documents.length, documents, actorClerkUserId };
    stored.set(domain, value);
    return value;
  },
};
const service = createSiteContentService({ repository });
for (const domain of ['rental-config', 'terms']) {
  const synced = await service.syncDomain({ domain, documents: [{ key: `${domain}/doc`, payload: { ok: true } }], actorClerkUserId: 'user_admin' });
  assert.equal(synced.source, 'postgresql');
  assert.equal((await service.getDomain(domain)).documentCount, 1);
}
let invalid = null;
try { await service.syncDomain({ domain: 'notice', documents: [] }); } catch (error) { invalid = error; }
assert.equal(invalid?.code, 'site_content_domain_invalid');
const migration = readFileSync('server/migrations/017_phase25_policy_terms_read_cutover.sql', 'utf8');
for (const marker of ["'phase', 25", "'transaction_authority', 'firestore-preserved'", "'terms_consent_state', 'firestore-authoritative'", "'admin_post_login_route', 'stabilized'"]) {
  assert.ok(migration.includes(marker), `missing Phase 25 migration marker: ${marker}`);
}
console.log('[policy-terms-backend-smoke] PASS (rental-config/terms PostgreSQL sync domains + Firestore transaction authority preservation)');
