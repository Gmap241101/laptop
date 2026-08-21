import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const BREAKPOINT = 'min-[1200px]';

const [
  shell,
  rentalStatusBoard,
  workspace,
  dashboard,
  requests,
  assets,
  settings,
  members,
  admins,
] = await Promise.all([
  read('src/admin/AdminShell.jsx'),
  read('src/components/RentalStatusBoard.jsx'),
  read('src/admin/AdminWorkspace.jsx'),
  read('src/admin/AdminDashboardPanel.jsx'),
  read('src/admin/AdminRequestsPanel.jsx'),
  read('src/admin/AdminAssetsPanel.jsx'),
  read('src/admin/AdminSettingsPanel.jsx'),
  read('src/admin/AdminMemberAccountsPanel.jsx'),
  read('src/admin/AdminAccountsPanel.jsx'),
]);

assert.match(shell, /<main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">/, 'administrator main width must remain max-w-7xl with existing desktop padding');
assert.match(shell, /desktopGridClassName="min-\[1200px\]:grid-cols-6"/, 'administrator global rental status board must use six columns at 1200px');
assert.match(rentalStatusBoard, /desktopGridClassName = 'xl:grid-cols-6'/, 'shared rental status board must preserve the existing xl default for the user screen');
assert.match(workspace, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/, 'administrator desktop shell must retain the 260px navigation rail at lg and above');

assert.ok(dashboard.includes(`${BREAKPOINT}:grid-cols-4`), 'dashboard priority metrics must use the desktop four-column layout on 4:3 PC widths');
assert.ok(dashboard.includes(`${BREAKPOINT}:grid-cols-6`), 'dashboard asset status must use the desktop six-column layout on 4:3 PC widths');
assert.ok(dashboard.includes(`${BREAKPOINT}:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]`), 'dashboard main operational split must activate on 4:3 PC widths');
assert.ok(dashboard.includes(`${BREAKPOINT}:grid-cols-2`), 'dashboard desktop paired sections must activate on 4:3 PC widths');

assert.ok(requests.includes(`${BREAKPOINT}:block`), 'rental request desktop table must activate at 1200px');
assert.ok(requests.includes(`${BREAKPOINT}:hidden`), 'rental request card fallback must hide at 1200px');
assert.equal(requests.includes('xl:block'), false, 'rental request table must no longer wait for the 1280px xl breakpoint');
assert.equal(requests.includes('xl:hidden'), false, 'rental request card fallback must no longer wait for the 1280px xl breakpoint');

assert.ok(assets.includes(`${BREAKPOINT}:grid-cols-3`), 'asset management must restore the desktop three-column asset grid at 1200px');

assert.ok(settings.includes(`${BREAKPOINT}:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]`), 'site basic settings must restore its desktop two-column composition at 1200px');
assert.ok(settings.includes(`${BREAKPOINT}:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]`), 'site operations settings must restore its desktop two-column composition at 1200px');
assert.ok(settings.includes(`${BREAKPOINT}:grid-cols-3`), 'system data cards must use their desktop three-column layout at 1200px');

for (const [label, source] of [['member accounts', members], ['administrator accounts', admins]]) {
  assert.ok(source.includes(`${BREAKPOINT}:grid-cols-4`), `${label} summary metrics must use four columns at 1200px`);
  assert.ok(source.includes(`${BREAKPOINT}:block`), `${label} desktop table must activate at 1200px`);
  assert.ok(source.includes(`${BREAKPOINT}:hidden`), `${label} card fallback must hide at 1200px`);
  assert.equal(source.includes('xl:block'), false, `${label} table must no longer wait for xl`);
  assert.equal(source.includes('xl:hidden'), false, `${label} card fallback must no longer wait for xl`);
}

console.log('[phase34-admin-4x3-desktop-layout-frontend-smoke] PASS');
