import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSiteContentService, __siteContentVisibilityTest } from '../../server/src/content/site-content-service.mjs';
import { createRentalConfigBootstrapDocument } from '../../server/src/content/rental-config-bootstrap.mjs';

const stored = new Map();
const bootstrapContext = {
  teams: ['교육팀', '운영팀'],
  memberDirectoryVersion: 7,
  memberDirectoryEntryCount: 2,
};
const repository = {
  async getDomain(domain) { return stored.get(domain) || null; },
  async getRentalConfigBootstrapContext() { return bootstrapContext; },
  async replaceDomain({ domain, documents, actorClerkUserId, sourceMode = 'postgresql-admin-direct' }) {
    const value = {
      domain,
      source: 'postgresql',
      authoritative: true,
      synchronized: true,
      sourceMode,
      sourceHash: 'hash',
      syncedAt: '2026-08-12T00:00:00.000Z',
      documentCount: documents.length,
      documents,
      actorClerkUserId,
    };
    stored.set(domain, value);
    return value;
  },
};
const service = createSiteContentService({ repository });

let missing = null;
try { await service.getDomain('home'); } catch (error) { missing = error; }
assert.equal(missing?.code, 'site_content_not_synchronized');

const rentalConfig = await service.getDomain('rental-config');
assert.equal(rentalConfig.source, 'postgresql');
assert.equal(rentalConfig.sourceMode, 'postgresql-self-heal');
assert.equal(rentalConfig.documentCount, 1);
const canonical = rentalConfig.documents.find((document) => document.key === 'rentalSystem/publicConfig');
assert.ok(canonical, 'rental-config self-heal must create the canonical publicConfig document');
assert.equal(canonical.payload.assetCategories, undefined, 'rental-config bootstrap must not duplicate PostgreSQL asset-category authority');
assert.deepEqual(canonical.payload.teams, ['교육팀', '운영팀']);
assert.equal(canonical.payload.settings.memberDirectoryVersion, 7);
assert.equal(canonical.payload.settings.requireRegisteredMemberForSignup, true);
assert.equal(canonical.payload.settings.signupTermsEnabled, undefined, 'rental-config bootstrap must not duplicate signup-terms authority');
assert.equal(canonical.payload.settings.signupTermsPolicyRevision, undefined, 'rental-config bootstrap must not duplicate signup-terms revisions');

const directBootstrap = createRentalConfigBootstrapDocument({ memberDirectoryEntryCount: 0 });
assert.equal(directBootstrap.key, 'rentalSystem/publicConfig');
assert.equal(directBootstrap.payload.settings.maxRentalDays, 14);
assert.equal(directBootstrap.payload.settings.requireRegisteredMemberForSignup, false);

const synced = await service.replaceAdminDomain({
  domain: 'home',
  documents: [{ key: 'homePage/config', payload: { heroIntervalSeconds: 7 } }],
  actorClerkUserId: 'user_admin',
});
assert.equal(synced.source, 'postgresql');
assert.equal(synced.documentCount, 1);
assert.equal((await service.getDomain('home')).documents[0].key, 'homePage/config');

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

const appSource = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of [
  '/api/site-content/',
  '/api/admin/site-content/',
  'siteContentService.getDomain',
  'siteContentService.replaceAdminDomain',
  'phase34PolicyBootstrapRevision',
]) assert.ok(appSource.includes(marker), `missing Phase 34 site content marker: ${marker}`);
const repositorySource = readFileSync('server/src/content/site-content-repository.mjs', 'utf8');
for (const marker of [
  'getRentalConfigBootstrapContext',
  'rentalSystem/publicConfig',
  'phase34-rental-config-repository-self-heal',
  'postgresql-self-heal',
]) assert.ok(repositorySource.includes(marker), `missing rental-config self-heal marker: ${marker}`);
assert.equal(repositorySource.includes('firestore-server'), false);

const migration = readFileSync('server/migrations/026_phase34_rental_config_postgresql_bootstrap.sql', 'utf8');
for (const marker of [
  "'rental-config'",
  "'rentalSystem/publicConfig'",
  "'postgresql-self-heal'",
  'phase34_rental_config_postgresql_bootstrap',
]) assert.ok(migration.includes(marker), `missing migration 026 marker: ${marker}`);

console.log('[site-content-backend-smoke] PASS (PostgreSQL-only site content + rental-config migration/self-heal + visibility)');
