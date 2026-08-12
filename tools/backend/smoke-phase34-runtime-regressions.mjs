import assert from 'node:assert/strict';
import { createRentalRestrictionService } from '../../server/src/restrictions/rental-restriction-service.mjs';
import { createSiteContentService } from '../../server/src/content/site-content-service.mjs';
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

console.log('[phase34-runtime-regressions-backend-smoke] PASS');
