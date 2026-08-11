import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAssetDomainCutoverConfig } from '../../src/features/assets/assetDomainCutover.js';

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
const env = { VITE_CLERK_STAGING_ENABLED: 'true', VITE_ASSET_POSTGRES_READ_ENABLED: 'true', VITE_ASSET_POSTGRES_WRITE_ENABLED: 'true' };
const config = readAssetDomainCutoverConfig({ env, location: { search: '?assetRead=postgres&assetWrite=postgres' }, storage });
assert.equal(config.readRequested, true);
assert.equal(config.writeRequested, true);
const latched = readAssetDomainCutoverConfig({ env, location: { search: '' }, storage });
assert.equal(latched.readRequested, true);
assert.equal(latched.writeRequested, true);
const disabled = readAssetDomainCutoverConfig({ env: { ...env, VITE_ASSET_POSTGRES_READ_ENABLED: 'false', VITE_ASSET_POSTGRES_WRITE_ENABLED: 'false' }, location: { search: '?assetRead=postgres&assetWrite=postgres' }, storage });
assert.equal(disabled.readRequested, false);
assert.equal(disabled.writeRequested, false);

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [subscription, crud, categories, bulk, catalogCompat, dashboard, client, diagnostics] = await Promise.all([
  read('src/features/requests/useRentalDataSubscriptionController.js'),
  read('src/features/assets/useAdminAssetCrudController.js'),
  read('src/features/assets/useAdminAssetCategoryController.js'),
  read('src/features/assets/useAssetBulkUpload.js'),
  read('src/features/assets/usePublicAssetCatalogCompatibilityController.js'),
  read('src/hooks/useDashboardSummary.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
]);
for (const marker of ['readAssetDomainCutoverConfig', 'bootstrapAdminAssets', 'getAssetCatalog', 'firestore-one-time-fallback', 'mk_asset_postgres_bootstrap:', 'assetWatcherDisabled', 'availabilityWatcherDisabled']) assert.ok(subscription.includes(marker), marker);
for (const marker of ['createAdminAsset', 'editAdminAsset', 'deleteAdminAsset', "writeSource: 'postgresql-authoritative'", "firestoreMirror: 'failed'"]) assert.ok(crud.includes(marker), marker);
assert.ok(categories.includes('saveAdminAssetCategories'));
assert.ok(categories.includes("firestoreMirror: 'failed'"), 'category PostgreSQL write failures must publish diagnostics');

assert.ok(subscription.includes('splitAssetCategoriesRef'), 'asset catalog fallback must use a ref for current categories');
assert.ok(!subscription.includes('    splitPublicConfig?.assetCategories,\n    userTab,'), 'asset catalog effect must not depend on the categories array it updates');
assert.ok(categories.includes('dataAssetCategoriesKey'), 'category editor must compare persisted category content');
assert.ok(categories.includes('[adminTab, dataAssetCategoriesKey]'), 'category editor reset must not depend on array identity');
assert.ok(!categories.includes('[adminTab, dataAssetCategories]'), 'category editor must not reset for same-content array replacements');
assert.ok(bulk.includes('bulkCreateAdminAssets'));
assert.ok(catalogCompat.includes('readAssetDomainCutoverConfig'));
for (const marker of ['getAssetCatalog', "assetMetricSource: 'postgresql-phase20'"]) assert.ok(dashboard.includes(marker), marker);
for (const marker of ['requestAssetCatalog', 'bootstrapAdminAssets', 'createAdminAsset', 'editAdminAsset', 'deleteAdminAsset', 'bulkCreateAdminAssets', 'saveAdminAssetCategories']) assert.ok(client.includes(marker), marker);
assert.match(diagnostics, /Clerk Staging Test · Phase (21|22|23|24|25|26|27|28|29|30)/);
assert.match(diagnostics, /Phase 20 asset domain PostgreSQL cutover/);
assert.match(diagnostics, /rentalAssets watcher:/);
assert.match(diagnostics, /rentalAvailability watcher:/);
console.log('[asset-domain-cutover-frontend-smoke] PASS (opt-in latch, PG catalog/watchers-off, admin CRUD/bulk/categories, dashboard overlay, diagnostics)');
