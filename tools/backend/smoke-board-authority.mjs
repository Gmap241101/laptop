import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardService } from '../../server/src/boards/board-service.mjs';

const calls = [];
const repository = {
  async getStatus() { return { source: 'postgresql', synchronized: true, noticeCount: 1, faqCount: 1, faqCategoryCount: 1, syncedAt: new Date('2026-08-11T00:00:00.000Z') }; },
  async listNotice() { return { source: 'postgresql', config: { postsPerPage: 10 }, pinnedPosts: [], regularPosts: [], totalRegularCount: 0, hasNextPage: false }; },
  async getNoticePost(id) { return { id, boardType: 'notice', title: 'Notice' }; },
  async incrementNoticeView(id) { return { id, viewCount: 2 }; },
  async listFaq() { return { source: 'postgresql', config: { postsPerPage: 10 }, categories: [], pinnedPosts: [], regularPosts: [], totalRegularCount: 0, hasNextPage: false }; },
  async bootstrap(input) { calls.push(['bootstrap', input]); return { noticeCount: input.noticePosts.length, faqCount: input.faqPosts.length, faqCategoryCount: input.faqCategories.length }; },
  async saveNoticePostAuthoritative({ post, beforeCommit }) { await beforeCommit({ previous: null, post: { ...post, createdAt: new Date(), updatedAt: new Date(), viewCount: 0 } }); return { post }; },
  async deleteNoticePostAuthoritative({ postId, beforeCommit }) { await beforeCommit({ previous: { id: postId } }); return { deletedPost: { id: postId } }; },
  async saveFaqPostAuthoritative({ post, beforeCommit }) { await beforeCommit({ previous: null, post: { ...post, createdAt: new Date(), updatedAt: new Date() } }); return { post }; },
  async deleteFaqPostAuthoritative({ postId, beforeCommit }) { await beforeCommit({ previous: { id: postId } }); return { deletedPost: { id: postId } }; },
  async saveConfigAuthoritative({ boardType, postsPerPage, beforeCommit }) { const config = { boardType, postsPerPage }; await beforeCommit({ config }); return { config }; },
  async saveFaqCategoryAuthoritative({ category, beforeCommit }) { const next = { ...category, order: 1, createdAt: new Date(), updatedAt: new Date() }; await beforeCommit({ previous: null, category: next }); return { category: next }; },
  async deleteFaqCategoryAuthoritative({ categoryId, beforeCommit }) { await beforeCommit({ previous: { id: categoryId } }); return { deletedCategory: { id: categoryId } }; },
};
const firestoreClient = {
  async verifyAdmin({ firebaseUid }) { assert.equal(firebaseUid, 'firebase-admin'); return { uid: firebaseUid, role: 'owner' }; },
  async readBootstrap() {
    return {
      noticeConfig: { fields: { postsPerPage: 10 } },
      noticePosts: [{ name: 'projects/x/databases/(default)/documents/noticePosts/n1', fields: { id: 'n1', title: 'Notice', contentText: 'Body', isPinned: false } }],
      faqConfig: { fields: { postsPerPage: 10 } },
      faqCategories: [{ name: 'projects/x/databases/(default)/documents/faqCategories/c1', fields: { id: 'c1', name: 'General', order: 1 } }],
      faqPosts: [{ name: 'projects/x/databases/(default)/documents/faqPosts/f1', fields: { id: 'f1', categoryId: 'c1', title: 'FAQ', contentText: 'Answer', isPinned: false } }],
    };
  },
  async getNoticePost() { return { updateTime: '2026-08-11T00:00:00Z' }; },
  async getFaqPost() { return { updateTime: '2026-08-11T00:00:00Z' }; },
  async getFaqCategory() { return { updateTime: '2026-08-11T00:00:00Z' }; },
  async mirrorNoticeSave() { calls.push(['mirror-notice-save']); return { synced: true }; },
  async mirrorNoticeDelete() { calls.push(['mirror-notice-delete']); return { synced: true }; },
  async mirrorFaqSave() { calls.push(['mirror-faq-save']); return { synced: true }; },
  async mirrorFaqDelete() { calls.push(['mirror-faq-delete']); return { synced: true }; },
  async mirrorBoardConfig() { calls.push(['mirror-config']); return { synced: true }; },
  async mirrorFaqCategorySave() { calls.push(['mirror-category-save']); return { synced: true }; },
  async mirrorFaqCategoryDelete() { calls.push(['mirror-category-delete']); return { synced: true }; },
};
const service = createBoardService({ repository, firestoreClient });
const identity = { uid: 'firebase-admin', idToken: 'firebase-token' };
const boot = await service.bootstrap(identity, 'clerk-admin');
assert.equal(boot.target, 'postgresql');
assert.equal(boot.noticeCount, 1);
assert.equal(boot.faqCount, 1);
assert.equal(boot.faqCategoryCount, 1);
const notice = await service.saveNotice(identity, 'clerk-admin', { title: 'New notice', contentText: 'Body', authorUid: 'firebase-admin', authorName: 'Admin' });
assert.equal(notice.authority, 'postgresql');
assert.equal(notice.firestoreMirror, 'synced');
const faq = await service.saveFaq(identity, 'clerk-admin', { categoryId: 'c1', title: 'New faq', contentText: 'Answer', authorUid: 'firebase-admin', authorName: 'Admin' });
assert.equal(faq.authority, 'postgresql');
await service.saveConfig(identity, 'notice', 20);
await service.saveFaqCategory(identity, 'clerk-admin', { name: 'More' });
assert.ok(calls.some(([name]) => name === 'mirror-notice-save'));
assert.ok(calls.some(([name]) => name === 'mirror-faq-save'));
assert.ok(calls.some(([name]) => name === 'mirror-config'));
assert.ok(calls.some(([name]) => name === 'mirror-category-save'));

const migration = readFileSync('server/migrations/018_phase26_notice_faq_board_authority.sql', 'utf8');
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_board_configs',
  'CREATE TABLE IF NOT EXISTS app_faq_categories',
  'CREATE TABLE IF NOT EXISTS app_board_posts',
  'CREATE TABLE IF NOT EXISTS app_board_syncs',
  "'phase', 26",
  "'adminWriteAuthority', 'postgresql-authoritative'",
  "'firestoreCompatibilityMirror', true",
  "'noticeViewCountAuthority', 'postgresql-with-client-firestore-compatibility-mirror'",
]) assert.ok(migration.includes(marker), `missing Phase 26 migration marker: ${marker}`);
console.log('[board-authority-backend-smoke] PASS (bootstrap + PostgreSQL-authoritative notice/FAQ/config/category writes + Firestore compatibility mirror)');
