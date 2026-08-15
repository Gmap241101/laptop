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
  async saveNoticePostAuthoritative({ post }) { calls.push(['notice-save', post]); return { post: { ...post, createdAt: new Date(), updatedAt: new Date(), viewCount: 0 } }; },
  async deleteNoticePostAuthoritative({ postId }) { calls.push(['notice-delete', postId]); return { deletedPost: { id: postId } }; },
  async saveFaqPostAuthoritative({ post }) { calls.push(['faq-save', post]); return { post: { ...post, createdAt: new Date(), updatedAt: new Date() } }; },
  async deleteFaqPostAuthoritative({ postId }) { calls.push(['faq-delete', postId]); return { deletedPost: { id: postId } }; },
  async saveConfigAuthoritative({ boardType, postsPerPage }) { const config = { boardType, postsPerPage }; calls.push(['config-save', config]); return { config }; },
  async saveFaqCategoryAuthoritative({ category }) { const next = { ...category, order: 1, createdAt: new Date(), updatedAt: new Date() }; calls.push(['category-save', next]); return { category: next }; },
  async deleteFaqCategoryAuthoritative({ categoryId }) { calls.push(['category-delete', categoryId]); return { deletedCategory: { id: categoryId } }; },
};

const service = createBoardService({ repository });
const identity = { uid: 'admin:phase34', source: 'clerk-postgresql', clerkUserId: 'user_admin' };
const boot = await service.bootstrap(identity);
assert.equal(boot.target, 'postgresql');
assert.equal(boot.source, 'postgresql-existing');
assert.equal(boot.skipped, true);
assert.equal(boot.noticeCount, 1);
assert.equal(boot.faqCount, 1);
assert.equal(boot.faqCategoryCount, 1);

const notice = await service.saveNotice(identity, 'clerk-admin', { title: 'New notice', contentText: 'Body', authorUid: 'admin:phase34', authorName: 'Admin' });
assert.equal(notice.authority, 'postgresql');
assert.equal(notice.firestoreMirror, 'retired');
const faq = await service.saveFaq(identity, 'clerk-admin', { categoryId: 'c1', title: 'New faq', contentText: 'Answer', authorUid: 'admin:phase34', authorName: 'Admin' });
assert.equal(faq.authority, 'postgresql');
assert.equal(faq.firestoreMirror, 'retired');
const config = await service.saveConfig(identity, 'notice', 20);
assert.equal(config.firestoreMirror, 'retired');
const category = await service.saveFaqCategory(identity, 'clerk-admin', { name: 'More' });
assert.equal(category.firestoreMirror, 'retired');
assert.ok(calls.some(([name]) => name === 'notice-save'));
assert.ok(calls.some(([name]) => name === 'faq-save'));
assert.ok(calls.some(([name]) => name === 'config-save'));
assert.ok(calls.some(([name]) => name === 'category-save'));
await assert.rejects(() => service.saveNotice({ uid: 'legacy', source: 'firebase' }, 'legacy', { title: 'No', contentText: 'No' }), (error) => error?.code === 'admin_postgresql_identity_required');

const migration = readFileSync('server/migrations/018_phase26_notice_faq_board_authority.sql', 'utf8');
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_board_configs',
  'CREATE TABLE IF NOT EXISTS app_faq_categories',
  'CREATE TABLE IF NOT EXISTS app_board_posts',
  'CREATE TABLE IF NOT EXISTS app_board_syncs',
  "'phase', 26",
]) assert.ok(migration.includes(marker), `missing historical Phase 26 migration marker: ${marker}`);
const currentMigration = readFileSync('server/migrations/029_phase34_retired_store_physical_removal.sql', 'utf8');
assert.ok(currentMigration.includes('DROP TABLE IF EXISTS app_board_syncs'), 'Phase 34 must physically remove the obsolete board sync table');
assert.ok(currentMigration.includes('CREATE OR REPLACE VIEW app_board_status'), 'Phase 34 must derive board status from canonical tables');
const serviceSource = readFileSync('server/src/boards/board-service.mjs', 'utf8');
for (const forbidden of ['firestoreClient', 'writeMirrorEnabled', 'beforeCommit']) assert.equal(serviceSource.includes(forbidden), false, `board service must not retain ${forbidden}`);
console.log('[board-authority-backend-smoke] PASS (Clerk/PostgreSQL board authority; retired mirror hooks removed; historical sync table physically retired by Phase 34)');
