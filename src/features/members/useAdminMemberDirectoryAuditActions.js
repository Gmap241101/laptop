import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './memberAccountPolicy.js';
import { publishSiteContentInvalidation } from '../content/siteContentCutover.js';

export default function useAdminMemberDirectoryAuditActions({
  isAdminAuthenticated,
  isSplitStorageReady,
  settings,
  openAdminMemberAccounts,
  triggerConfirm,
  triggerToast,
}) {
  const directoryMismatchRestoreInProgressRef = useRef(false);
  const directoryMismatchRestoreAttemptKeyRef = useRef('');
  const triggerConfirmRef = useRef(triggerConfirm);
  const triggerToastRef = useRef(triggerToast);
  const [memberDirectoryAuditLoading, setMemberDirectoryAuditLoading] =
    useState(false);
  const [memberDirectoryAuditResult, setMemberDirectoryAuditResult] =
    useState(null);

  useEffect(() => {
    triggerConfirmRef.current = triggerConfirm;
  }, [triggerConfirm]);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const resetDirectoryMismatchRestoreAttempt = useCallback(() => {
    directoryMismatchRestoreAttemptKeyRef.current = '';
  }, []);


  const clearMemberDirectoryAuditResult = useCallback(() => {
    setMemberDirectoryAuditResult(null);
  }, []);

  const restoreDirectoryMismatchAccountsAfterPolicyDisabled = useCallback(
    async () => {
      if (directoryMismatchRestoreInProgressRef.current) {
        return 0;
      }

      directoryMismatchRestoreInProgressRef.current = true;

      try {
        const payload = await clerkStagingClient.restoreAdminMemberDirectoryMismatches();
        const result = payload?.memberDirectoryRestore || {};
        if (Number(result.failed || 0) > 0) {
          const error = new Error('PostgreSQL member directory restore completed with failures.');
          error.code = 'member_directory_postgresql_restore_partial_failure';
          throw error;
        }
        return Number(result.restoredCount || 0);
      } finally {
        directoryMismatchRestoreInProgressRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    const shouldCheckDirectoryMismatchRestore =
      isAdminAuthenticated &&
      isSplitStorageReady &&
      !isRegisteredMemberSignupRequired(settings);

    if (!shouldCheckDirectoryMismatchRestore) return undefined;

    const restoreAttemptKey = `disabled:${getSafeMemberDirectoryVersion(
      settings
    )}`;

    if (
      directoryMismatchRestoreAttemptKeyRef.current === restoreAttemptKey
    ) {
      return undefined;
    }

    directoryMismatchRestoreAttemptKeyRef.current = restoreAttemptKey;
    let cancelled = false;

    void restoreDirectoryMismatchAccountsAfterPolicyDisabled()
      .then((restoredCount) => {
        if (!cancelled && restoredCount > 0) {
          triggerToastRef.current(
            `가입 제한 정책이 꺼져 있어 등록 명부 불일치 회원 ${restoredCount}명을 이전 이용 상태로 자동 복원했습니다.`,
            'success'
          );
        }
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(
          'Automatic directory mismatch account restoration error:',
          error
        );
        directoryMismatchRestoreAttemptKeyRef.current = '';
        triggerToastRef.current(
          '등록 명부 불일치 회원의 PostgreSQL 자동 복원에 실패했습니다. 회원 상태를 다시 확인해 주세요.',
          'error'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAdminAuthenticated,
    isSplitStorageReady,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    settings,
  ]);


  const executeFullMemberDirectoryAudit = useCallback(async () => {
    if (!isAdminAuthenticated) {
      triggerToastRef.current(
        '\uad00\ub9ac\uc790 \uc778\uc99d \ud6c4 \uc804\uccb4 \ud68c\uc6d0 \uac80\uc0ac\ub97c \uc2e4\ud589\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
        'error'
      );
      return;
    }

    if (!isRegisteredMemberSignupRequired(settings)) {
      triggerToastRef.current(
        '\ud68c\uc6d0\uac00\uc785 \uc81c\ud55c \uc815\ucc45\uc744 \uc800\uc7a5\ud55c \ub4a4 \uc804\uccb4 \ud68c\uc6d0 \uac80\uc0ac\ub97c \uc2e4\ud589\ud574 \uc8fc\uc138\uc694.',
        'error'
      );
      return;
    }

    setMemberDirectoryAuditLoading(true);
    setMemberDirectoryAuditResult(null);

    try {
      const payload = await clerkStagingClient.auditAdminMemberDirectory();
      const result = payload?.memberDirectoryAudit || {};
      const auditSummary = result?.audit || null;
      if (!auditSummary) {
        const error = new Error('PostgreSQL member directory audit response is missing.');
        error.code = 'member_directory_postgresql_audit_response_missing';
        throw error;
      }
      setMemberDirectoryAuditResult(auditSummary);
      publishSiteContentInvalidation('rental-config');
      triggerToastRef.current(
        `\uc804\uccb4 \ud68c\uc6d0 \uba85\ubd80 \uac80\uc0ac\uac00 \uc644\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc815\uc0c1 ${Number(auditSummary.normal || 0)}\uba85, \uc815\ubcf4 \uc218\uc815 \ud544\uc694 ${Number(auditSummary.profileRequired || 0)}\uba85, \uc911\ubcf5 ${Number(auditSummary.duplicates || 0)}\uba85, \uc2e4\ud328 ${Number(auditSummary.failed || 0)}\uba85\uc785\ub2c8\ub2e4.${result?.directoryVersionReconciled === true ? ' PostgreSQL \uba85\ubd80 \ubc84\uc804 \uc815\ubcf4\ub3c4 \ud604\uc7ac \uba85\ubd80 \uae30\uc900\uc73c\ub85c \uc790\ub3d9 \ubcf5\uad6c\ud588\uc2b5\ub2c8\ub2e4.' : ''}`,
        Number(auditSummary.profileRequired || 0) > 0 || Number(auditSummary.failed || 0) > 0 ? 'error' : 'success'
      );
    } catch (error) {
      console.error('Full member directory audit error:', error);
      triggerToastRef.current(
        `\uc804\uccb4 \ud68c\uc6d0 \uba85\ubd80 \uac80\uc0ac\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uae30\uc874 \ud68c\uc6d0 \uc0c1\ud0dc\ub294 \uac00\ub2a5\ud55c \ubc94\uc704\uc5d0\uc11c \uc720\uc9c0\ub429\ub2c8\ub2e4. \uc624\ub958 \ucf54\ub4dc: ${error?.code || error?.name || 'unknown'}`,
        'error'
      );
    } finally {
      setMemberDirectoryAuditLoading(false);
    }
  }, [
    isAdminAuthenticated,
    settings,
  ]);

  const runFullMemberDirectoryAudit = useCallback(() => {
    triggerConfirmRef.current(
      '전체 회원 명부 검사',
      "현재 회원 계정과 부서·사용자 명부를 비교합니다. 불일치 회원은 '정보 수정 필요' 상태로 전환되며 등록 정보는 자동으로 변경되지 않습니다. 검사를 실행하시겠습니까?",
      executeFullMemberDirectoryAudit
    );
  }, [executeFullMemberDirectoryAudit]);

  const openProfileRequiredMembers = useCallback(() => {
    openAdminMemberAccounts({
      query: '',
      statusFilter: USER_PROFILE_STATUS.PROFILE_REQUIRED,
    });
  }, [openAdminMemberAccounts]);


  return {
    clearMemberDirectoryAuditResult,
    memberDirectoryAuditLoading,
    memberDirectoryAuditResult,
    openProfileRequiredMembers,
    resetDirectoryMismatchRestoreAttempt,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    runFullMemberDirectoryAudit,
  };
}
