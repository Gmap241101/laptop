import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const routes = read('src/routing/appRoutes.js');
const shell = read('src/user/UserShell.jsx');
const bootstrap = read('src/user/UserHomeBootstrapScreen.jsx');
const workspace = read('src/user/UserWorkspace.jsx');
const context = read('src/context/appContextSlices.js');
const settings = read('src/utils/systemSettings.js');
const adminSettings = read('src/admin/AdminSettingsPanel.jsx');
const panel = read('src/user/UserRentalStatusPanel.jsx');
const sectionNav = read('src/user/UserRentalStatusSectionNav.jsx');
const historyPanel = read('src/user/UserRequestHistoryPanel.jsx');
const readService = read('src/features/requests/memberRentalStatusReadService.js');
const client = read('src/clerk/clerkStagingClient.js');

assert.ok(routes.includes("rentalStatus: '/rental-status'"));
assert.ok(routes.includes("'rentalStatus'"), 'rental status must be in protected/login-return route contracts');
assert.ok(routes.includes("pathname === '/rental-status'"));
assert.ok(workspace.includes("import('./UserRentalStatusPanel.jsx')"));
assert.ok(workspace.includes("userTab === 'rentalStatus'"));
assert.ok(context.includes("rentalStatus: contextKeys('data goToProtectedUserTab siteSettings triggerToast')"));
assert.match(context, /history: contextKeys\('[^']*goToProtectedUserTab[^']*siteSettings[^']*'\)/, 'history panel context must receive site settings for the shared rental-status navigation');

assert.ok(shell.includes("goToProtectedUserTab('rentalStatus')"));
assert.ok(shell.includes('대여현황'));
assert.ok(shell.includes('나의 신청내역'));
assert.ok(shell.includes('전체 대여현황'));
assert.ok(shell.includes('gap-5 lg:flex lg:w-auto lg:gap-12 xl:gap-14'), 'three top-level service menus should restore the established site spacing');
assert.ok(shell.includes('className="flex items-center gap-2"'), 'global authentication controls must stay grouped and separated by the established top-level gap');
assert.ok(shell.includes("['history', 'rentalStatus'].includes(userTab)"), 'history and calendar must share the rental-status parent active state');
assert.ok(shell.includes('normalizedSiteSettings.memberRentalStatusEnabled !== false'));
assert.ok(bootstrap.includes('href="/history"'));
assert.ok(bootstrap.includes('href="/rental-status"'));
assert.ok(bootstrap.includes('나의 신청내역'));
assert.ok(bootstrap.includes('전체 대여현황'));
assert.ok(bootstrap.includes('memberRentalStatusEnabled !== false'));
assert.ok(sectionNav.includes('aria-label="대여현황 세부메뉴"'));
assert.ok(sectionNav.includes('나의 신청내역') && sectionNav.includes('전체 대여현황'));
assert.ok(historyPanel.includes('activeTab="history"'));
assert.ok(historyPanel.includes('나의 신청내역'));
assert.ok(panel.includes('activeTab="rentalStatus"'));

assert.ok(settings.includes('memberRentalStatusEnabled: true'));
assert.ok(adminSettings.includes('회원용 대여현황 공개'));
assert.ok(adminSettings.includes('siteDraft.memberRentalStatusEnabled'));

assert.ok(panel.includes('전체 대여현황'));
assert.ok(panel.includes('전체 자산'));
assert.ok(panel.includes('선택 자산'));
assert.ok(panel.includes('조회 기기 선택'));
assert.ok(panel.includes('현재 목록 전체 선택'));
assert.ok(panel.includes('전체 해제'));
assert.ok(panel.includes('반납완료'));
assert.ok(panel.includes('연체반납'));
assert.ok(panel.includes('연체중'));
assert.ok(panel.includes('내 신청'));
assert.ok(panel.includes('나의 신청내역 보기'));
assert.ok(panel.includes('반납 예정일'));
assert.ok(panel.includes('실제 반납일'));
assert.ok(panel.includes('전체 이용기간에 대표 상태로 표시됩니다'));
assert.ok(panel.includes('setMonth((current) => shiftMonth(current, -1))'), 'previous-month navigation must remain unbounded so past months are reachable');
assert.ok(panel.includes('RentalStatusBoard'), 'existing rental status board style must be reused');
assert.ok(panel.includes('ModalPortal'), 'existing modal portal must be reused');
assert.ok(panel.includes('mk-form-focus'), 'existing form focus styling must be reused');
assert.ok(panel.includes('localStorage.setItem(SELECTED_ASSET_STORAGE_KEY'));
assert.ok(!panel.includes('setInterval(') && !readService.includes('setInterval('), 'member calendar must not poll PostgreSQL');
assert.ok(!panel.includes('requesterName') && !panel.includes('requesterEmail') && !panel.includes('requesterPhone') && !panel.includes('purpose'), 'other-member personal data must not be rendered');

assert.ok(readService.includes('CACHE_TTL_MS = 30000'));
assert.ok(readService.includes('monthPending'));
assert.ok(client.includes("path: `/api/users/me/rental-status?month=${encodeURIComponent(normalizedMonth)}`"));
assert.ok(client.includes("result?.authority !== 'postgresql'"));

console.log('Phase 34 member rental status frontend smoke: PASS');
