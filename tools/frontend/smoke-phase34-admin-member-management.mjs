import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panel, createDialog, editDialog, identityFields, createActions, editActions, controller, client, detail, statusActions, contextSlices] = await Promise.all([
  readFile(new URL('../../src/admin/AdminMemberAccountsPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountCreateDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountEditDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberDirectoryIdentityFields.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountCreateActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountEditActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountsController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountDetailPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountStatusActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/context/appContextSlices.js', import.meta.url), 'utf8'),
]);

assert.match(panel, /\['current', '전체 회원'\]/);
assert.match(panel, /\['retired', '탈퇴 회원'\]/);
assert.match(panel, /bg-orange-500 text-white shadow-sm/);
assert.match(panel, /회원 신규 등록/);
assert.match(panel, /accountStatus === USER_PROFILE_STATUS\.RETIRED/);
assert.match(panel, /탈퇴 완료/);
assert.doesNotMatch(panel, /<option value=\{USER_PROFILE_STATUS\.RETIRED\}>/);
assert.match(createDialog, /이메일 OTP 인증은 받지 않으며/);
assert.match(createDialog, /약관은 사용자가 첫 로그인에서 직접 동의/);
assert.match(createDialog, /초기 비밀번호/);
assert.match(createDialog, /AdminMemberDirectoryIdentityFields/);
assert.match(editDialog, /AdminMemberDirectoryIdentityFields/);
assert.match(identityFields, /지정된 부서·사용자 명부 사용/);
assert.match(identityFields, /회원 가입 정책에서 명부 사용이 활성화되어 있습니다/);
assert.match(identityFields, /\{policyEnabled \? \(/);
assert.match(identityFields, /const managed = Boolean\(policyEnabled\) && form\.useManagedDirectory !== false/);
assert.match(identityFields, /useManagedDirectory/);
assert.match(createDialog, /createInitialForm\(memberDirectoryPolicyEnabled\)/);
assert.match(createDialog, /policyEnabled=\{memberDirectoryPolicyEnabled\}/);
assert.match(editDialog, /Boolean\(memberDirectoryPolicyEnabled\) && !account\?\.directoryOverrideByAdmin/);
assert.match(editDialog, /policyEnabled=\{memberDirectoryPolicyEnabled\}/);
assert.match(createActions, /directoryOverrideByAdmin: Boolean\(memberDirectoryPolicyEnabled && form\.useManagedDirectory === false\)/);
assert.match(editActions, /directoryOverrideByAdmin = Boolean\(memberDirectoryPolicyEnabled && form\?\.useManagedDirectory === false\)/);
assert.match(contextSlices, /memberAccounts: contextKeys\('[^']*memberDirectoryBorrowers[^']*memberDirectoryPolicyEnabled[^']*memberDirectoryTeams/);
assert.match(createActions, /clerkStagingClient\.createAdminMember/);
assert.match(controller, /statusFilter === 'all'\s*\? 'current'/);
assert.match(controller, /accountView === 'retired'/);
assert.match(client, /requestAdminMemberCreatePostgresql/);
assert.match(detail, /재가입은 항상 새 계정으로 처리/);
assert.match(detail, /회원 완전 삭제/);
for (const marker of ['confirmPendingMemberRejection','confirmMemberRetirement','confirmRetiredMemberPurge','rejectAdminPendingMember','retireAdminMember','purgeAdminRetiredMember']) assert.ok(statusActions.includes(marker), marker);

console.log('[phase34-admin-member-management-frontend-smoke] PASS');
