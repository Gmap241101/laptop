import { useCallback, useState } from 'react';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { isValidMemberPassword } from '../../utils/memberPolicy.js';

const errorMessage = (error) => {
  const code = String(error?.code || '');
  const map = {
    admin_authority_required: '관리자 인증이 필요합니다.',
    member_account_not_found: '회원 계정을 찾을 수 없습니다.',
    admin_member_password_retired_forbidden: '탈퇴 회원의 비밀번호는 변경할 수 없습니다.',
    admin_member_password_clerk_link_missing: '회원의 Clerk 로그인 계정 연결정보가 없습니다.',
    user_clerk_password_too_short: '새 비밀번호는 8자 이상이어야 합니다.',
  };
  return map[code] || '회원 비밀번호를 변경하지 못했습니다.';
};

export default function useAdminMemberAccountPasswordActions({
  isAdminAuthenticated,
  triggerToast,
}) {
  const [savingUid, setSavingUid] = useState('');

  const changeAdminMemberPassword = useCallback(async ({ account, password, passwordConfirm }) => {
    if (!isAdminAuthenticated || !account?.uid) {
      triggerToast('관리자 인증 후 회원 비밀번호를 변경할 수 있습니다.', 'error');
      return false;
    }
    if (!isValidMemberPassword(password)) {
      triggerToast('새 비밀번호는 영문과 숫자를 포함해 8자 이상으로 입력해 주세요.', 'error');
      return false;
    }
    if (password !== passwordConfirm) {
      triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
      return false;
    }

    setSavingUid(account.uid);
    try {
      await clerkStagingClient.changeAdminMemberPassword(account.uid, password);
      triggerToast(`[${account.name || account.email || '회원'}] 비밀번호가 변경되었습니다.`, 'success');
      return true;
    } catch (error) {
      console.error('Admin member password change error:', error);
      triggerToast(errorMessage(error), 'error');
      return false;
    } finally {
      setSavingUid('');
    }
  }, [isAdminAuthenticated, triggerToast]);

  return { changeAdminMemberPassword, adminMemberPasswordSavingUid: savingUid };
}
