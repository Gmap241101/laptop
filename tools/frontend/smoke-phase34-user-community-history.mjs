import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const history = read('src/routing/userCommunityHistory.js');
const boardPanel = read('src/user/UserBoardPanel.jsx');
const boardController = read('src/features/boards/useBoardContentSubscriptionController.js');
const inquiryPanel = read('src/user/UserInquiryPanel.jsx');
const homePanel = read('src/user/UserHomePanel.jsx');

for (const marker of [
  '__mkRentalUserCommunityHistoryV1',
  "new Set(['notice', 'faq', 'inquiry'])",
  'window.history.pushState(',
  'window.history.replaceState(',
  'window.history.back()',
  'window.location.href',
]) {
  assert.ok(history.includes(marker), `Community history marker missing: ${marker}`);
}

assert.match(boardPanel, /window\.addEventListener\('popstate', syncCommunityHistory\)/);
assert.match(boardPanel, /pushUserCommunityHistoryState\(\{ tab: 'notice', view: 'detail', id: post\.id \}\)/);
assert.match(boardPanel, /backUserCommunityHistoryState\(\{ tab: 'notice', view: 'detail'/);
assert.match(boardPanel, /pushUserCommunityHistoryState\(\{ tab: 'faq', view: 'detail', id: normalizedPostId \}\)/);
assert.match(boardPanel, /setExpandedFaqPostId\(target\.view === 'detail' \? target\.id : ''\)/);
assert.match(boardPanel, /openNoticePost\(\{ id: target\.id \}, \{ recordView: false \}\)/);
assert.match(boardController, /async \(post, \{ recordView = true \} = \{\}\) =>/);
assert.match(boardController, /if \(!recordView\) return;/);
assert.match(homePanel, /goToUserNotice\(\);[\s\S]*pushUserCommunityHistoryState\(\{ tab: 'notice', view: 'detail', id: post\?\.id \}\)[\s\S]*openNoticePost\(post\)/, 'home notice deep-link must seed notice detail history before the board panel mounts');

assert.match(inquiryPanel, /window\.addEventListener\('popstate', syncInquiryHistory\)/);
assert.match(inquiryPanel, /pushUserCommunityHistoryState\(\{ tab: 'inquiry', view: 'compose'/);
assert.match(inquiryPanel, /pushUserCommunityHistoryState\(\{ tab: 'inquiry', view: 'detail', id: publicId \}\)/);
assert.match(inquiryPanel, /replaceUserCommunityHistoryState\(\{ tab: 'inquiry', view: 'list' \}\)/);
assert.match(inquiryPanel, /backUserCommunityHistoryState\(\{ tab: 'inquiry', view: 'detail'/);
assert.match(inquiryPanel, /const startGuestCreateFromList = async \(\) =>/);
const guestCreateStart = inquiryPanel.indexOf('const startGuestCreateFromList = async () =>');
const guestCreateEnd = inquiryPanel.indexOf('const listNumber = useMemo', guestCreateStart);
assert.ok(guestCreateStart >= 0 && guestCreateEnd > guestCreateStart, 'guest create-from-list block must exist');
const guestCreateBlock = inquiryPanel.slice(guestCreateStart, guestCreateEnd);
assert.doesNotMatch(guestCreateBlock, /writeGuestAccess\(null\)|setGuestAccess\(null\)/, 'guest create-from-list must preserve verified guest access');
assert.match(guestCreateBlock, /setGuestMode\('create'\)/);
assert.match(inquiryPanel, /guestEntry === 'guest' && \(guestMode === 'create' \|\| !guestAccess\?\.token\)/, 'verified guest compose must be renderable without dropping the guest token');
assert.match(inquiryPanel, /guestAccess\?\.token && guestMode !== 'create'/, 'verified guest list/detail must yield to compose while keeping access');

console.log('[phase34-user-community-history-smoke] PASS');
