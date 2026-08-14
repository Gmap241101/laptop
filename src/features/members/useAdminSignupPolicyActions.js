import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { normalizeTermsSettings } from '../terms/termsConstants.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishSiteContentInvalidation } from '../content/siteContentCutover.js';

export default function useAdminSignupPolicyActions({
  isAdminAuthenticated,
  setData,
  settings,
  triggerToast,
}) {
  const triggerToastRef = useRef(triggerToast);
  const normalizedTermsSettings = normalizeTermsSettings(settings);
  const [tempRequireRegisteredMemberForSignup, setTempRequireRegisteredMemberForSignup] =
    useState(Boolean(settings.requireRegisteredMemberForSignup));
  const [tempAutoApproveNewMembers, setTempAutoApproveNewMembers] =
    useState(Boolean(settings.autoApproveNewMembers));
  const [tempSignupTermsEnabled, setTempSignupTermsEnabled] = useState(
    normalizedTermsSettings.signupTermsEnabled
  );
  const [tempSignupTermsRequireReconsentOnChange, setTempSignupTermsRequireReconsentOnChange] = useState(
    normalizedTermsSettings.signupTermsRequireReconsentOnChange
  );
  const [tempSignupTermsApplyToExistingMembers, setTempSignupTermsApplyToExistingMembers] = useState(
    normalizedTermsSettings.signupTermsApplyToExistingMembers
  );
  const [signupPolicySaving, setSignupPolicySaving] = useState(false);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    const nextTermsSettings = normalizeTermsSettings(settings);
    setTempRequireRegisteredMemberForSignup(Boolean(settings.requireRegisteredMemberForSignup));
    setTempAutoApproveNewMembers(Boolean(settings.autoApproveNewMembers));
    setTempSignupTermsEnabled(nextTermsSettings.signupTermsEnabled);
    setTempSignupTermsRequireReconsentOnChange(nextTermsSettings.signupTermsRequireReconsentOnChange);
    setTempSignupTermsApplyToExistingMembers(nextTermsSettings.signupTermsApplyToExistingMembers);
  }, [settings]);

  const signupPolicyDirty = useMemo(() => {
    const currentTerms = normalizeTermsSettings(settings);
    return (
      Boolean(tempRequireRegisteredMemberForSignup) !== Boolean(settings.requireRegisteredMemberForSignup) ||
      Boolean(tempAutoApproveNewMembers) !== Boolean(settings.autoApproveNewMembers) ||
      Boolean(tempSignupTermsEnabled) !== currentTerms.signupTermsEnabled ||
      Boolean(tempSignupTermsRequireReconsentOnChange) !== currentTerms.signupTermsRequireReconsentOnChange ||
      Boolean(tempSignupTermsApplyToExistingMembers) !== currentTerms.signupTermsApplyToExistingMembers
    );
  }, [
    settings,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
    tempSignupTermsApplyToExistingMembers,
    tempSignupTermsEnabled,
    tempSignupTermsRequireReconsentOnChange,
  ]);

  const cancelSignupPolicyChanges = useCallback(() => {
    const currentTerms = normalizeTermsSettings(settings);
    setTempRequireRegisteredMemberForSignup(Boolean(settings.requireRegisteredMemberForSignup));
    setTempAutoApproveNewMembers(Boolean(settings.autoApproveNewMembers));
    setTempSignupTermsEnabled(currentTerms.signupTermsEnabled);
    setTempSignupTermsRequireReconsentOnChange(currentTerms.signupTermsRequireReconsentOnChange);
    setTempSignupTermsApplyToExistingMembers(currentTerms.signupTermsApplyToExistingMembers);
    triggerToastRef.current('회원가입 정책 변경사항을 취소했습니다.', 'success');
  }, [settings]);

  const saveSignupPolicyChanges = useCallback(async () => {
    if (!isAdminAuthenticated) {
      triggerToastRef.current('\uad00\ub9ac\uc790 \uc778\uc99d \ud6c4 \ud68c\uc6d0\uac00\uc785 \uc815\ucc45\uc744 \uc800\uc7a5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.', 'error');
      return false;
    }

    const nextRequireRegistered = Boolean(tempRequireRegisteredMemberForSignup);
    const nextAutoApprove = nextRequireRegistered && Boolean(tempAutoApproveNewMembers);
    const currentTerms = normalizeTermsSettings(settings);
    const beforeValues = {
      requireRegisteredMemberForSignup: Boolean(settings.requireRegisteredMemberForSignup),
      autoApproveNewMembers: Boolean(settings.autoApproveNewMembers),
      signupTermsEnabled: Boolean(currentTerms.signupTermsEnabled),
      signupTermsRequireReconsentOnChange: Boolean(currentTerms.signupTermsRequireReconsentOnChange),
      signupTermsApplyToExistingMembers: Boolean(currentTerms.signupTermsApplyToExistingMembers),
    };
    setSignupPolicySaving(true);

    try {
      const payload = await clerkStagingClient.saveAdminSignupPolicy({
        requireRegisteredMemberForSignup: nextRequireRegistered,
        autoApproveNewMembers: nextAutoApprove,
        signupTermsEnabled: Boolean(tempSignupTermsEnabled),
        signupTermsRequireReconsentOnChange: Boolean(tempSignupTermsRequireReconsentOnChange),
        signupTermsApplyToExistingMembers: Boolean(tempSignupTermsApplyToExistingMembers),
      });
      const mutation = payload?.signupPolicyMutation || {};
      const nextSettings = mutation?.settings;
      if (!nextSettings || typeof nextSettings !== 'object') {
        const error = new Error('PostgreSQL signup policy response is missing authoritative settings.');
        error.code = 'signup_policy_postgresql_response_missing';
        throw error;
      }

      setData((previousData) => ({ ...previousData, settings: nextSettings }));
      setTempRequireRegisteredMemberForSignup(Boolean(nextSettings.requireRegisteredMemberForSignup));
      setTempAutoApproveNewMembers(Boolean(nextSettings.autoApproveNewMembers));
      setTempSignupTermsEnabled(Boolean(nextSettings.signupTermsEnabled));
      setTempSignupTermsRequireReconsentOnChange(nextSettings.signupTermsRequireReconsentOnChange !== false);
      setTempSignupTermsApplyToExistingMembers(Boolean(nextSettings.signupTermsApplyToExistingMembers));
      publishSiteContentInvalidation('rental-config');
      publishSiteContentInvalidation('terms');

      const restoredCount = Number(mutation?.directoryRestore?.restoredCount || 0);
      const restoreFailed = Number(mutation?.directoryRestore?.failed || 0);
      let auditWriteError = null;
      try {
        await clerkStagingClient.appendAdminSystemSettingsAudit({
          action: 'signup-policy-settings-update',
          section: '회원가입 정책',
          summary: '가입 허용 명부, 자동 승인 및 가입 약관 적용 정책을 변경했습니다.',
          beforeValues,
          afterValues: {
            requireRegisteredMemberForSignup: Boolean(nextSettings.requireRegisteredMemberForSignup),
            autoApproveNewMembers: Boolean(nextSettings.autoApproveNewMembers),
            signupTermsEnabled: Boolean(nextSettings.signupTermsEnabled),
            signupTermsRequireReconsentOnChange: nextSettings.signupTermsRequireReconsentOnChange !== false,
            signupTermsApplyToExistingMembers: Boolean(nextSettings.signupTermsApplyToExistingMembers),
          },
        });
      } catch (error) {
        auditWriteError = error;
        console.error('Signup policy audit write error:', error);
      }

      if (auditWriteError) {
        triggerToastRef.current(
          `회원가입 정책은 성공적으로 저장 및 반영되었지만 변경 이력 기록에 실패했습니다. 오류 코드: ${auditWriteError?.code || auditWriteError?.name || 'system_settings_audit_write_failed'}`,
          'error'
        );
      } else {
        triggerToastRef.current(
          `회원가입 정책이 성공적으로 저장 및 반영되었습니다.${restoredCount > 0 ? ` 명부 불일치로 전환됐던 회원 ${restoredCount}명의 상태를 복원했습니다.` : ''}${restoreFailed > 0 ? ` 복원 실패 ${restoreFailed}명은 회원 상태를 확인해 주세요.` : ''}`,
          restoreFailed > 0 ? 'error' : 'success'
        );
      }
      return true;
    } catch (error) {
      console.error('Signup policy save error:', error);
      triggerToastRef.current(
        error?.code === 'terms/no-active-terms'
          ? '\uc57d\uad00 \uae30\ub2a5\uc744 \uc0ac\uc6a9\ud558\ub824\uba74 \uc774\uc6a9\uc57d\uad00 \uad00\ub9ac \ud0ed\uc5d0\uc11c \uc0ac\uc6a9 \uc911\uc778 \uc57d\uad00\uc744 \ud558\ub098 \uc774\uc0c1 \ub4f1\ub85d\ud574 \uc8fc\uc138\uc694.'
          : `\ud68c\uc6d0\uac00\uc785 \uc815\ucc45 PostgreSQL \uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \uc624\ub958 \ucf54\ub4dc: ${error?.code || error?.name || 'unknown'}`,
        'error'
      );
      return false;
    } finally {
      setSignupPolicySaving(false);
    }
  }, [
    isAdminAuthenticated,
    setData,
    settings,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
    tempSignupTermsApplyToExistingMembers,
    tempSignupTermsEnabled,
    tempSignupTermsRequireReconsentOnChange,
  ]);

  return {
    cancelSignupPolicyChanges,
    saveSignupPolicyChanges,
    setTempAutoApproveNewMembers,
    setTempRequireRegisteredMemberForSignup,
    setTempSignupTermsApplyToExistingMembers,
    setTempSignupTermsEnabled,
    setTempSignupTermsRequireReconsentOnChange,
    signupPolicyDirty,
    signupPolicySaving,
    tempAutoApproveNewMembers,
    tempRequireRegisteredMemberForSignup,
    tempSignupTermsApplyToExistingMembers,
    tempSignupTermsEnabled,
    tempSignupTermsRequireReconsentOnChange,
  };
}
