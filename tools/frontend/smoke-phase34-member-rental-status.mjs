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
const readService = read('src/features/requests/memberRentalStatusReadService.js');
const client = read('src/clerk/clerkStagingClient.js');

assert.ok(routes.includes("rentalStatus: '/rental-status'"));
assert.ok(routes.includes("'rentalStatus'"), 'rental status must be in protected/login-return route contracts');
assert.ok(routes.includes("pathname === '/rental-status'"));
assert.ok(workspace.includes("import('./UserRentalStatusPanel.jsx')"));
assert.ok(workspace.includes("userTab === 'rentalStatus'"));
assert.ok(context.includes("rentalStatus: contextKeys('data goToProtectedUserTab siteSettings triggerToast')"));

assert.ok(shell.includes("goToProtectedUserTab('rentalStatus')"));
assert.ok(shell.includes('대여현황'));
assert.ok(shell.includes('gap-2 lg:flex lg:w-auto xl:gap-3'), 'service navigation spacing must be compacted to accommodate the new menu');
assert.ok(shell.includes('ml-6 flex items-center gap-2 xl:ml-8'), 'global authentication controls must retain deliberate separation from service menus');
assert.ok(shell.includes('normalizedSiteSettings.memberRentalStatusEnabled !== false'));
assert.ok(bootstrap.includes('href="/rental-status"'));
assert.ok(bootstrap.includes('memberRentalStatusEnabled !== false'));

assert.ok(settings.includes('memberRentalStatusEnabled: true'));
assert.ok(adminSettings.includes('회원용 대여현황 공개'));
assert.ok(adminSettings.includes('siteDraft.memberRentalStatusEnabled'));

assert.ok(panel.includes('기기 대여현황'));
assert.ok(panel.includes('전체 자산'));
assert.ok(panel.includes('선택 자산'));
assert.ok(panel.includes('조회 기기 선택'));
assert.ok(panel.includes('현재 목록 전체 선택'));
assert.ok(panel.includes('전체 해제'));
assert.ok(panel.includes('반납완료'));
assert.ok(panel.includes('연체반납'));
assert.ok(panel.includes('연체중'));
assert.ok(panel.includes('내 신청'));
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
