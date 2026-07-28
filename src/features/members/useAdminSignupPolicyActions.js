import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  PUBLIC_CONFIG_DOC_REF,
} from '../../firebase.js';
import {
  getSafeMemberDirectoryVersion,
} from './memberAccountPolicy.js';

export default function useAdminSignupPolicyActions({
  adminTab,
  isAdminAuthenticated,
  isSplitStorageReady,
  resetDirectoryMismatchRestoreAttempt,
  restoreDirectoryMismatchAccountsAfterPolicyDisabled,
  setData,
  settings,
  triggerToast,
}) {
  const triggerToastRef = useRef(triggerToast);
  const [tempRequireRegisteredMemberForSignup, setTempRequireRegisteredMemberForSignup] =
    useState(Boolean(settings.requireRegisteredMemberForSignup));
  const [tempAutoApproveNewMembers, setTempAutoApproveNewMembers] =
    useState(Boolean(settings.autoApproveNewMembers));
  const [signupPolicySaving, setSignupPolicySaving] = useState(false);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    if (adminTab !== 'signupPolicy') return;

    setTempRequireRegisteredMemberForSignup(
      Boolean(settings.requireRegisteredMemberForSignup)
    );
    setTempAutoApproveNewMembers(
      Boolean(settings.autoApproveNewMembers)
    );
  }, [
    adminTab,
    settings.autoApproveNewMembers,
    settings.requireRegisteredMemberForSignup,
  ]);

  const signupPolicyDirty = useMemo(
    () =>
      Boolean(tempRequireRegisteredMemberForSignup) !==
        Boolean(settings.requireRegisteredMemberForSignup) ||
      Boolean(tempAutoApproveNewMembers) !==
        Boolean(settings.autoApproveNewMembers),
    [
      settings.autoApproveNewMembers,
      settings.requireRegisteredMemberForSignup,
      tempAutoApproveNewMembers,
      tempRequireRegisteredMemberForSignup,
    ]
  );

  const cancelSignupPolicyChanges = useCallback(() => {
    setTempRequireRegisteredMemberForSignup(
      Boolean(settings.requireRegisteredMemberForSignup)
    );
    setTempAutoApproveNewMembers(
      Boolean(settings.autoApproveNewMembers)
    );
    triggerToastRef.current(
      '회원가입 정책 변경사항을 취소했습니다.',
      'success'
    );
  }, [
    settings.autoApproveNewMembers,
    settings.requireRegisteredMemberForSignup,
  ]);

  const saveSignupPolicyChanges = useCallback(async () => {
    if (!isAdminAuthenticated) {
      triggerToastRef.current(
        '관리자 인증 후 회원가입 정책을 저장할 수 있습니다.',
        'error'
      );
      return false;
    }

    if (!isSplitStorageReady) {
      triggerToastRef.current(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 회원가입 정책을 저장할 수 없습니다.',
        'error'
      );
      return false;
    }

    const nextRequireRegistered = Boolean(
      tempRequireRegisteredMemberForSignup
    );
    const nextAutoApprove =
      nextRequireRegistered && Boolean(tempAutoApproveNewMembers);
    const policyEnabledChanged =
      nextRequireRegistered !==
      Boolean(settings.requireRegisteredMemberForSignup);
    const nextDirectoryVersion = policyEnabledChanged
      ? getSafeMemberDirectoryVersion(settings) + 1
      : getSafeMemberDirectoryVersion(settings);
    const nextSettings = {
      ...settings,
      requireRegisteredMemberForSignup: nextRequireRegistered,
      autoApproveNewMembers: nextAutoApprove,
      memberDirectoryVersion: nextDirectoryVersion,
    };

    setSignupPolicySaving(true);

    try {
      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          settings: nextSettings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      let restoredDirectoryMismatchCount = 0;
      let restoreWarning = '';

      if (!nextRequireRegistered) {
        try {
          restoredDirectoryMismatchCount =
            await restoreDirectoryMismatchAccountsAfterPolicyDisabled();
        } catch (restoreError) {
          console.error(
            'Directory mismatch account restoration error:',
            restoreError
          );
          resetDirectoryMismatchRestoreAttempt();
          restoreWarning =
            ' 정책은 해제되었지만 일부 회원 상태 자동 복원에 실패했습니다. 최신 Firestore Rules를 게시한 뒤 해당 회원이 다시 로그인하도록 안내해 주세요.';
        }
      }

      setData((previousData) => ({
        ...previousData,
        settings: nextSettings,
      }));
      setTempRequireRegisteredMemberForSignup(nextRequireRegistered);
      setTempAutoApproveNewMembers(nextAutoApprove);

      triggerToastRef.current(
        nextRequireRegistered
          ? '회원가입 정책이 저장되었습니다. 기존 회원은 로그인 시 순차적으로 명부를 확인하며, 필요한 경우 전체 회원 명부 검사를 실행할 수 있습니다.'
          : `회원가입 제한 정책이 해제되었습니다. 신규 회원 자동 승인도 함께 해제되었습니다.${
              restoredDirectoryMismatchCount > 0
                ? ` 명부 불일치로 전환됐던 회원 ${restoredDirectoryMismatchCount}명의 상태를 복원했습니다.`
                : ''
            }${restoreWarning}`,
        restoreWarning ? 'error' : 'success'
      );

      return true;
    } catch (error) {
      console.error('Signup policy save error:', error);
      triggerToastRef.current(
        '회원가입 정책 저장에 실패했습니다.',
        'error'
      );
      return false;
    } finally {
      setSignupPolicySaving(false);
    }
  }, [
    isAdminAuthenticated,
    isSplitStorageReady,
    resetDirectoryMismatchRestoreAttempt,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    setData,
    settings,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
  ]);

  return {
    cancelSignupPolicyChanges,
    saveSignupPolicyChanges,
    setTempAutoApproveNewMembers,
    setTempRequireRegisteredMemberForSignup,
    signupPolicyDirty,
    signupPolicySaving,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
  };
}
