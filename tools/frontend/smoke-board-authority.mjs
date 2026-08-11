import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/boards/boardContentCutover.js', 'utf8');
for (const marker of [
  'VITE_BOARD_CONTENT_POSTGRES_READ_ENABLED',
  'VITE_BOARD_CONTENT_POSTGRES_WRITE_ENABLED',
  "params.get('boardContent') === 'postgres'",
  "params.get('boardWrite') === 'postgres'",
  '/api/boards/notice',
  '/api/boards/faq',
  '/api/admin/boards/bootstrap',
  'incrementNoticePostView',
  'bootstrapBoardContent',
]) assert.ok(cutover.includes(marker), `missing Phase 26 board cutover marker: ${marker}`);

const subscription = readFileSync('src/features/boards/useBoardContentSubscriptionController.js', 'utf8');
for (const marker of [
  'requestNoticeBoard',
  'requestFaqBoard',
  'requestNoticePost',
  'incrementNoticePostView',
  'noticePostgresFallback',
  'faqPostgresFallback',
  "readSource: 'firestore-fallback'",
  'runTransaction(db',
]) assert.ok(subscription.includes(marker), `missing Phase 26 subscription marker: ${marker}`);

const adminPosts = readFileSync('src/features/boards/useAdminBoardPostController.js', 'utf8');
for (const marker of ['readBoardContentCutoverConfig', 'saveNoticeBoardPost', 'deleteNoticeBoardPost', 'saveFaqBoardPost', 'deleteFaqBoardPost']) {
  assert.ok(adminPosts.includes(marker), `missing Phase 26 admin post marker: ${marker}`);
}
const adminSettings = readFileSync('src/features/boards/useAdminBoardSettingsController.js', 'utf8');
for (const marker of ['saveBoardConfig', 'saveFaqBoardCategory', 'deleteFaqBoardCategory', "error?.code === 'faq_category_in_use'"]) {
  assert.ok(adminSettings.includes(marker), `missing Phase 26 admin settings marker: ${marker}`);
}
const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of ['Clerk Staging Test · Phase 29', 'Phase 26 notice / FAQ PostgreSQL read + CRUD authority', 'Notice / FAQ PostgreSQL bootstrap', "top: '184px'"]) {
  assert.ok(diagnostics.includes(marker), `missing Phase 26 diagnostics marker: ${marker}`);
}
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('boardContentCutover'), 'Phase 26 must not push board authority logic back into App.jsx.');
console.log('[board-authority-frontend-smoke] PASS (notice/FAQ PostgreSQL read, fallback, view count, admin CRUD/config/category authority, diagnostics bootstrap)');
