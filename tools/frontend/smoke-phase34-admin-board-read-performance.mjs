import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/boards/boardContentCutover.js', 'utf8');
const subscription = readFileSync('src/features/boards/useBoardContentSubscriptionController.js', 'utf8');
const controller = readFileSync('src/features/boards/useAdminBoardPostController.js', 'utf8');
const noticePanel = readFileSync('src/admin/AdminNoticePanel.jsx', 'utf8');
const faqPanel = readFileSync('src/admin/AdminFaqPanel.jsx', 'utf8');
const selectors = readFileSync('src/features/boards/useBoardDerivedSelectors.js', 'utf8');

for (const marker of [
  "params.set('summary', '1')",
  'summaryOnly = false',
  'requestFaqPost',
  'faq|detail|',
  'notice|detail|',
  'withBoardReadCache',
]) assert.ok(cutover.includes(marker), `missing board read cache/summary marker: ${marker}`);

assert.ok(subscription.includes('summaryOnly: shouldLoadAdminNotice'), 'admin notice list must request summary payload outside search mode');
assert.ok(subscription.includes('summaryOnly: shouldLoadAdminFaq'), 'admin FAQ list must request summary payload outside search mode');

for (const marker of [
  'requestAdminNoticePost',
  'requestAdminFaqPost',
  'requestNoticePost',
  'requestFaqPost',
  "typeof post.contentHtml === 'undefined'",
  "typeof post.contentHtml === 'undefined'",
]) assert.ok(controller.includes(marker), `admin board editor must lazy-load detail: ${marker}`);

for (const marker of [
  'onPointerEnter',
  'onPointerDown',
  'requestNoticePost(item.post.id)',
]) assert.ok(noticePanel.includes(marker), `notice edit prefetch marker missing: ${marker}`);

for (const marker of [
  'requestFaqPost',
  'faqDetailById',
  'prefetchFaqDetail',
  'toggleFaqDetail',
  'animate-pulse',
  'subscribeBoardContentRefresh',
]) assert.ok(faqPanel.includes(marker), `FAQ lazy detail marker missing: ${marker}`);

assert.equal(faqPanel.includes('html={post.contentHtml}'), false, 'admin FAQ expanded body must not depend on summary-list contentHtml');
assert.ok(selectors.includes('adminNoticeRowsAreServerSummaries'), 'admin notice server search summaries must not be re-filtered by absent body text');
assert.ok(selectors.includes('adminFaqRowsAreServerSummaries'), 'admin FAQ server search summaries must use server pagination');
assert.ok(subscription.includes('searchMode && !shouldLoadAdminNotice'), 'admin notice search must use server page directly');
assert.ok(subscription.includes('searchMode && !shouldLoadAdminFaq'), 'admin FAQ search must use server page directly');

console.log('[phase34-admin-board-read-performance-frontend-smoke] PASS (admin summary lists + cached/prefetched lazy details)');
