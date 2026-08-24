import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAssetService } from '../../server/src/assets/asset-service.mjs';

const identity = { uid: 'admin-category-fast', source: 'clerk-postgresql', clerkUserId: 'user_admin_category' };
let categoryReads = 0;
let fullCatalogReads = 0;
const service = createAssetService({
  repository: {
    async getCategoryCatalog() {
      categoryReads += 1;
      return {
        categories: ['노트북', '태블릿'],
        items: [
          { name: '노트북', assetCount: 12 },
          { name: '태블릿', assetCount: 2 },
        ],
      };
    },
    async getCatalog() {
      fullCatalogReads += 1;
      throw new Error('category read hot path must not load the full asset catalog');
    },
  },
});

const result = await service.getCategories(identity);
assert.equal(result.authority, 'postgresql');
assert.deepEqual(result.categories, ['노트북', '태블릿']);
assert.equal(result.items[0].assetCount, 12);
assert.equal(categoryReads, 1);
assert.equal(fullCatalogReads, 0);

const [repositorySource, serviceSource, appSource] = await Promise.all([
  readFile(new URL('../../server/src/assets/asset-repository.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/assets/asset-service.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../server/src/app.mjs', import.meta.url), 'utf8'),
]);

assert.match(repositorySource, /async getCategoryCatalog\(\)[\s\S]*readCategoryCatalog\(pool\)/);
assert.match(repositorySource, /SELECT category\.name, category\.sort_order, COUNT\(asset\.asset_id\)::int AS asset_count/);
const categoryReader = repositorySource.match(/const readCategoryCatalog = async \(queryable\) => \{[\s\S]*?\n\};/)?.[0] || '';
assert.ok(categoryReader, 'dedicated asset category reader must exist');
assert.doesNotMatch(categoryReader, /app_rental_asset_reservation_guards|app_rental_requests request|readAvailability|asset\.serial_no|asset\.model/, 'category read must not load full asset/reservation detail');
assert.match(serviceSource, /async getCategories\(adminIdentity\)[\s\S]*repository\.getCategoryCatalog\(\)/);
assert.match(appSource, /request\.method === 'GET' && url\.pathname === '\/api\/admin\/assets\/categories'/);
assert.match(appSource, /authenticateAdminPostgresqlIdentity\(request, response, headers, requestId, auth\)/);

console.log('[phase34-admin-asset-category-read-performance-backend-smoke] PASS (dedicated one-query category+usage read; no full asset/reservation catalog)');
