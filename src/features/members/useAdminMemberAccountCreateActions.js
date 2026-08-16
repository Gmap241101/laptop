import { useCallback, useRef, useState } from 'react';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  buildDomesticPhoneNumber,
  isValidDomesticPhoneNumber,
  isValidEmailAddress,
  isValidMemberName,
  isValidMemberPassword,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';

const ERROR_MESSAGE_BY_CODE = {
  admin_authority_required: '관리자 인증 상태를 확인해 주세요.',
  admin_member_email_invalid: '이메일 주소 형식이 정확하지 않습니다.',
  admin_member_profile_invalid: '성명, 부서/팀, 연락처를 다시 확인해 주세요.',
  member_email_already_registered: '이미 등록된 이메일입니다.',
  member_identity_already_claimed: '같은 성명과 부서/팀으로 이용 중인 회원이 이미 있습니다.',
  user_clerk_password_too_short: '초기 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.',
};

export default function useAdminMemberAccountCreateActions({
  isAdminAuthenticated,
  triggerToast,
  onCreated,
}) {
  const triggerToastRef = useRef(triggerToast);
  const onCreatedRef = useRef(onCreated);
  triggerToastRef.current = triggerToast;
  onCreatedRef.current = onCreated;
  const [saving, setSaving] = useState(false);

  const createAdminMemberAccount = useCallback(async (form = {}) => {
    if (!isAdminAuthenticated) {
      triggerToastRef.current('관리자 인증 상태를 확인해 주세요.', 'error');
      return null;
    }

    const email = normalizeEmailAddress(form.email);
    const name = normalizeMemberName(form.name);
    const team = normalizeMemberTeam(form.team);
    const phoneParts = {
      prefix: form.phonePrefix,
      middle: form.phoneMiddle,
      last: form.phoneLast,
    };
    const password = String(form.password || '');
    const passwordConfirm = String(form.passwordConfirm || '');

    if (!isValidEmailAddress(email)) {
      triggerToastRef.current('이메일 주소 형식이 정확하지 않습니다.', 'error');
      return null;
    }
    if (!isValidMemberName(name)) {
      triggerToastRef.current('성명은 한글 또는 영문 2~30자로 입력해 주세요.', 'error');
      return null;
    }
    if (!team) {
      triggerToastRef.current('부서/팀을 입력해 주세요.', 'error');
      return null;
    }
    if (!isValidDomesticPhoneNumber(phoneParts)) {
      triggerToastRef.current('연락처를 정확히 입력해 주세요.', 'error');
      return null;
    }
    if (!isValidMemberPassword(password)) {
      triggerToastRef.current('초기 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.', 'error');
      return null;
    }
    if (password !== passwordConfirm) {
      triggerToastRef.current('초기 비밀번호 확인이 일치하지 않습니다.', 'error');
      return null;
    }

    setSaving(true);
    try {
      const payload = await clerkStagingClient.createAdminMember({
        email,
        name,
        team,
        phone: buildDomesticPhoneNumber(phoneParts),
        password,
      });
      const result = payload?.adminMemberCreate || {};
      triggerToastRef.current(
        result.status === 'pending'
          ? '회원이 등록되었습니다. 탈퇴 이력이 있는 재가입 계정이므로 승인 대기 상태로 생성했습니다.'
          : '회원이 등록되었습니다. 사용자는 초기 비밀번호로 로그인한 뒤 약관에 직접 동의합니다.',
        'success'
      );
      onCreatedRef.current?.(result);
      return result;
    } catch (error) {
      console.error('Admin member create error:', error);
      triggerToastRef.current(
        ERROR_MESSAGE_BY_CODE[error?.code] || `회원 등록에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`,
        'error'
      );
      return null;
    } finally {
      setSaving(false);
    }
  }, [isAdminAuthenticated]);

  return {
    adminMemberAccountCreating: saving,
    createAdminMemberAccount,
  };
}
