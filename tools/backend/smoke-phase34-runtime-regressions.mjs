import assert from 'node:assert/strict';
import { createRentalRestrictionService } from '../../server/src/restrictions/rental-restriction-service.mjs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';
import { createSiteContentRepository } from '../../server/src/content/site-content-repository.mjs';
import fs from 'node:fs';

const rentalRestrictionRepository = {
  async findByFirebaseUid() { return null; },
  async findByAppUserId(appUserId) {
    assert.equal(String(appUserId), '55');
    return null;
  },
  async upsert(value) { return value; },
};
const firebaseLinkRepository = {
  async findByFirebaseUid() { return null; },
};
const service = createRentalRestrictionService({
  firebaseLinkRepository,
  rentalRestrictionRepository,
  firestoreRentalRestrictionClient: null,
  firebaseCompatibilityRequired: false,
});
const current = await service.getCurrentForAppUser({ appUserId: 55, legacyMemberKey: 'clerk-native:test' });
assert.equal(current.exists, false);
assert.equal(current.restriction, null);
assert.equal(current.authorityMode, 'postgresql-authoritative');
assert.equal(current.mirrorState, 'retired');
assert.equal(current.appUserId, '55');
assert.equal(current.firebaseUid, 'clerk-native:test');



let currentRentalConfig = {
  domain: 'rental-config',
  source: 'postgresql',
  authoritative: true,
  synchronized: true,
  sourceMode: 'postgresql-admin-direct',
  sourceHash: 'before',
  syncedAt: new Date().toISOString(),
  documentCount: 1,
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: {
      storageVersion: 4,
      assetCategories: ['노트북'],
      settings: { maxRentalDays: 10, holidays: [] },
    },
    enabled: null,
    sortOrder: null,
    sourceUpdatedAt: null,
  }],
};
let replaceArgs = null;
const siteContentService = createSiteContentService({
  repository: {
    async getDomain(domain) {
      assert.equal(domain, 'rental-config');
      return currentRentalConfig;
    },
    async replaceDomain(args) {
      replaceArgs = args;
      currentRentalConfig = {
        ...currentRentalConfig,
        sourceMode: args.sourceMode,
        documents: args.documents,
        documentCount: args.documents.length,
      };
      return currentRentalConfig;
    },
  },
});
const patchedRentalConfig = await siteContentService.patchRentalConfigSettings({
  settingsPatch: { holidays: [{ date: '2026-08-15', enabled: true }] },
  actorClerkUserId: 'clerk-admin-1',
});
assert.equal(replaceArgs.domain, 'rental-config');
assert.equal(replaceArgs.sourceMode, 'postgresql-admin-settings-patch');
assert.equal(replaceArgs.actorClerkUserId, 'clerk-admin-1');
const canonical = patchedRentalConfig.documents.find((document) => document.key === 'rentalSystem/publicConfig');
assert.deepEqual(canonical.payload.assetCategories, ['노트북'], 'settings patch must preserve top-level rental configuration data');
assert.equal(canonical.payload.settings.maxRentalDays, 10, 'holiday patch must preserve other rental policy settings');
assert.deepEqual(canonical.payload.settings.holidays, [{ date: '2026-08-15', enabled: true }]);

const appSource = fs.readFileSync(new URL('../../server/src/app.mjs', import.meta.url), 'utf8');
assert.match(appSource, /PATCH' && url\.pathname === '\/api\/admin\/site-content\/rental-config\/settings'/);
assert.match(appSource, /phase34AdminNavigationHolidayRevision/);



const repositoryState = {
  sync: null,
  documents: [],
};
const fakePool = {
  async connect() {
    return {
      async query(sql, params = []) {
        const text = String(sql);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text.includes('pg_advisory_xact_lock')) {
          return { rowCount: 0, rows: [] };
        }
        if (text.includes('DELETE FROM app_site_content_documents')) {
          repositoryState.documents = [];
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO app_site_content_documents')) {
          repositoryState.documents.push({
            document_key: params[1],
            payload: JSON.parse(params[2]),
            enabled: params[3],
            sort_order: params[4],
            source_updated_at: params[6],
            synced_at: '2026-08-12T09:00:00.000Z',
          });
          return { rowCount: 1, rows: [] };
        }
        if (text.includes('INSERT INTO app_site_content_syncs')) {
          repositoryState.sync = {
            domain: params[0],
            source_hash: params[1],
            document_count: params[2],
            source_mode: params[3],
            synced_at: '2026-08-12T09:00:00.000Z',
          };
          return { rowCount: 1, rows: [] };
        }
        throw new Error(`Unexpected transactional SQL in site content repository smoke: ${text}`);
      },
      release() {},
    };
  },
  async query(sql, params = []) {
    const text = String(sql);
    if (text.includes('FROM app_site_content_syncs')) {
      return repositoryState.sync
        ? { rowCount: 1, rows: [repositoryState.sync] }
        : { rowCount: 0, rows: [] };
    }
    if (text.includes('FROM app_site_content_documents')) {
      return { rowCount: repositoryState.documents.length, rows: repositoryState.documents };
    }
    throw new Error(`Unexpected pool SQL in site content repository smoke: ${text}`);
  },
};
const realRepository = createSiteContentRepository(fakePool);
const realReplaceResult = await realRepository.replaceDomain({
  domain: 'rental-config',
  documents: [{
    key: 'rentalSystem/publicConfig',
    payload: { settings: { maxRentalDays: 12 } },
    enabled: true,
    sortOrder: 0,
    sourceUpdatedAt: '2026-08-12T08:55:00.000Z',
  }],
  actorClerkUserId: 'clerk-admin-repository-smoke',
  sourceMode: 'postgresql-admin-settings-patch',
});
assert.equal(realReplaceResult.source, 'postgresql');
assert.equal(realReplaceResult.documents[0].payload.settings.maxRentalDays, 12);
assert.equal(realReplaceResult.sourceMode, 'postgresql-admin-settings-patch');
const repositorySource = fs.readFileSync(new URL('../../server/src/content/site-content-repository.mjs', import.meta.url), 'utf8');
assert.equal(repositorySource.includes('this.getDomain('), false, 'site-content repository arrow functions must not call this.getDomain');
assert.equal(repositorySource.includes('this.getRentalConfigBootstrapContext('), false, 'site-content repository arrow functions must not call this.getRentalConfigBootstrapContext');


const memberAuthoritySource = fs.readFileSync(new URL('../../server/src/members/member-authority-service.mjs', import.meta.url), 'utf8');
const profileProjectionBlock = memberAuthoritySource.match(/const profileFromAccount = \(account = \{\}, firebaseUid = ''\) => \(\{[\s\S]*?\}\);/)?.[0] || '';
assert.match(profileProjectionBlock, /createdAt:\s*account\.createdAt \|\| null/, 'PostgreSQL member edit response must preserve signup timestamp');
assert.match(profileProjectionBlock, /updatedAt:\s*account\.updatedAt \|\| null/, 'PostgreSQL member edit response must preserve update timestamp');

console.log('[phase34-runtime-regressions-backend-smoke] PASS');
