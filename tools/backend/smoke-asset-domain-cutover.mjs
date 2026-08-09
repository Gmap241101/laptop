import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssetService } from '../../server/src/assets/asset-service.mjs';
import { createFirestoreAssetClient } from '../../server/src/firestore/firestore-assets.mjs';

const identity = { uid: 'admin-firebase', idToken: 'firebase-admin-token' };
const baseCatalog = {
  categories: ['노트북'],
  assets: [{
    id: 'NB-1', category: '노트북', assetNo: 'A-001', assetNoNormalized: 'a-001', serialNo: 'SN-1',
    model: 'Model 1', manufactureDate: '2026-01-01', photo: '', note: '', baseStatus: '대여가능',
    status: '대여가능', currentRequestId: null, reservations: [],
  }],
  availability: [],
  sync: { assetCount: 1, categoryCount: 1, sourceHash: 'hash', sourceMode: 'test', syncedAt: '2026-08-09T00:00:00Z' },
};

const calls = [];
let catalog = structuredClone(baseCatalog);
const repository = {
  async getCatalog() { return structuredClone(catalog); },
  async bootstrap({ categories, assets, sourceHash }) {
    calls.push(['bootstrap', categories, assets, sourceHash]);
    catalog = { ...structuredClone(baseCatalog), categories: [...categories], assets: assets.map((a) => ({ ...a, status: a.baseStatus || '대여가능', currentRequestId: null, reservations: [] })), sync: { assetCount: assets.length, categoryCount: categories.length, sourceHash, sourceMode: 'firestore-admin-bootstrap', syncedAt: '2026-08-09T00:00:00Z' } };
    return { assetCount: assets.length, categoryCount: categories.length };
  },
  async createAuthoritative(args) { calls.push(['create', args]); await args.beforeCommit({ asset: args.asset, catalog }); return { asset: args.asset, catalog }; },
  async editAuthoritative(args) { calls.push(['edit', args]); const asset = { ...catalog.assets[0], ...args.patch, id: args.assetId }; await args.beforeCommit({ previousAsset: catalog.assets[0], asset, catalog }); return { asset, catalog }; },
  async deleteAuthoritative(args) { calls.push(['delete', args]); await args.beforeCommit({ previousAsset: catalog.assets[0], catalog }); return { deletedAsset: catalog.assets[0], catalog }; },
  async bulkCreateAuthoritative(args) { calls.push(['bulk', args]); await args.beforeCommit({ assets: args.assets, catalog }); return { assets: args.assets, duplicateAssetNumbers: [], invalidCategories: [], catalog }; },
  async saveCategoriesAuthoritative(args) { calls.push(['categories', args]); await args.beforeCommit({ catalog }); return { catalog }; },
};
const mirrorCalls = [];
const firestoreClient = {
  async verifyAdmin() { return { uid: identity.uid, email: 'admin@example.com' }; },
  async listAllAssets() { return [{ name: 'x/NB-1', updateTime: '2026-08-09T00:00:00Z', fields: { id: 'NB-1', category: '노트북', assetNo: 'A-001', serialNo: 'SN-1', model: 'Model 1', manufactureDate: '2026-01-01', photo: '', note: '', status: '대여가능', reservations: [] } }]; },
  async getPublicConfig() { return { fields: { assetCategories: ['노트북'] } }; },
  async getAsset() { return { updateTime: '2026-08-09T00:00:00Z', fields: {} }; },
  async mirrorCreate(args) { mirrorCalls.push(['create', args]); },
  async mirrorEdit(args) { mirrorCalls.push(['edit', args]); },
  async mirrorDelete(args) { mirrorCalls.push(['delete', args]); },
  async mirrorBulkCreate(args) { mirrorCalls.push(['bulk', args]); },
  async mirrorCategories(args) { mirrorCalls.push(['categories', args]); },
};
const service = createAssetService({ repository, firestoreClient });

const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.target, 'postgresql');
assert.equal(bootstrap.assetCount, 1);
assert.equal(bootstrap.catalog.source, 'postgresql');
const publicCatalog = await service.getPublicCatalog();
assert.equal(publicCatalog.synchronized, true);
assert.equal(publicCatalog.metrics.totalAssetCount, 1);

const created = await service.create(identity, { category: '노트북', assetNo: 'A-002', serialNo: 'SN-2', model: 'Model 2' });
assert.equal(created.authority, 'postgresql');
assert.equal(created.firestoreMirror, 'synced');
assert.equal(mirrorCalls.at(-1)[0], 'create');
const edited = await service.edit(identity, 'NB-1', { category: '노트북', assetNo: 'A-001', serialNo: 'SN-X', model: 'Model X' });
assert.equal(edited.authority, 'postgresql');
assert.equal(mirrorCalls.at(-1)[0], 'edit');
const bulk = await service.bulkCreate(identity, [{ category: '노트북', assetNo: 'A-003', model: 'Bulk' }]);
assert.equal(bulk.authority, 'postgresql');
assert.equal(mirrorCalls.at(-1)[0], 'bulk');
const categories = await service.saveCategories(identity, { categories: ['노트북', '태블릿'], renameMap: {} });
assert.equal(categories.authority, 'postgresql');
assert.equal(mirrorCalls.at(-1)[0], 'categories');
const deleted = await service.delete(identity, 'NB-1');
assert.equal(deleted.authority, 'postgresql');
assert.equal(mirrorCalls.at(-1)[0], 'delete');

const [migration, repoSource, serviceSource, firestoreSource, appSource] = await Promise.all([
  readFile(new URL('../../server/migrations/012_phase20_asset_domain_cutover.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/firestore/firestore-assets.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ['app_asset_categories', 'app_rental_assets', 'app_asset_catalog_syncs']) assert.ok(migration.includes(marker), marker);
for (const marker of ['app_rental_asset_reservation_guards', 'pg_advisory_xact_lock', 'createAuthoritative', 'bulkCreateAuthoritative', 'saveCategoriesAuthoritative']) assert.ok(repoSource.includes(marker), marker);
for (const marker of ['getPublicCatalog', 'bootstrap(firebaseIdentity)', "authority: 'postgresql'", "firestoreMirror: 'synced'"]) assert.ok(serviceSource.includes(marker), marker);
for (const marker of ['rentalAssetNumbers', "documentName('publicCatalog/main')", 'assetCategories', 'mirrorBulkCreate', 'mirrorCategories']) assert.ok(firestoreSource.includes(marker), marker);
assert.ok(!firestoreSource.includes("documentName('publicAssetCatalog/main')"), 'server mirror must not use the invalid publicAssetCatalog path');
for (const marker of ['/api/assets/catalog', '/api/admin/assets/bootstrap', '/api/admin/assets/bulk', '/api/admin/assets/categories']) assert.ok(appSource.includes(marker), marker);

const firestoreRequests = [];
const firestoreMirrorClient = createFirestoreAssetClient({
  projectId: 'phase20-test',
  fetchImpl: async (url, options = {}) => {
    firestoreRequests.push({ url: String(url), options });
    if (String(url).includes('/adminAccounts/')) {
      return new Response(JSON.stringify({
        name: 'projects/phase20-test/databases/(default)/documents/adminAccounts/admin-firebase',
        fields: {
          id: { stringValue: 'admin-firebase' },
          authUid: { stringValue: 'admin-firebase' },
          userName: { stringValue: '관리자' },
          adminRole: { stringValue: 'admin' },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).endsWith(':commit')) return new Response(JSON.stringify({ writeResults: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  },
});
await firestoreMirrorClient.mirrorCreate({
  asset: baseCatalog.assets[0], catalog: baseCatalog, admin: { uid: 'admin-firebase' }, firebaseIdToken: 'firebase-admin-token',
});
const mirrorCommit = firestoreRequests.find((entry) => entry.url.endsWith(':commit'));
assert.ok(mirrorCommit, 'asset mirror commit request must be issued');
const mirrorBody = JSON.parse(mirrorCommit.options.body);
const mirrorNames = mirrorBody.writes.map((write) => write?.update?.name || write?.delete || '');
assert.ok(mirrorNames.some((name) => name.endsWith('/documents/publicCatalog/main')), 'asset mirror must update publicCatalog/main');
assert.ok(!mirrorNames.some((name) => name.includes('/documents/publicAssetCatalog/')), 'asset mirror must never write publicAssetCatalog/*');
console.log('[asset-domain-cutover-backend-smoke] PASS (bootstrap/catalog, CRUD, bulk, categories, PG reservation guard, Firestore compatibility mirror)');
