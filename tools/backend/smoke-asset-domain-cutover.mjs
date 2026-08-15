import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssetService } from '../../server/src/assets/asset-service.mjs';

const identity = { uid: 'admin:phase34', source: 'clerk-postgresql', clerkUserId: 'user_admin' };
const baseCatalog = {
  categories: ['노트북'],
  assets: [{
    id: 'NB-1', category: '노트북', assetNo: 'A-001', assetNoNormalized: 'a-001', serialNo: 'SN-1',
    model: 'Model 1', manufactureDate: '2026-01-01', photo: '', note: '', baseStatus: '대여가능',
    status: '대여가능', currentRequestId: null, reservations: [],
  }],
  availability: [],
  sync: { assetCount: 1, categoryCount: 1, sourceHash: 'hash', sourceMode: 'postgresql', syncedAt: '2026-08-12T00:00:00Z' },
};

const calls = [];
let catalog = structuredClone(baseCatalog);
const repository = {
  async getCatalog() { return structuredClone(catalog); },
  async createAuthoritative(args) {
    calls.push(['create', args]);
    const next = { ...args.asset, assetNoNormalized: String(args.asset.assetNo).toLowerCase(), status: args.asset.baseStatus, currentRequestId: null, reservations: [] };
    catalog.assets = [...catalog.assets, next];
    return { asset: next, catalog: structuredClone(catalog) };
  },
  async editAuthoritative(args) {
    calls.push(['edit', args]);
    const previousAsset = catalog.assets.find((asset) => asset.id === args.assetId);
    const asset = { ...previousAsset, ...args.patch, id: args.assetId, assetNoNormalized: String(args.patch.assetNo).toLowerCase() };
    catalog.assets = catalog.assets.map((item) => item.id === args.assetId ? asset : item);
    return { asset, catalog: structuredClone(catalog) };
  },
  async deleteAuthoritative(args) {
    calls.push(['delete', args]);
    const previousAsset = catalog.assets.find((asset) => asset.id === args.assetId);
    catalog.assets = catalog.assets.filter((asset) => asset.id !== args.assetId);
    return { deletedAsset: previousAsset, catalog: structuredClone(catalog) };
  },
  async bulkCreateAuthoritative(args) {
    calls.push(['bulk', args]);
    const assets = args.assets.map((asset) => ({ ...asset, assetNoNormalized: String(asset.assetNo).toLowerCase(), status: asset.baseStatus, currentRequestId: null, reservations: [] }));
    catalog.assets = [...catalog.assets, ...assets];
    return { assets, duplicateAssetNumbers: [], invalidCategories: [], catalog: structuredClone(catalog) };
  },
  async saveCategoriesAuthoritative(args) {
    calls.push(['categories', args]);
    catalog.categories = [...args.categories];
    return { catalog: structuredClone(catalog) };
  },
};

const service = createAssetService({ repository });
const bootstrap = await service.bootstrap(identity);
assert.equal(bootstrap.target, 'postgresql');
assert.equal(bootstrap.source, 'postgresql-existing');
assert.equal(bootstrap.skipped, true);
assert.equal(bootstrap.assetCount, 1);
assert.equal(bootstrap.catalog.source, 'postgresql');

const publicCatalog = await service.getPublicCatalog();
assert.equal(publicCatalog.synchronized, true);
assert.equal(publicCatalog.metrics.totalAssetCount, 1);

const created = await service.create(identity, { category: '노트북', assetNo: 'A-002', serialNo: 'SN-2', model: 'Model 2' });
assert.equal(created.authority, 'postgresql');
assert.equal(created.firestoreMirror, 'retired');
const edited = await service.edit(identity, 'NB-1', { category: '노트북', assetNo: 'A-001', serialNo: 'SN-X', model: 'Model X' });
assert.equal(edited.authority, 'postgresql');
assert.equal(edited.firestoreMirror, 'retired');
const bulk = await service.bulkCreate(identity, [{ category: '노트북', assetNo: 'A-003', model: 'Bulk' }]);
assert.equal(bulk.authority, 'postgresql');
assert.equal(bulk.firestoreMirror, 'retired');
const categories = await service.saveCategories(identity, { categories: ['노트북', '태블릿'], renameMap: {} });
assert.equal(categories.authority, 'postgresql');
assert.equal(categories.firestoreMirror, 'retired');
const deleted = await service.delete(identity, 'NB-1');
assert.equal(deleted.authority, 'postgresql');
assert.equal(deleted.firestoreMirror, 'retired');

await assert.rejects(() => service.create({ uid: 'legacy', source: 'firebase' }, { category: '노트북', assetNo: 'A-004' }), (error) => error?.code === 'admin_postgresql_identity_required');

const [migration, repoSource, serviceSource, appSource, indexSource] = await Promise.all([
  readFile(new URL('../../server/migrations/012_phase20_asset_domain_cutover.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/index.mjs', import.meta.url), 'utf8'),
]);
for (const marker of ['app_asset_categories', 'app_rental_assets', 'app_asset_catalog_syncs']) assert.ok(migration.includes(marker), marker);
for (const marker of ['app_rental_asset_reservation_guards', 'pg_advisory_xact_lock', 'createAuthoritative', 'bulkCreateAuthoritative', 'saveCategoriesAuthoritative']) assert.ok(repoSource.includes(marker), marker);
for (const marker of ['getPublicCatalog', "source: 'postgresql-existing'", "authority: 'postgresql'", "firestoreMirror: 'retired'", 'admin_postgresql_identity_required']) assert.ok(serviceSource.includes(marker), marker);
for (const forbidden of ['firestoreClient', 'mirrorCreate', 'mirrorEdit', 'mirrorDelete', 'mirrorBulkCreate', 'mirrorCategories', 'firebaseIdToken']) assert.ok(!serviceSource.includes(forbidden), `asset service must not retain ${forbidden}`);
for (const marker of ['/api/assets/catalog', '/api/admin/assets/bootstrap', '/api/admin/assets/bulk', '/api/admin/assets/categories']) assert.ok(appSource.includes(marker), marker);
assert.ok(indexSource.includes('createAssetService({\n  repository: assetRepository,\n})'), 'asset service wiring must be PostgreSQL-only');

console.log('[asset-domain-cutover-backend-smoke] PASS (PostgreSQL-only bootstrap/catalog/CRUD/bulk/categories; no retired-provider asset service client)');
