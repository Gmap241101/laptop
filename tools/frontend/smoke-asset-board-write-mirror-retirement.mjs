import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFirestoreWriteMirrorRetirementConfig } from '../../src/features/compatibility/firestoreWriteMirrorRetirement.js';

const config = readFirestoreWriteMirrorRetirementConfig({ env: {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED: 'true',
  VITE_API_URL: 'https://rental-api.example.test/',
} });
assert.equal(config.enabled, true);
assert.equal(config.apiBaseUrl, 'https://rental-api.example.test');
assert.deepEqual([...config.retiredDomains], ['assets', 'notice', 'faq']);

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of [
  'Clerk Staging Test · Phase 28',
  'Phase 28 asset / board Firestore write mirror retirement',
  'Write mirror retirement requested',
  'Backend retirement applied',
  'Retired write mirror domains',
  'Preserved write mirrors: member / restriction / rental requests / site shell / policy-terms transactions',
  "top: '184px'",
]) assert.ok(diagnostics.includes(marker), `missing Phase 28 diagnostics marker: ${marker}`);

const assetCrud = readFileSync('src/features/assets/useAdminAssetCrudController.js', 'utf8');
assert.ok(assetCrud.includes("mutation?.firestoreMirror || 'synced'"), 'asset CRUD must display backend mirror status');
const assetCategory = readFileSync('src/features/assets/useAdminAssetCategoryController.js', 'utf8');
assert.ok(assetCategory.includes("payload?.adminAssetMutation?.firestoreMirror || 'synced'"), 'asset categories must display backend mirror status');
const assetBulk = readFileSync('src/features/assets/useAssetBulkUpload.js', 'utf8');
assert.ok(assetBulk.includes("mutation?.firestoreMirror || 'synced'"), 'asset bulk upload must display backend mirror status');
const boards = readFileSync('src/features/boards/boardContentCutover.js', 'utf8');
assert.ok(boards.includes("mutation?.firestoreMirror || fallback.firestoreMirror || 'synced'"), 'board diagnostics must use backend mirror status');

const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('firestoreWriteMirrorRetirement'), 'Phase 28 must not push compatibility logic into App.jsx');
console.log('[asset-board-write-mirror-retirement-frontend-smoke] PASS (diagnostics + backend mirror status propagation; App.jsx untouched)');
