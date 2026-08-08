import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [panel, controller, dialog, editActions, diagnostics, statusActions] = await Promise.all([
  read('src/admin/AdminMemberAccountsPanel.jsx'),
  read('src/features/members/useAdminMemberAccountsController.js'),
  read('src/admin/AdminMemberAccountEditDialog.jsx'),
  read('src/features/members/useAdminMemberAccountEditActions.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/features/members/useAdminMemberAccountStatusActions.js'),
]);

assert(
  controller.includes('ADMIN_MEMBER_ACCOUNT_PAGE_SIZE_OPTIONS = Object.freeze([10, 30, 50])'),
  'Member account page-size options must be 10/30/50.'
);
assert(controller.includes('firestoreLimit(pageSize + 1)'), 'Browse query must use selected pageSize.');
assert(controller.includes('targetMatchCount: page * pageSize + 1'), 'Search query must use selected pageSize.');
assert(panel.includes('페이지당 표시'), 'Member account panel must expose page-size selector.');
assert(panel.includes('번호') && panel.includes('활성여부') && panel.includes('가입일시'), 'Desktop member table columns are incomplete.');
assert(panel.includes('이용 재개 / 차단') && panel.includes('이용 종료'), 'Member status action columns are incomplete.');
assert(panel.includes('table-fixed'), 'Desktop member list must use fixed table layout.');
assert(panel.includes('AdminMemberAccountEditDialog'), 'Member edit dialog must be wired to the list.');
assert(dialog.includes('회원정보 확인 및 수정'), 'Member edit dialog heading is missing.');
assert(dialog.includes('회원정보 저장'), 'Member edit dialog save action is missing.');
assert(editActions.includes('runTransaction'), 'Admin member profile edits must preserve Firestore transaction invariants.');
assert(editActions.includes('MEMBER_IDENTITY_CLAIMS_COLLECTION_REF'), 'Admin member edit must maintain identity claims.');
assert(editActions.includes('ACCOUNT_RECOVERY_KEYS_COLLECTION_REF'), 'Admin member edit must maintain recovery keys.');
assert(editActions.includes("reason: 'admin-member-profile-edit'"), 'Admin member edit must invoke PostgreSQL write-through.');
assert(statusActions.includes('requested: Boolean(memberWriteThroughConfig.enabled)'), 'Admin status changes must write through in enabled staging mode.');
assert(diagnostics.includes("maxHeight: 'calc(100vh - 32px)'"), 'Diagnostics panel must cap viewport height.');
assert(diagnostics.includes("overflowY: 'auto'"), 'Diagnostics panel must have an internal vertical scrollbar.');
assert(diagnostics.includes('Clerk Staging Test · Phase 13'), 'Diagnostics phase label must be Phase 13.');

console.log('[phase13-admin-member-ui] PASS');
