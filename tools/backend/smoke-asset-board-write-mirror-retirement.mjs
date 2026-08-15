import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssetService } from '../../server/src/assets/asset-service.mjs';
import { createBoardService } from '../../server/src/boards/board-service.mjs';

const adminIdentity = { uid: 'admin:phase34', source: 'clerk-postgresql', clerkUserId: 'user_admin' };
const assetCatalog = {
  categories: ['노트북'],
  assets: [{ id: 'NB-1', category: '노트북', assetNo: 'A-001', baseStatus: '대여가능', status: '대여가능', reservations: [] }],
  availability: [],
  sync: { assetCount: 1, categoryCount: 1, sourceMode: 'postgresql-canonical', syncedAt: '2026-08-11T00:00:00Z' },
};
const assetRepository = {
  async getCatalog() { return structuredClone(assetCatalog); },
  async createAuthoritative({ asset }) { return { asset, catalog: assetCatalog }; },
  async editAuthoritative({ assetId, patch }) { return { asset: { ...assetCatalog.assets[0], ...patch, id: assetId }, catalog: assetCatalog }; },
  async deleteAuthoritative() { return { deletedAsset: assetCatalog.assets[0], catalog: assetCatalog }; },
  async bulkCreateAuthoritative({ assets }) { return { assets, catalog: assetCatalog, duplicateAssetNumbers: [], invalidCategories: [] }; },
  async saveCategoriesAuthoritative() { return { catalog: assetCatalog }; },
};
const assetService = createAssetService({ repository: assetRepository });
for (const result of [
  await assetService.create(adminIdentity, { category: '노트북', assetNo: 'A-002' }),
  await assetService.edit(adminIdentity, 'NB-1', { category: '노트북', assetNo: 'A-001' }),
  await assetService.bulkCreate(adminIdentity, [{ category: '노트북', assetNo: 'A-003' }]),
  await assetService.saveCategories(adminIdentity, { categories: ['노트북'], renameMap: {} }),
  await assetService.delete(adminIdentity, 'NB-1'),
]) {
  assert.equal(result.authority, 'postgresql');
  assert.equal(result.firestoreMirror, 'retired');
}

const boardRepository = {
  async getStatus() { return { source: 'postgresql', synchronized: true, noticeCount: 0, faqCount: 0, faqCategoryCount: 1 }; },
  async listNotice() { return { source: 'postgresql', pinnedPosts: [], regularPosts: [], totalRegularCount: 0 }; },
  async getNoticePost(id) { return { id, boardType: 'notice', title: 'N' }; },
  async incrementNoticeView(id) { return { id, viewCount: 1 }; },
  async listFaq() { return { source: 'postgresql', categories: [{ id: 'c1', name: '일반' }], pinnedPosts: [], regularPosts: [], totalRegularCount: 0 }; },
  async saveNoticePostAuthoritative({ post }) { return { post }; },
  async deleteNoticePostAuthoritative({ postId }) { return { deletedPost: { id: postId } }; },
  async saveFaqPostAuthoritative({ post }) { return { post }; },
  async deleteFaqPostAuthoritative({ postId }) { return { deletedPost: { id: postId } }; },
  async saveConfigAuthoritative({ boardType, postsPerPage }) { return { config: { boardType, postsPerPage } }; },
  async saveFaqCategoryAuthoritative({ category }) { return { category }; },
  async deleteFaqCategoryAuthoritative({ categoryId }) { return { deletedCategory: { id: categoryId } }; },
};
const boardService = createBoardService({ repository: boardRepository });
for (const result of [
  await boardService.saveNotice(adminIdentity, 'clerk-admin', { title: 'Notice', contentText: 'Body' }),
  await boardService.saveNotice(adminIdentity, 'clerk-admin', { id: 'n1', title: 'Notice 2', contentText: 'Body 2' }),
  await boardService.deleteNotice(adminIdentity, 'n1'),
  await boardService.saveFaq(adminIdentity, 'clerk-admin', { categoryId: 'c1', title: 'FAQ', contentText: 'Answer' }),
  await boardService.saveFaq(adminIdentity, 'clerk-admin', { id: 'f1', categoryId: 'c1', title: 'FAQ2', contentText: 'Answer2' }),
  await boardService.deleteFaq(adminIdentity, 'f1'),
  await boardService.saveConfig(adminIdentity, 'notice', 20),
  await boardService.saveFaqCategory(adminIdentity, 'clerk-admin', { name: '새 카테고리' }),
  await boardService.saveFaqCategory(adminIdentity, 'clerk-admin', { id: 'c1', name: '수정 카테고리' }),
  await boardService.deleteFaqCategory(adminIdentity, 'c1'),
]) assert.equal(result.firestoreMirror, 'retired');

const assetServiceSource = readFileSync('server/src/assets/asset-service.mjs', 'utf8');
const assetRepositorySource = readFileSync('server/src/assets/asset-repository.mjs', 'utf8');
const boardServiceSource = readFileSync('server/src/boards/board-service.mjs', 'utf8');
const boardRepositorySource = readFileSync('server/src/boards/board-repository.mjs', 'utf8');
const currentMigration = readFileSync('server/migrations/029_phase34_retired_store_physical_removal.sql', 'utf8');
for (const [name, source] of [['asset service', assetServiceSource], ['asset repository', assetRepositorySource], ['board service', boardServiceSource], ['board repository', boardRepositorySource]]) {
  for (const forbidden of ['firestoreClient', 'writeMirrorEnabled', 'beforeCommit']) assert.equal(source.includes(forbidden), false, `${name} must not retain ${forbidden}`);
}
assert.ok(currentMigration.includes('DROP TABLE IF EXISTS app_asset_catalog_syncs'));
assert.ok(currentMigration.includes('DROP TABLE IF EXISTS app_board_syncs'));
assert.ok(currentMigration.includes('CREATE OR REPLACE VIEW app_asset_catalog_status'));
assert.ok(currentMigration.includes('CREATE OR REPLACE VIEW app_board_status'));
console.log('[asset-board-write-mirror-retirement-backend-smoke] PASS (asset/board runtime is PostgreSQL-only; mirror hooks removed; obsolete sync stores physically retired)');
