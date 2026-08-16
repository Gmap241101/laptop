import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  panel,
  createDialog,
  editDialog,
  passwordDialog,
  controller,
  client,
  workspace,
  adminApp,
  userApp,
  contextSlices,
  renderAdminRoot,
  adminBoundary,
] = await Promise.all([
  readFile(new URL('../../src/admin/AdminAccountsPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminAccountCreateDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminAccountEditDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminManagedPasswordDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/auth/useAdminAccountManagementController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminWorkspace.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminApp.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/UserApp.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/context/appContextSlices.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/bootstrap/renderAdminRoot.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminPanelRuntimeErrorBoundary.jsx', import.meta.url), 'utf8'),
]);

assert.match(workspace, /\['adminAccounts',\s*ShieldCheck,\s*'관리자 계정 관리'\]/);
assert.doesNotMatch(workspace, /\['adminAccounts',\s*ShieldCheck,\s*'관리자 ID 관리'\]/);
assert.match(panel, /title="관리자 계정 관리"/);
assert.match(panel, /관리자 계정 신규 등록/);
assert.match(panel, /<table className="w-full table-fixed border-collapse text-left">/);
for (const label of ['번호', '상태', '관리자 ID', '사용자명', '조직명', '권한', '로그인 이메일', '등록일시', '계정 관리']) {
  assert.ok(panel.includes(label), `admin account list column missing: ${label}`);
}
assert.match(panel, /AdminAccountCreateDialog/);
assert.match(panel, /AdminAccountEditDialog/);
assert.doesNotMatch(panel, /관리자 ID 등록/);
assert.match(createDialog, /관리자 계정 신규 등록/);
assert.match(createDialog, /관리자 계정 등록/);
assert.match(createDialog, /기타 직접 입력/);
assert.match(editDialog, /관리자 계정 수정/);
assert.match(adminApp, /관리자 계정 관리 정보를 확인해 주세요/);
assert.match(userApp, /관리자 계정 관리 정보를 확인해 주세요/);
assert.match(contextSlices, /adminAccounts: contextKeys\('[^']*\bSearch\b[^']*'\)/);
assert.match(workspace, /AdminPanelRuntimeErrorBoundary/);
assert.match(workspace, /resetKey=\{adminTab\}/);
assert.match(renderAdminRoot, /AdminPanelRuntimeErrorBoundary/);
assert.match(adminBoundary, /admin_panel_render_failed/);

// Password changes are a dedicated Clerk mutation/modal, not an inline profile field.
assert.match(editDialog, /로그인 비밀번호/);
assert.match(editDialog, /비밀번호 수정/);
assert.match(editDialog, /onPasswordChange/);
assert.match(editDialog, /다른 관리자 계정의 비밀번호는 최고 관리자만 변경할 수 있습니다/);
assert.doesNotMatch(editDialog, /label="새 비밀번호"/);
assert.match(panel, /AdminManagedPasswordDialog/);
assert.match(passwordDialog, /새 비밀번호/);
assert.match(passwordDialog, /새 비밀번호 확인/);
assert.match(controller, /changeAdminAccountPasswordPostgresql/);
assert.match(client, /\/api\/admin\/accounts\/\$\{encodeURIComponent\(accountKey\)\}\/password/);

// List footer contract: result summary left, paginator center, create action right.
assert.match(panel, /sm:grid-cols-\[1fr_auto_1fr\]/);
assert.match(panel, /검색 결과 \{filteredAdminAccounts\.length\}건 · \{displayAdminAccountPage\} \/ \{adminAccountTotalPages\}페이지/);
assert.match(panel, /\{displayAdminAccountPage\} \/ \{adminAccountTotalPages\}/);
assert.match(panel, /sm:justify-self-end[\s\S]*관리자 계정 신규 등록/);

console.log('[phase34-admin-account-management-frontend-smoke] PASS');
