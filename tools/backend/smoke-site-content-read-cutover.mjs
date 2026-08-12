import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService, __siteContentVisibilityTest } from '../../server/src/content/site-content-service.mjs';
import { createFirestoreSiteContentClient } from '../../server/src/firestore/firestore-site-content.mjs';


const firestoreDocument = ({ path, fields, updateTime = '2026-08-12T00:00:00.000Z' }) => ({
  document: {
    name: `projects/laptop-system-mk/databases/(default)/documents/${path}`,
    updateTime,
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => {
      if (value === null) return [key, { nullValue: null }];
      if (typeof value === 'boolean') return [key, { booleanValue: value }];
      if (typeof value === 'number') return [key, { integerValue: String(value) }];
      if (value instanceof Date) return [key, { timestampValue: value.toISOString() }];
      return [key, { stringValue: String(value) }];
    })),
  },
});
const firestoreSiteClient = createFirestoreSiteContentClient({
  projectId: 'laptop-system-mk',
  fetchImpl: async (url, options = {}) => {
    if (url.endsWith('/documents/homePage/config')) {
      return new Response(JSON.stringify(firestoreDocument({ path: 'homePage/config', fields: { heroIntervalSeconds: 7, promotionLayout: '2x1' } }).document), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/documents:runQuery') && options.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      if (body?.structuredQuery?.from?.[0]?.collectionId === 'homeBanners') {
        return new Response(JSON.stringify([
          firestoreDocument({ path: 'homeBanners/hero-1', fields: { id: 'hero-1', placement: 'hero', enabled: true, sortOrder: 1, startAt: new Date('2026-08-11T00:00:00.000Z'), isIndefinite: true } }),
          firestoreDocument({ path: 'homeBanners/quick-1', fields: { id: 'quick-1', placement: 'quickLink', enabled: true, sortOrder: 2, startAt: new Date('2026-08-11T00:00:00.000Z'), isIndefinite: true } }),
          firestoreDocument({ path: 'homeBanners/quick-2', fields: { id: 'quick-2', placement: 'quickLink', enabled: true, sortOrder: 3, startAt: new Date('2026-08-11T00:00:00.000Z'), isIndefinite: true } }),
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
});
const fullHomeSource = await firestoreSiteClient.readDomain({ domain: 'home', firebaseIdToken: 'firebase-admin-token' });
assert.equal(fullHomeSource.length, 4);
assert.deepEqual(fullHomeSource.map((item) => item.key), ['homePage/config', 'homeBanners/hero-1', 'homeBanners/quick-1', 'homeBanners/quick-2']);
assert.equal(fullHomeSource.filter((item) => item.payload.placement === 'quickLink').length, 2);
assert.equal(fullHomeSource[1].payload.startAt, '2026-08-11T00:00:00.000Z');

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


const now = Date.parse('2026-08-12T00:00:00.000Z');
for (const [label, startAt] of [
  ['serialized-marker', { __mkType: 'timestamp', millis: now - 60_000 }],
  ['seconds-shape', { seconds: Math.trunc((now - 60_000) / 1000), nanoseconds: 0 }],
  ['underscore-seconds-shape', { _seconds: Math.trunc((now - 60_000) / 1000), _nanoseconds: 0 }],
  ['iso-string', new Date(now - 60_000).toISOString()],
  ['millis-number', now - 60_000],
]) {
  const visibility = __siteContentVisibilityTest.projectTimedVisibility({
    enabled: true,
    payload: { enabled: true, startAt, endAt: null, isIndefinite: true },
  }, now);
  assert.equal(visibility.active, true, `${label} must be active`);
}
const ended = __siteContentVisibilityTest.projectTimedVisibility({
  enabled: true,
  payload: {
    startAt: { __mkType: 'timestamp', millis: now - 120_000 },
    endAt: { __mkType: 'timestamp', millis: now - 60_000 },
    isIndefinite: false,
  },
}, now);
assert.equal(ended.active, false);
assert.equal(ended.reason, 'ended');
const projected = __siteContentVisibilityTest.projectPublicDomain({
  domain: 'home',
  source: 'postgresql',
  documents: [{
    key: 'homeBanners/banner-1',
    payload: { id: 'banner-1', placement: 'hero', startAt: { seconds: Math.trunc((now - 60_000) / 1000) }, isIndefinite: true },
    enabled: true,
    sortOrder: 3,
  }],
}, now);
assert.equal(projected.documents[0].payload.enabled, true);
assert.equal(projected.documents[0].payload.sortOrder, 3);
assert.equal(projected.documents[0].publicVisibility.active, true);
assert.equal(projected.publicProjection.activeTimedDocumentCount, 1);

const appSource = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of [
  '/api/site-content/',
  '/api/admin/site-content/',
  'site_content_admin_identity_mismatch',
  'siteContentService.getDomain',
  'siteContentService.syncDomain',
  'firestoreSiteContentClient.readDomain',
  'firestore-server-backend-full-domain',
]) assert.ok(appSource.includes(marker), `missing Phase 24 handler marker: ${marker}`);
const repositorySource = readFileSync('server/src/content/site-content-repository.mjs', 'utf8');
for (const marker of ['pg_advisory_xact_lock', 'DELETE FROM app_site_content_documents', 'app_site_content_syncs', 'firestore-write-through']) assert.ok(repositorySource.includes(marker), `missing Phase 24 repository marker: ${marker}`);
console.log('[site-content-backend-smoke] PASS (backend Firestore full-domain server source + PostgreSQL replacement + visibility/admin identity contracts)');
