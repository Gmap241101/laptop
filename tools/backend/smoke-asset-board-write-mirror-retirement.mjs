import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssetService } from '../../server/src/assets/asset-service.mjs';
import { createBoardService } from '../../server/src/boards/board-service.mjs';

const adminIdentity = { uid: 'firebase-admin', idToken: 'firebase-token' };
let assetMirrorCalls = 0;
let boardMirrorCalls = 0;
let assetSourceReads = 0;
let boardSourceReads = 0;

const assetCatalog = {
  categories: ['노트북'],
  assets: [{ id: 'NB-1', category: '노트북', assetNo: 'A-001', baseStatus: '대여가능', status: '대여가능', reservations: [] }],
  availability: [],
  sync: { assetCount: 1, categoryCount: 1, sourceMode: 'postgresql', syncedAt: '2026-08-11T00:00:00Z' },
};
const assetRepository = {
  async getCatalog() { return structuredClone(assetCatalog); },
  async bootstrap() { return { assetCount: 1, categoryCount: 1 }; },
  async createAuthoritative({ asset, beforeCommit }) { const mirror = await beforeCommit({ asset, catalog: assetCatalog }); return { asset, catalog: assetCatalog, mirrorResult: mirror }; },
  async editAuthoritative({ assetId, patch, beforeCommit }) { const asset = { ...assetCatalog.assets[0], ...patch, id: assetId }; const mirror = await beforeCommit({ previousAsset: assetCatalog.assets[0], asset, catalog: assetCatalog }); return { asset, catalog: assetCatalog, mirrorResult: mirror }; },
  async deleteAuthoritative({ beforeCommit }) { const mirror = await beforeCommit({ previousAsset: assetCatalog.assets[0], catalog: assetCatalog }); return { deletedAsset: assetCatalog.assets[0], catalog: assetCatalog, mirrorResult: mirror }; },
  async bulkCreateAuthoritative({ assets, beforeCommit }) { const mirror = await beforeCommit({ assets, catalog: assetCatalog }); return { assets, catalog: assetCatalog, duplicateAssetNumbers: [], invalidCategories: [], mirrorResult: mirror }; },
  async saveCategoriesAuthoritative({ beforeCommit }) { const mirror = await beforeCommit({ catalog: assetCatalog }); return { catalog: assetCatalog, mirrorResult: mirror }; },
};
const assetFirestoreClient = {
  async verifyAdmin() { return { uid: 'firebase-admin', role: 'admin' }; },
  async listAllAssets() { return []; },
  async getPublicConfig() { return { fields: { assetCategories: ['노트북'] } }; },
  async getAsset() { assetSourceReads += 1; throw new Error('asset source read must be skipped when mirror is retired'); },
  async mirrorCreate() { assetMirrorCalls += 1; throw new Error('asset mirror must be skipped'); },
  async mirrorEdit() { assetMirrorCalls += 1; throw new Error('asset mirror must be skipped'); },
  async mirrorDelete() { assetMirrorCalls += 1; throw new Error('asset mirror must be skipped'); },
  async mirrorBulkCreate() { assetMirrorCalls += 1; throw new Error('asset mirror must be skipped'); },
  async mirrorCategories() { assetMirrorCalls += 1; throw new Error('asset mirror must be skipped'); },
};
const assetService = createAssetService({ repository: assetRepository, firestoreClient: assetFirestoreClient, writeMirrorEnabled: false });
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
assert.equal(assetMirrorCalls, 0);
assert.equal(assetSourceReads, 0);

const boardRepository = {
  async getStatus() { return { source: 'postgresql', synchronized: true }; },
  async listNotice() { return { source: 'postgresql', pinnedPosts: [], regularPosts: [], totalRegularCount: 0 }; },
  async getNoticePost(id) { return { id, boardType: 'notice', title: 'N' }; },
  async incrementNoticeView(id) { return { id, viewCount: 1 }; },
  async listFaq() { return { source: 'postgresql', categories: [{ id: 'c1', name: '일반' }], pinnedPosts: [], regularPosts: [], totalRegularCount: 0 }; },
  async bootstrap() { return { noticeCount: 0, faqCount: 0, faqCategoryCount: 1 }; },
  async saveNoticePostAuthoritative({ post, beforeCommit }) { await beforeCommit({ previous: post.isEditing ? { id: post.id } : null, post }); return { post }; },
  async deleteNoticePostAuthoritative({ postId, beforeCommit }) { await beforeCommit({ previous: { id: postId } }); return { deletedPost: { id: postId } }; },
  async saveFaqPostAuthoritative({ post, beforeCommit }) { await beforeCommit({ previous: post.isEditing ? { id: post.id } : null, post }); return { post }; },
  async deleteFaqPostAuthoritative({ postId, beforeCommit }) { await beforeCommit({ previous: { id: postId } }); return { deletedPost: { id: postId } }; },
  async saveConfigAuthoritative({ boardType, postsPerPage, beforeCommit }) { const config = { boardType, postsPerPage }; await beforeCommit({ config }); return { config }; },
  async saveFaqCategoryAuthoritative({ category, beforeCommit }) { await beforeCommit({ previous: category.isEditing ? { id: category.id } : null, category }); return { category }; },
  async deleteFaqCategoryAuthoritative({ categoryId, beforeCommit }) { await beforeCommit({ previous: { id: categoryId } }); return { deletedCategory: { id: categoryId } }; },
};
const boardFirestoreClient = {
  async verifyAdmin() { return { uid: 'firebase-admin', role: 'admin' }; },
  async readBootstrap() { return { noticeConfig: null, noticePosts: [], faqConfig: null, faqCategories: [], faqPosts: [] }; },
  async getNoticePost() { boardSourceReads += 1; throw new Error('board source read must be skipped'); },
  async getFaqPost() { boardSourceReads += 1; throw new Error('board source read must be skipped'); },
  async getFaqCategory() { boardSourceReads += 1; throw new Error('board source read must be skipped'); },
  async mirrorNoticeSave() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorNoticeDelete() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorFaqSave() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorFaqDelete() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorBoardConfig() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorFaqCategorySave() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
  async mirrorFaqCategoryDelete() { boardMirrorCalls += 1; throw new Error('board mirror must be skipped'); },
};
const boardService = createBoardService({ repository: boardRepository, firestoreClient: boardFirestoreClient, writeMirrorEnabled: false });
const notice = await boardService.saveNotice(adminIdentity, 'clerk-admin', { title: 'Notice', contentText: 'Body' });
assert.equal(notice.firestoreMirror, 'retired');
const noticeEdit = await boardService.saveNotice(adminIdentity, 'clerk-admin', { id: 'n1', title: 'Notice 2', contentText: 'Body 2' });
assert.equal(noticeEdit.firestoreMirror, 'retired');
assert.equal((await boardService.deleteNotice(adminIdentity, 'n1')).firestoreMirror, 'retired');
assert.equal((await boardService.saveFaq(adminIdentity, 'clerk-admin', { categoryId: 'c1', title: 'FAQ', contentText: 'Answer' })).firestoreMirror, 'retired');
assert.equal((await boardService.saveFaq(adminIdentity, 'clerk-admin', { id: 'f1', categoryId: 'c1', title: 'FAQ2', contentText: 'Answer2' })).firestoreMirror, 'retired');
assert.equal((await boardService.deleteFaq(adminIdentity, 'f1')).firestoreMirror, 'retired');
assert.equal((await boardService.saveConfig(adminIdentity, 'notice', 20)).firestoreMirror, 'retired');
assert.equal((await boardService.saveFaqCategory(adminIdentity, 'clerk-admin', { name: '새 카테고리' })).firestoreMirror, 'retired');
assert.equal((await boardService.saveFaqCategory(adminIdentity, 'clerk-admin', { id: 'c1', name: '수정 카테고리' })).firestoreMirror, 'retired');
assert.equal((await boardService.deleteFaqCategory(adminIdentity, 'c1')).firestoreMirror, 'retired');
assert.equal(boardMirrorCalls, 0);
assert.equal(boardSourceReads, 0);

const envSource = readFileSync('server/src/config/env.mjs', 'utf8');
const indexSource = readFileSync('server/src/index.mjs', 'utf8');
const migration = readFileSync('server/migrations/019_phase28_asset_board_write_mirror_retirement.sql', 'utf8');
for (const marker of ['FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED', 'assetBoardWriteMirrorDisabled']) assert.ok(envSource.includes(marker), marker);
for (const marker of ['writeMirrorEnabled: !config.assetBoardWriteMirrorDisabled', 'phase28WriteMirrorRetirement']) assert.ok(indexSource.includes(marker), marker);
for (const marker of ["'phase', 28", "'firestoreWriteMirror', 'retired-staging-opt-in'", "jsonb_build_array('assets','notice','faq')"]) assert.ok(migration.includes(marker), marker);
console.log('[asset-board-write-mirror-retirement-backend-smoke] PASS (assets + notice/FAQ write mirrors retired while Firebase admin identity verification remains)');
