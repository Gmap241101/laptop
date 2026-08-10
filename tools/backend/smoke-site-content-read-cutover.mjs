import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';

const stored = new Map();
const repository = {
  async getDomain(domain) { return stored.get(domain) || null; },
  async replaceDomain({ domain, documents, actorClerkUserId }) {
    const value = { domain, source: 'postgresql', authoritative: false, synchronized: true, sourceMode: 'firestore-write-through', sourceHash: 'hash', syncedAt: '2026-08-10T00:00:00.000Z', documentCount: documents.length, documents, actorClerkUserId };
    stored.set(domain, value);
    return value;
  },
};
const service = createSiteContentService({ repository });
let missing = null;
try { await service.getDomain('home'); } catch (error) { missing = error; }
assert.equal(missing?.code, 'site_content_not_synchronized');
const synced = await service.syncDomain({ domain: 'home', documents: [{ key: 'homePage/config', payload: { heroIntervalSeconds: 7 } }], actorClerkUserId: 'user_admin' });
assert.equal(synced.source, 'postgresql');
assert.equal(synced.documentCount, 1);
assert.equal((await service.getDomain('home')).documents[0].key, 'homePage/config');
let invalid = null;
try { await service.syncDomain({ domain: 'notice', documents: [] }); } catch (error) { invalid = error; }
assert.equal(invalid?.code, 'site_content_domain_invalid');

const appSource = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of [
  '/api/site-content/',
  '/api/admin/site-content/',
  'site_content_admin_identity_mismatch',
  'siteContentService.getDomain',
  'siteContentService.syncDomain',
]) assert.ok(appSource.includes(marker), `missing Phase 24 handler marker: ${marker}`);
const repositorySource = readFileSync('server/src/content/site-content-repository.mjs', 'utf8');
for (const marker of ['pg_advisory_xact_lock', 'DELETE FROM app_site_content_documents', 'app_site_content_syncs', 'firestore-write-through']) assert.ok(repositorySource.includes(marker), `missing Phase 24 repository marker: ${marker}`);
console.log('[site-content-backend-smoke] PASS (PostgreSQL content domain read/sync + admin identity boundary + replacement transaction contract)');
