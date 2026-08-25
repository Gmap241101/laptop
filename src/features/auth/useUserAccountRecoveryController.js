import { useCallback, useState } from 'react';
import { sendPasswordResetEmail } from '../../platform/retiredLegacyDataCompat.js';

import { firebaseAuth } from '../../platform/appDataRefs.js';
import { clerkUserClient as clerkStagingClient } from '../../clerk/clerkUserClient.js';
import { isValidMemberPassword } from '../../utils/memberPolicy.js';
import { readUserFirebaseAuthRetirementConfig } from './userFirebaseAuthRetirement.js';
import { pushAppPath } from '../../routing/appRoutes.js';
import {
  createDefaultAccountRecoveryForm,
  createDefaultPasswordResetForm,
  findAccountRecoveryEmail,
  validateAccountRecoveryIdentity,
  verifyPasswordResetIdentity,
} from '../members/accountRecoveryService.js';

const waitForMinimumResponseDelay = async (startedAt, minimumDelayMs = 600) => {
  const remainingDelay = minimumDelayMs - (Date.now() - startedAt);

  if (remainingDelay > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
  }
};

export default function useUserAccountRecoveryController({
  getUserAuthErrorMessage,
  setIsCommunityMenuOpen,
  setUserTab,
  setView,
  showUserAccountStatus,
  triggerToast,
}) {
  const [accountRecoveryForm, setAccountRecoveryForm] = useState(
    createDefaultAccountRecoveryForm
  );
  const [accountRecoveryLoading, setAccountRecoveryLoading] = useState(false);
  const [accountRecoveryResult, setAccountRecoveryResult] = useState(null);
  const [passwordResetForm, setPasswordResetForm] = useState(
    createDefaultPasswordResetForm
  );
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetStage, setPasswordResetStage] = useState('identity');
  const [passwordResetVerificationResult, setPasswordResetVerificationResult] =
    useState(null);

  const resetAccountRecoveryForLogin = useCallback(() => {
    setAccountRecoveryResult(null);
    setPasswordResetForm(createDefaultPasswordResetForm());
    setPasswordResetVerificationResult(null);
    setPasswordResetStage('identity');
  }, []);

  const goToUserEmailRecovery = useCallback(() => {
    setAccountRecoveryForm(createDefaultAccountRecoveryForm());
    setAccountRecoveryResult(null);
    pushAppPath('user', 'findEmail');
    setView('user');
    setUserTab('findEmail');
    setIsCommunityMenuOpen(false);
  }, [setIsCommunityMenuOpen, setUserTab, setView]);

  const resetAccountRecoverySearch = useCallback(() => {
    setAccountRecoveryForm(createDefaultAccountRecoveryForm());
    setAccountRecoveryResult(null);
  }, []);

  const goToUserPasswordReset = useCallback(
    (initialValues = {}) => {
      setPasswordResetForm(createDefaultPasswordResetForm(initialValues));
      setPasswordResetVerificationResult(null);
      setPasswordResetStage('identity');
      pushAppPath('user', 'resetPassword');
      setView('user');
      setUserTab('resetPassword');
      setIsCommunityMenuOpen(false);
    },
    [setIsCommunityMenuOpen, setUserTab, setView]
  );

  const updatePasswordResetForm = useCallback((nextForm) => {
    setPasswordResetForm(nextForm);
    setPasswordResetVerificationResult(null);
  }, []);

  const submitAccountRecovery = useCallback(
    async (event) => {
      event.preventDefault();

      const lookupStartedAt = Date.now();
      const validation = validateAccountRecoveryIdentity({
        form: accountRecoveryForm,
      });

      if (!validation.valid) {
        triggerToast(validation.errorMessage, 'error');
        return;
      }

      setAccountRecoveryLoading(true);
      setAccountRecoveryResult(null);

      try {
        const result = await findAccountRecoveryEmail(validation);

        setAccountRecoveryResult({
          found: result.found,
          maskedEmail: result.maskedEmail,
        });
      } catch (error) {
        console.error('Account recovery lookup error:', error);
        triggerToast(
          '이메일 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      } finally {
        await waitForMinimumResponseDelay(lookupStartedAt);
        setAccountRecoveryLoading(false);
      }
    },
    [accountRecoveryForm, triggerToast]
  );

  const submitPasswordReset = useCallback(
    async (event) => {
      event.preventDefault();
      const verificationStartedAt = Date.now();
      const firebaseRetirement = readUserFirebaseAuthRetirementConfig();

      if (firebaseRetirement.requested && passwordResetStage === 'code') {
        const code = String(passwordResetForm.resetCode || '').trim();
        const newPassword = String(passwordResetForm.newPassword || '');
        const confirmPassword = String(passwordResetForm.newPasswordConfirm || '');
        if (!code) {
          triggerToast('Clerk 비밀번호 재설정 인증코드를 입력해 주세요.', 'error');
          return;
        }
        if (!isValidMemberPassword(newPassword)) {
          triggerToast('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.', 'error');
          return;
        }
        if (newPassword !== confirmPassword) {
          triggerToast('새 비밀번호 확인이 일치하지 않습니다.', 'error');
          return;
        }
        setPasswordResetLoading(true);
        try {
          await clerkStagingClient.completeUserPasswordReset({ code, password: newPassword });
          setPasswordResetForm(createDefaultPasswordResetForm());
          setPasswordResetVerificationResult(null);
          setPasswordResetStage('identity');
          showUserAccountStatus('passwordResetSent');
          triggerToast('Clerk 비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.', 'success');
        } catch (error) {
          const codeValue = error?.errors?.[0]?.code || error?.code || '';
          if (['form_code_incorrect', 'form_code_invalid', 'verification_failed'].includes(codeValue)) {
            setPasswordResetVerificationResult({ verified: true, message: '인증코드가 올바르지 않습니다. 받은 코드를 다시 확인해 주세요.' });
          } else {
            console.error('Clerk password reset completion error:', error);
            triggerToast(getUserAuthErrorMessage(error), 'error');
          }
        } finally {
          await waitForMinimumResponseDelay(verificationStartedAt);
          setPasswordResetLoading(false);
        }
        return;
      }

      const validation = validateAccountRecoveryIdentity({
        email: passwordResetForm.email,
        form: passwordResetForm,
        requireEmail: true,
      });
      if (!validation.valid) {
        triggerToast(validation.errorMessage, 'error');
        return;
      }

      setPasswordResetLoading(true);
      setPasswordResetVerificationResult(null);
      try {
        const verification = await verifyPasswordResetIdentity(validation);
        if (!verification.verified) {
          setPasswordResetVerificationResult({
            verified: false,
            message: verification.verifierMissing
              ? '계정 보안 정보가 아직 갱신되지 않았습니다. 관리자에게 계정 복구 정보 갱신을 요청해 주세요.'
              : '입력한 가입 이메일과 회원정보가 모두 일치하는 계정을 찾지 못했습니다.',
          });
          return;
        }

        if (firebaseRetirement.requested) {
          if (verification.passwordResetDelivery !== 'clerk-email-code' || !verification.clerkReady) {
            throw Object.assign(new Error('Clerk password reset authority is not ready.'), { code: 'clerk_password_reset_not_ready' });
          }
          await clerkStagingClient.startUserPasswordReset(validation.email);
          setPasswordResetStage('code');
          setPasswordResetVerificationResult({ verified: true, message: '가입 이메일로 Clerk 비밀번호 재설정 인증코드를 보냈습니다.' });
          triggerToast('가입 이메일로 비밀번호 재설정 인증코드를 보냈습니다.', 'success');
          return;
        }

        await sendPasswordResetEmail(firebaseAuth, validation.email);
        setPasswordResetForm(createDefaultPasswordResetForm());
        setPasswordResetVerificationResult(null);
        showUserAccountStatus('passwordResetSent');
      } catch (error) {
        if (['auth/user-not-found', 'auth/invalid-credential'].includes(error?.code)) {
          setPasswordResetVerificationResult({ verified: false, message: '입력한 가입 이메일과 회원정보가 모두 일치하는 계정을 찾지 못했습니다.' });
          return;
        }
        console.error('User password reset error:', error);
        triggerToast(getUserAuthErrorMessage(error), 'error');
      } finally {
        await waitForMinimumResponseDelay(verificationStartedAt);
        setPasswordResetLoading(false);
      }
    },
    [getUserAuthErrorMessage, passwordResetForm, passwordResetStage, showUserAccountStatus, triggerToast]
  );

  return {
    accountRecoveryForm,
    accountRecoveryLoading,
    accountRecoveryResult,
    goToUserEmailRecovery,
    goToUserPasswordReset,
    passwordResetForm,
    passwordResetLoading,
    passwordResetStage,
    passwordResetVerificationResult,
    resetAccountRecoveryForLogin,
    resetAccountRecoverySearch,
    setAccountRecoveryForm,
    submitAccountRecovery,
    submitPasswordReset,
    updatePasswordResetForm,
  };
}
