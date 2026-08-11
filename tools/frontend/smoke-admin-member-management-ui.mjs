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
assert(controller.includes('adminUserAccountResultCount: resultCount'), 'Member controller must expose result count for request-style pagination summary.');
assert(panel.includes('페이지당 표시'), 'Member account panel must expose page-size selector.');
assert(
  panel.includes('md:grid-cols-[minmax(0,1fr)_160px_140px]'),
  'Member search field must consume the remaining toolbar width like the admin request toolbar.'
);
assert(panel.includes('번호') && panel.includes('활성여부') && panel.includes('가입일시'), 'Desktop member table columns are incomplete.');
assert(panel.includes('이용 관리') && panel.includes('회원정보'), 'Consolidated member action columns are missing.');
assert(!panel.includes('>이용 재개 / 차단<'), 'Legacy split status-action table heading must be removed.');
assert(panel.includes("compactActionButtonClass = '!gap-1 !rounded-lg !px-2 !py-1 !text-[10px]'"), 'Member action buttons must use compact sizing.');
assert(panel.includes('AdminMemberAccountDetailPanel'), 'Member detail body must be wired to the member management view.');
assert(panel.includes('onClick={() => setSelectedAccount(account)}'), 'Member row click must select a dedicated detail body.');
assert(panel.includes('selectedAccount ? ('), 'Selected member must switch the management body from list mode to detail mode.');
assert(panel.includes('목록으로'), 'Dedicated member detail body must provide a list-return action.');
assert(!panel.includes('colSpan={7}'), 'Member detail must not render as an inline table expansion row.');
assert(!panel.includes('서버 커서 페이지'), 'Legacy server-cursor footer copy must be removed.');
assert(panel.includes('검색 결과 {adminUserAccountResultCount}건'), 'Pagination summary must use the admin-request list style.');
assert(panel.includes('회원 수정'), 'Member edit action must remain available beside consolidated use-management actions.');
assert(detail.includes('약관 동의 내역'), 'Member detail body must keep terms history access.');
assert(detail.includes('대여 이력 확인'), 'Member detail body must keep rental history access.');
assert(detail.includes('회원수정'), 'Member detail body must expose explicit member-edit action.');
assert(detail.includes('회원정보를 조회하는 상세 본문입니다.'), 'Member detail must explicitly be a read-only detail body.');
assert(!detail.includes('aria-label="회원 상세 닫기"'), 'Inline expansion close control must be removed from the dedicated detail body.');
assert(dialog.includes('회원정보 수정'), 'Member edit dialog heading is missing.');
assert(dialog.includes('회원정보 저장'), 'Member edit dialog save action is missing.');
assert(!dialog.includes('약관 동의 내역') && !dialog.includes('대여 이력 확인'), 'Edit popup must not own terms/history actions anymore.');
assert(editActions.includes('runTransaction'), 'Admin member profile edits must preserve Firestore transaction invariants.');
assert(editActions.includes('MEMBER_IDENTITY_CLAIMS_COLLECTION_REF'), 'Admin member edit must maintain identity claims.');
assert(editActions.includes('ACCOUNT_RECOVERY_KEYS_COLLECTION_REF'), 'Admin member edit must maintain recovery keys.');
assert(editActions.includes("reason: 'admin-member-profile-edit'"), 'Admin member edit must invoke PostgreSQL write-through.');
assert(statusActions.includes('requested: Boolean(memberWriteThroughConfig.enabled)'), 'Admin status changes must write through in enabled staging mode.');
assert(diagnostics.includes("top: '184px'") && diagnostics.includes("maxHeight: 'calc(100vh - 200px)'"), 'Diagnostics panel must start below toast area and cap viewport height.');
assert(diagnostics.includes("overflowY: 'auto'"), 'Diagnostics panel must have an internal vertical scrollbar.');
assert(/Clerk Staging Test · Phase (13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29)/.test(diagnostics), 'Diagnostics must retain a recognized staging phase label after later phases.');

console.log('[phase13-admin-member-ui] PASS');
