import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const retiredModule = 'src/features/compatibility/firestoreWriteMirrorRetirement.js';
assert.equal(existsSync(retiredModule), false, 'retired asset/board mirror compatibility module must stay deleted');

const assetCrud = readFileSync('src/features/assets/useAdminAssetCrudController.js', 'utf8');
const assetCategory = readFileSync('src/features/assets/useAdminAssetCategoryController.js', 'utf8');
const assetBulk = readFileSync('src/features/assets/useAssetBulkUpload.js', 'utf8');
const boards = readFileSync('src/features/boards/boardContentCutover.js', 'utf8');
const assetService = readFileSync('server/src/assets/asset-service.mjs', 'utf8');
const boardService = readFileSync('server/src/boards/board-service.mjs', 'utf8');
const app = readFileSync('server/src/app.mjs', 'utf8');

for (const source of [assetCrud, assetCategory, assetBulk, boards]) {
  assert.equal(source.includes('firestoreWriteMirrorRetirement'), false, 'active asset/board frontend source must not import the retired mirror compatibility module');
  assert.equal(source.includes('VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED'), false, 'retired frontend asset/board flag must not return to active source');
}
assert.ok(assetService.includes("firestoreMirror: 'retired'"), 'asset mutations must remain PostgreSQL-authoritative with retired mirror status');
assert.ok(boardService.includes("firestoreMirror: 'retired'"), 'board mutations must remain PostgreSQL-authoritative with retired mirror status');
assert.ok(app.includes('assetBoardWriteMirrorDisabled: Boolean(config.assetBoardWriteMirrorDisabled)'), 'health contract must retain asset/board retirement authority');
assert.ok(boards.includes("mutation?.firestoreMirror || fallback.firestoreMirror || 'synced'"), 'board diagnostics must still consume the backend mirror status when present');

console.log('[asset-board-write-mirror-retirement-frontend-smoke] PASS (retired compatibility module absent; PostgreSQL asset/board authority preserved)');
