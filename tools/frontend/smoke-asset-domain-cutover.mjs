import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAssetDomainCutoverConfig } from '../../src/features/assets/assetDomainCutover.js';

const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const retiredEnv = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_FIREBASE_RUNTIME_DISABLED: 'true',
  VITE_ASSET_POSTGRES_READ_ENABLED: 'false',
  VITE_ASSET_POSTGRES_WRITE_ENABLED: 'false',
};
const config = readAssetDomainCutoverConfig({ env: retiredEnv, location: { search: '' }, storage });
assert.equal(config.readEnabled, true, 'Phase 34 retirement must force PostgreSQL asset reads on');
assert.equal(config.writeEnabled, true, 'Phase 34 retirement must force PostgreSQL asset writes on');
assert.equal(config.readRequested, true, 'Phase 34 retirement must not require a query/session latch for asset reads');
assert.equal(config.writeRequested, true, 'Phase 34 retirement must not require a query/session latch for asset writes');

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [subscription, crud, categories, bulk, dashboard, client, diagnostics, hardRetirement] = await Promise.all([
  read('src/features/requests/useRentalDataSubscriptionController.js'),
  read('src/features/assets/useAdminAssetCrudController.js'),
  read('src/features/assets/useAdminAssetCategoryController.js'),
  read('src/features/assets/useAssetBulkUpload.js'),
  read('src/hooks/useDashboardSummary.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/features/auth/firebaseRuntimeRetirement.js'),
]);

for (const marker of ['readAssetDomainCutoverConfig', 'bootstrapAdminAssets', 'getAssetCatalog', 'assetWatcherDisabled', 'availabilityWatcherDisabled']) {
  assert.ok(subscription.includes(marker), marker);
}
assert.ok(subscription.includes('splitAssetCategoriesRef'), 'asset catalog must preserve the current category ref contract');
assert.ok(!subscription.includes('    splitPublicConfig?.assetCategories,\n    userTab,'), 'asset catalog effect must not depend on the category array it updates');

for (const marker of ['createAdminAsset', 'editAdminAsset', 'deleteAdminAsset', "writeSource: 'postgresql-authoritative'"]) assert.ok(crud.includes(marker), marker);
assert.ok(!crud.includes("throw new Error('firebase-admin-session-missing')"), 'Phase 34 PostgreSQL asset CRUD must not require a Firebase administrator session');
assert.ok(crud.includes("createAdminAsset(\n          '',"), 'asset create must call the Clerk/PostgreSQL API without a Firebase token');
assert.ok(crud.includes("deleteAdminAsset('', id)"), 'asset delete must call the Clerk/PostgreSQL API without a Firebase token');
assert.ok(crud.includes("editAdminAsset(\n          '',"), 'asset edit must call the Clerk/PostgreSQL API without a Firebase token');

assert.ok(categories.includes('saveAdminAssetCategories'));
assert.ok(!categories.includes("throw new Error('firebase-admin-session-missing')"), 'Phase 34 category writes must not require a Firebase administrator session');
assert.ok(categories.includes("saveAdminAssetCategories(\n          '',"), 'category writes must use Clerk/PostgreSQL only');

assert.ok(bulk.includes("bulkCreateAdminAssets('', parsedCandidates)"));
for (const forbidden of ['firebaseAuth', 'retiredLegacyDataCompat', 'appDataRefs', 'runTransaction']) {
  assert.ok(!bulk.includes(forbidden), `bulk asset upload must not depend on ${forbidden}`);
}
for (const marker of ['getAssetCatalog', "assetMetricSource: 'postgresql'"]) assert.ok(dashboard.includes(marker), marker);
for (const marker of ['requestAssetCatalog', 'bootstrapAdminAssets', 'createAdminAsset', 'editAdminAsset', 'deleteAdminAsset', 'bulkCreateAdminAssets', 'saveAdminAssetCategories']) assert.ok(client.includes(marker), marker);
assert.ok(hardRetirement.includes("mode: 'removed'") && hardRetirement.includes('requested: true'), 'Phase 34 hard retirement must be unconditional');
assert.match(diagnostics, /Clerk Staging Test · Phase 34/);
assert.match(diagnostics, /Asset source: postgresql/);
assert.match(diagnostics, /External Firebase SDK\/network: removed/);

console.log('[asset-domain-cutover-frontend-smoke] PASS (Phase34 forced PostgreSQL authority, no Firebase-session gate on active asset mutations, PG dashboard/catalog)');
