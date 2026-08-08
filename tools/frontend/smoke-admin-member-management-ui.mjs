import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [panel, controller, detail, dialog, editActions, diagnostics, statusActions] = await Promise.all([
  read('src/admin/AdminMemberAccountsPanel.jsx'),
  read('src/features/members/useAdminMemberAccountsController.js'),
  read('src/admin/AdminMemberAccountDetailPanel.jsx'),
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
assert(panel.includes('이용 관리') && panel.includes('회원정보'), 'Consolidated member action columns are missing.');
assert(!panel.includes('>이용 재개 / 차단<'), 'Legacy split status-action table heading must be removed.');
assert(panel.includes("compactActionButtonClass = '!gap-1 !rounded-lg !px-2 !py-1 !text-[10px]'"), 'Member action buttons must use compact sizing.');
assert(panel.includes('AdminMemberAccountDetailPanel'), 'Inline member detail panel must be wired to the list.');
assert(panel.includes('toggleSelectedAccount(account)'), 'Member row click must toggle inline detail instead of opening edit immediately.');
assert(panel.includes('colSpan={7}'), 'Desktop member detail must expand as a full-width body row.');
assert(panel.includes('회원 수정'), 'Member edit action must exist beside consolidated use-management actions.');
assert(detail.includes('약관 동의 내역'), 'Inline member detail must keep terms history access.');
assert(detail.includes('대여 이력 확인'), 'Inline member detail must keep rental history access.');
assert(detail.includes('회원수정'), 'Inline member detail must expose explicit member-edit action.');
assert(detail.includes('목록에서는 조회만 하며'), 'Inline detail must make read-only behavior explicit.');
assert(dialog.includes('회원정보 수정'), 'Member edit dialog heading is missing.');
assert(dialog.includes('회원정보 저장'), 'Member edit dialog save action is missing.');
assert(!dialog.includes('약관 동의 내역') && !dialog.includes('대여 이력 확인'), 'Edit popup must not own terms/history actions anymore.');
assert(editActions.includes('runTransaction'), 'Admin member profile edits must preserve Firestore transaction invariants.');
assert(editActions.includes('MEMBER_IDENTITY_CLAIMS_COLLECTION_REF'), 'Admin member edit must maintain identity claims.');
assert(editActions.includes('ACCOUNT_RECOVERY_KEYS_COLLECTION_REF'), 'Admin member edit must maintain recovery keys.');
assert(editActions.includes("reason: 'admin-member-profile-edit'"), 'Admin member edit must invoke PostgreSQL write-through.');
assert(statusActions.includes('requested: Boolean(memberWriteThroughConfig.enabled)'), 'Admin status changes must write through in enabled staging mode.');
assert(diagnostics.includes("maxHeight: 'calc(100vh - 32px)'"), 'Diagnostics panel must cap viewport height.');
assert(diagnostics.includes("overflowY: 'auto'"), 'Diagnostics panel must have an internal vertical scrollbar.');
assert(diagnostics.includes('Clerk Staging Test · Phase 13'), 'Diagnostics phase label must remain Phase 13 for this UI refinement.');

console.log('[phase13-admin-member-ui] PASS');
