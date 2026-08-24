import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [subscription, client, adminApp, controller, panel] = await Promise.all([
  readFile(new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminApp.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/assets/useAdminAssetCategoryController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminAssetCategoriesPanel.jsx', import.meta.url), 'utf8'),
]);

assert.match(subscription, /\['laptops', 'requests', 'dataManagement'\]\.includes\(adminTab\)/, 'full asset catalog hot path must exclude category management');
assert.match(subscription, /adminTab === 'categories'/);
assert.match(subscription, /clerkStagingClient\.getAdminAssetCategories\(\)/);
assert.match(subscription, /setData\(\(previous\) => \(\{ \.\.\.previous, assetCategories: categories \}\)\)/, 'category list should be available without waiting for public config merge');
assert.match(subscription, /setAdminAssetCategoryTemp\(categories\)/, 'category list should replace the temporary editor state in the same batch that marks the dedicated read ready');
assert.match(subscription, /setAdminAssetCategoryCatalogReady\(true\)/);
const categoryBranch = subscription.match(/if \(shouldLoadAdminCategories\) \{[\s\S]*?return \(\) => \{ cancelled = true; \};\n    \}/)?.[0] || '';
assert.ok(categoryBranch, 'dedicated category branch must exist');
assert.doesNotMatch(categoryBranch, /bootstrapAdminAssets|getAssetCatalog\(/, 'category tab must not bootstrap/read full asset catalog');

assert.match(client, /requestAdminAssetCategoryCatalog/);
assert.match(client, /path: '\/api\/admin\/assets\/categories', method: 'GET'/);
assert.match(client, /async getAdminAssetCategories\(\)/);
assert.match(adminApp, /const \[assetCategoryCatalogReady, setAdminAssetCategoryCatalogReady\] = useState\(false\)/);
assert.match(adminApp, /const \[assetCategoryUsageCounts, setAdminAssetCategoryUsageCounts\] = useState\(\{\}\)/);
assert.match(controller, /assetCategoryUsageCounts = \{\}/);
assert.match(controller, /serverUsageCount > 0 \|\| dataLaptops\.some/);
assert.doesNotMatch(panel, /PostgreSQL 자산 카테고리를 불러오는 중입니다\./, 'user-visible loading state must not expose backend implementation wording');
assert.match(panel, /aria-label="자산 카테고리 불러오는 중"/);

console.log('[phase34-admin-asset-category-read-performance-frontend-smoke] PASS (category-only fetch, independent readiness, usage counts, neutral loading UI)');
