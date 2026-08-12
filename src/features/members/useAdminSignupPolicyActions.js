import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  normalizeTermsPolicy,
  normalizeTermsSettings,
} from '../terms/termsConstants.js';
import {
  getPolicyContentDocument,
  POLICY_CONTENT_DOMAINS,
  readPolicyContentCutoverConfig,
  replacePolicyContentDomainInPostgresql,
  requestPolicyContentDomain,
} from '../content/policyContentCutover.js';
import { getSafeMemberDirectoryVersion } from './memberAccountPolicy.js';

export default function useAdminSignupPolicyActions({
  isAdminAuthenticated,
  isSplitStorageReady,
  resetDirectoryMismatchRestoreAttempt,
  restoreDirectoryMismatchAccountsAfterPolicyDisabled,
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
      triggerToastRef.current('관리자 인증 후 회원가입 정책을 저장할 수 있습니다.', 'error');
      return false;
    }

    const nextRequireRegistered = Boolean(tempRequireRegisteredMemberForSignup);
    const nextAutoApprove = nextRequireRegistered && Boolean(tempAutoApproveNewMembers);
    const policyEnabledChanged = nextRequireRegistered !== Boolean(settings.requireRegisteredMemberForSignup);
    const nextDirectoryVersion = policyEnabledChanged
      ? getSafeMemberDirectoryVersion(settings) + 1
      : getSafeMemberDirectoryVersion(settings);
    setSignupPolicySaving(true);

    try {
      const policyContentConfig = readPolicyContentCutoverConfig();
      if (!policyContentConfig.adminAuthorityRequested) {
        const error = new Error('PostgreSQL policy authority is unavailable.');
        error.code = 'policy_postgresql_authority_unavailable';
        throw error;
      }

      const [rentalDomain, termsDomain] = await Promise.all([
        requestPolicyContentDomain({ domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG, config: policyContentConfig, useCache: false }),
        requestPolicyContentDomain({ domain: POLICY_CONTENT_DOMAINS.TERMS, config: policyContentConfig, useCache: false }),
      ]);
      const publicConfigDocument = getPolicyContentDocument(rentalDomain, 'rentalSystem/publicConfig');
      const termsPolicyDocument = getPolicyContentDocument(termsDomain, 'signupTermsPolicy/current');
      const publicConfig = publicConfigDocument?.payload || {};
      const currentSettings = { ...(publicConfig.settings || settings) };
      const termsPolicy = normalizeTermsPolicy(termsPolicyDocument?.payload || {});

      if (tempSignupTermsEnabled && termsPolicy.activeTerms.length === 0) {
        const error = new Error('terms/no-active-terms');
        error.code = 'terms/no-active-terms';
        throw error;
      }

      const currentTermsSettings = normalizeTermsSettings(currentSettings);
      const enablingTerms = !currentTermsSettings.signupTermsEnabled && tempSignupTermsEnabled;
      let policyRevision = Math.max(termsPolicy.revision, Number(currentSettings.signupTermsPolicyRevision) || 0);
      if (enablingTerms && policyRevision === 0) policyRevision = 1;
      let initialRevision = Math.max(termsPolicy.initialRevision, Number(currentSettings.signupTermsInitialRevision) || 0);
      let requiredRevision = Math.max(termsPolicy.requiredRevision, Number(currentSettings.signupTermsRequiredRevision) || 0);
      if (enablingTerms) {
        initialRevision = policyRevision;
        requiredRevision = policyRevision;
      }

      const nextSettings = {
        ...currentSettings,
        requireRegisteredMemberForSignup: nextRequireRegistered,
        autoApproveNewMembers: nextAutoApprove,
        memberDirectoryVersion: nextDirectoryVersion,
        signupTermsEnabled: Boolean(tempSignupTermsEnabled),
        signupTermsRequireReconsentOnChange: Boolean(tempSignupTermsRequireReconsentOnChange),
        signupTermsApplyToExistingMembers: Boolean(tempSignupTermsApplyToExistingMembers),
        signupTermsPolicyRevision: policyRevision,
        signupTermsRequiredRevision: requiredRevision,
        signupTermsInitialRevision: initialRevision,
      };
      const nextTermsPolicy = {
        ...termsPolicy,
        enabled: Boolean(tempSignupTermsEnabled),
        requireReconsentOnChange: Boolean(tempSignupTermsRequireReconsentOnChange),
        applyToExistingMembers: Boolean(tempSignupTermsApplyToExistingMembers),
        revision: policyRevision,
        requiredRevision,
        initialRevision,
        updatedAt: new Date(),
        updatedBy: 'clerk-admin',
      };

      await replacePolicyContentDomainInPostgresql({
        domain: POLICY_CONTENT_DOMAINS.TERMS,
        config: policyContentConfig,
        documents: [
          { key: 'signupTermsPolicy/current', payload: nextTermsPolicy, enabled: nextTermsPolicy.enabled },
          ...termsDomain.documents
            .filter((item) => item.key !== 'signupTermsPolicy/current')
            .map((item) => ({ key: item.key, payload: item.payload, enabled: item.enabled, sortOrder: item.sortOrder })),
        ],
      });
      await replacePolicyContentDomainInPostgresql({
        domain: POLICY_CONTENT_DOMAINS.RENTAL_CONFIG,
        config: policyContentConfig,
        documents: [{
          key: 'rentalSystem/publicConfig',
          payload: { ...publicConfig, settings: nextSettings, updatedAt: new Date() },
        }],
      });

      let restoredDirectoryMismatchCount = 0;
      let restoreWarning = '';
      if (!nextRequireRegistered) {
        try {
          restoredDirectoryMismatchCount = await restoreDirectoryMismatchAccountsAfterPolicyDisabled();
        } catch (restoreError) {
          console.error('Directory mismatch account restoration error:', restoreError);
          resetDirectoryMismatchRestoreAttempt();
          restoreWarning = ' 정책은 해제되었지만 일부 회원 상태 자동 복원에 실패했습니다. PostgreSQL 회원 상태를 확인해 주세요.';
        }
      }

      setData((previousData) => ({ ...previousData, settings: nextSettings }));
      setTempRequireRegisteredMemberForSignup(nextRequireRegistered);
      setTempAutoApproveNewMembers(nextAutoApprove);
      triggerToastRef.current(
        `회원가입 정책이 PostgreSQL에 저장되었습니다.${restoredDirectoryMismatchCount > 0 ? ` 명부 불일치로 전환됐던 회원 ${restoredDirectoryMismatchCount}명의 상태를 복원했습니다.` : ''}${restoreWarning}`,
        restoreWarning ? 'error' : 'success'
      );
      return true;
    } catch (error) {
      console.error('Signup policy save error:', error);
      triggerToastRef.current(
        error?.code === 'terms/no-active-terms'
          ? '약관 기능을 사용하려면 이용약관 관리 탭에서 사용 중인 약관을 하나 이상 등록해 주세요.'
          : '회원가입 정책 PostgreSQL 저장에 실패했습니다.',
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
