import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [
  panel,
  createDialog,
  editDialog,
  identityFields,
  passwordDialog,
  passwordActions,
  createActions,
  editActions,
  controller,
  rentalSubscription,
  client,
  detail,
  statusActions,
  contextSlices,
  historyDialog,
  historyService,
  homeManagement,
  settingsPanel,
  signupPolicyPanel,
] = await Promise.all([
  readFile(new URL('../../src/admin/AdminMemberAccountsPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountCreateDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountEditDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberDirectoryIdentityFields.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminManagedPasswordDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountPasswordActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountCreateActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountEditActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountsController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountDetailPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountStatusActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/context/appContextSlices.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberRentalHistoryDialog.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/memberAccountHistoryService.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminHomeManagementPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminSettingsPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminSignupPolicyPanel.jsx', import.meta.url), 'utf8'),
]);

assert.match(panel, /\['current', '전체 회원'\]/);
assert.match(panel, /\['retired', '탈퇴 회원'\]/);
assert.match(panel, /border-orange-500 bg-orange-500 text-white shadow-sm/);
assert.match(panel, /border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600/);
assert.doesNotMatch(panel, /탈퇴 회원 관리 지침/);
assert.doesNotMatch(panel, /이용 종료 후 회원정보와 과거 업무기록을 보존 중인 회원입니다/);
assert.match(homeManagement, /border-orange-500 bg-orange-500 text-white shadow-sm/);
assert.match(homeManagement, /border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600/);
assert.match(settingsPanel, /border-orange-500 bg-orange-500 text-white shadow-sm/);
assert.match(settingsPanel, /border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600/);
assert.doesNotMatch(settingsPanel, /activeTab === key[\s\S]{0,120}bg-slate-900 text-white/);
assert.match(signupPolicyPanel, /border-orange-500 bg-orange-500 text-white shadow-sm/);
assert.match(signupPolicyPanel, /border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600/);
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
assert.match(identityFields, /const memberOptions = useMemo/);
assert.match(identityFields, /normalize\(borrower\?\.team\) === normalize\(form\.team\)/);
assert.match(identityFields, /value=\{normalize\(borrower\.name\)\}/);
assert.match(createDialog, /createInitialForm\(memberDirectoryPolicyEnabled\)/);
assert.match(createDialog, /policyEnabled=\{memberDirectoryPolicyEnabled\}/);
assert.match(editDialog, /Boolean\(memberDirectoryPolicyEnabled\) && !account\?\.directoryOverrideByAdmin/);
assert.match(editDialog, /policyEnabled=\{memberDirectoryPolicyEnabled\}/);
assert.match(createActions, /directoryOverrideByAdmin: Boolean\(memberDirectoryPolicyEnabled && form\.useManagedDirectory === false\)/);
assert.match(editActions, /directoryOverrideByAdmin = Boolean\(memberDirectoryPolicyEnabled && form\?\.useManagedDirectory === false\)/);
assert.match(contextSlices, /memberAccounts: contextKeys\('[^']*memberDirectoryBorrowers[^']*memberDirectoryPolicyEnabled[^']*memberDirectoryTeams/);
assert.match(rentalSubscription, /\['people', 'signupPolicy', 'memberAccounts', 'adminAccounts'\]\.includes\(adminTab\)/);
assert.match(rentalSubscription, /clerkStagingClient\.getAdminMemberDirectory\(\)/);
assert.match(rentalSubscription, /name: String\(entry\?\.name \|\| ''\)/);
assert.match(createActions, /clerkStagingClient\.createAdminMember/);
assert.match(controller, /statusFilter === 'all'\s*\? 'current'/);
assert.match(controller, /accountView === 'retired'/);
assert.match(client, /requestAdminMemberCreatePostgresql/);
assert.match(detail, /재가입은 항상 새 계정으로 처리/);
assert.match(detail, /회원 완전 삭제/);
for (const marker of ['confirmPendingMemberRejection','confirmMemberRetirement','confirmRetiredMemberPurge','rejectAdminPendingMember','retireAdminMember','purgeAdminRetiredMember']) assert.ok(statusActions.includes(marker), marker);

// Password changes are intentionally separated from profile saves.
assert.match(editDialog, /로그인 비밀번호 수정/);
assert.match(editDialog, /비밀번호 수정/);
assert.doesNotMatch(editDialog, /회원 개인정보 저장과 분리하여 별도 비밀번호 수정 모달에서 변경합니다/);
assert.match(editDialog, /shrink-0 whitespace-nowrap/);
assert.match(editDialog, /onPasswordChange/);
assert.doesNotMatch(editDialog, /새 비밀번호 확인/);
assert.match(panel, /AdminManagedPasswordDialog/);
assert.match(panel, /useAdminMemberAccountPasswordActions/);
assert.match(passwordDialog, /새 비밀번호/);
assert.match(passwordDialog, /새 비밀번호 확인/);
assert.match(passwordActions, /clerkStagingClient\.changeAdminMemberPassword/);
assert.match(client, /\/api\/admin\/members\/\$\{encodeURIComponent\(uid\)\}\/password/);



// Member rental history must use the PostgreSQL authority and render in a dedicated modal.
assert.match(panel, /AdminMemberRentalHistoryDialog/);
assert.match(panel, /onOpenHistory=\{\(\) => setHistoryAccount\(account\)\}/);
assert.match(detail, /onClick=\{onOpenHistory\}[\s\S]*대여 이력 확인/);
assert.match(detail, /onClick=\{onBack\}[\s\S]*목록으로/);
assert.equal(detail.includes('historySummary'), false, 'member detail must not retain the old inline history summary');
assert.equal(detail.includes('대여 이력을 불러오지 못했습니다.'), false, 'member detail must not load rental history inline');
assert.equal(panel.includes('회원 상세 ·'), false, 'selected member detail must not keep the old gray heading section above the detail card');
assert.match(historyDialog, /회원 대여 이력/);
assert.match(historyDialog, /전체 대여/);
assert.match(historyDialog, /<table/);
assert.match(historyDialog, /대여 기간/);
assert.match(historyService, /clerkStagingClient\.getAdminMemberRentalHistory\(uid\)/);
assert.equal(historyService.includes('retiredLegacyDataCompat'), false, 'member rental history must not read the retired Firestore compatibility store');
assert.equal(/getDocs|RENTAL_REQUESTS_COLLECTION_REF/.test(historyService), false, 'member rental history must not execute Firestore-shaped reads');
assert.match(client, /\/api\/admin\/members\/\$\{encodeURIComponent\(targetUid\)\}\/rental-history/);

// List footer contract: result summary left, paginator center, create action right.
assert.match(panel, /sm:grid-cols-\[1fr_auto_1fr\]/);
assert.match(panel, /검색 결과 \{adminUserAccountResultCount\}건 · \{safeAdminUserAccountPage\} \/ \{adminUserAccountTotalPages\}페이지/);
assert.match(panel, /\{safeAdminUserAccountPage\} \/ \{adminUserAccountTotalPages\}/);
assert.match(panel, /sm:justify-self-end[\s\S]*회원 신규 등록/);

console.log('[phase34-admin-member-management-frontend-smoke] PASS');
