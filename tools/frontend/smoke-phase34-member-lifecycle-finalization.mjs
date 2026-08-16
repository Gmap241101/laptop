import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [panel, actions, detail, client] = await Promise.all([
  readFile(new URL('../../src/admin/AdminMemberAccountsPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/features/members/useAdminMemberAccountStatusActions.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/admin/AdminMemberAccountDetailPanel.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/clerk/clerkStagingClient.js', import.meta.url), 'utf8'),
]);
for (const marker of ['가입 승인','가입 거절','이용 차단','이용 재개','이용 종료','회원 완전 삭제']) assert.ok(panel.includes(marker), marker);
for (const marker of ['rejectAdminPendingMember','retireAdminMember','purgeAdminRetiredMember','삭제 후 동일 이메일은 완전한 신규 회원']) assert.ok(actions.includes(marker), marker);
assert.match(detail, /회원 완전 삭제/);
assert.match(client, /requestAdminMemberLifecycleMutation/);
assert.match(panel, /operation === 'reject' \|\| operation === 'retire' \|\| operation === 'purge'/);
assert.doesNotMatch(panel, /accountStatus === USER_PROFILE_STATUS\.PENDING[\s\S]{0,900}이용 차단/);

assert.match(panel, /탈퇴 회원 관리 지침/);
assert.match(panel, /퇴사일로부터 최대 1년 이내/);
assert.match(panel, /자동 삭제 기능은 사용하지 않습니다/);
assert.match(actions, /재가입 승인/);
assert.match(actions, /이전 업무기록은 현재 계정으로 이관되고 기존 탈퇴 계정은 삭제되었습니다/);
assert.match(actions, /기존 탈퇴 계정의 대여·제재 등 업무기록을 현재 계정으로 이관한 뒤 기존 탈퇴 계정과 과거 개인정보·약관·계정 연결 기록을 자동 삭제/);
console.log('[phase34-member-lifecycle-finalization-frontend-smoke] PASS');
