import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { isValidMemberPassword } from '../../utils/memberPolicy.js';

const getVerificationErrorMessage = (error) => {
  const code = String(error?.code || '');

  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return '현재 비밀번호가 올바르지 않습니다.';
  }

  if (code === 'auth/too-many-requests') {
    return '비밀번호 확인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (code === 'auth/network-request-failed') {
    return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
  }

  if (code === 'auth/requires-recent-login') {
    return '본인 확인 시간이 만료되었습니다. 현재 비밀번호를 다시 확인해 주세요.';
  }

  return '현재 비밀번호를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
};

export default function useUserMyPageSecurity({
  firebaseAuthUser,
  triggerToast,
}) {
  const [verifiedUid, setVerifiedUid] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationErrorMessage, setVerificationErrorMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState('');

  const currentUid = String(firebaseAuthUser?.uid || '');
  const isVerified = Boolean(currentUid && verifiedUid === currentUid);
  const passwordMismatch = Boolean(
    newPasswordConfirm && newPassword !== newPasswordConfirm
  );
  const passwordFormatValid = useMemo(
    () => isValidMemberPassword(newPassword),
    [newPassword]
  );

  useEffect(() => {
    setVerifiedUid('');
    setCurrentPassword('');
    setVerificationLoading(false);
    setVerificationErrorMessage('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordChanging(false);
    setPasswordErrorMessage('');
  }, [currentUid]);

  const verifyCurrentPassword = useCallback(
    async (event) => {
      event?.preventDefault?.();

      if (!firebaseAuthUser?.uid || !firebaseAuthUser?.email) {
        setVerificationErrorMessage(
          '현재 로그인 이메일을 확인할 수 없습니다. 로그아웃 후 다시 로그인해 주세요.'
        );
        return;
      }

      if (!currentPassword) {
        setVerificationErrorMessage('현재 비밀번호를 입력해 주세요.');
        return;
      }

      setVerificationLoading(true);
      setVerificationErrorMessage('');

      try {
        const credential = EmailAuthProvider.credential(
          firebaseAuthUser.email,
          currentPassword
        );

        await reauthenticateWithCredential(firebaseAuthUser, credential);
        setVerifiedUid(firebaseAuthUser.uid);
        setCurrentPassword('');
      } catch (error) {
        setVerificationErrorMessage(getVerificationErrorMessage(error));
        setCurrentPassword('');
      } finally {
        setVerificationLoading(false);
      }
    }, [currentPassword, firebaseAuthUser]
  );

  const changePassword = useCallback(
    async (event) => {
      event?.preventDefault?.();

      if (!firebaseAuthUser?.uid || !isVerified) {
        setVerificationErrorMessage(
          '본인 확인 시간이 만료되었습니다. 현재 비밀번호를 다시 확인해 주세요.'
        );
        setVerifiedUid('');
        return;
      }

      if (!passwordFormatValid) {
        setPasswordErrorMessage(
          '새 비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.'
        );
        return;
      }

      if (passwordMismatch || newPassword !== newPasswordConfirm) {
        setPasswordErrorMessage('입력하신 비밀번호가 일치하지 않습니다.');
        return;
      }

      setPasswordChanging(true);
      setPasswordErrorMessage('');

      try {
        await updatePassword(firebaseAuthUser, newPassword);
        setNewPassword('');
        setNewPasswordConfirm('');
        triggerToast?.('비밀번호가 변경되었습니다.', 'success');
      } catch (error) {
        const message = getVerificationErrorMessage(error);

        if (error?.code === 'auth/requires-recent-login') {
          setVerifiedUid('');
          setVerificationErrorMessage(message);
        } else {
          setPasswordErrorMessage(message);
        }
      } finally {
        setPasswordChanging(false);
      }
    }, [
      firebaseAuthUser,
      isVerified,
      newPassword,
      newPasswordConfirm,
      passwordFormatValid,
      passwordMismatch,
      triggerToast,
    ]
  );

  return {
    changePassword,
    currentPassword,
    isVerified,
    newPassword,
    newPasswordConfirm,
    passwordChanging,
    passwordErrorMessage,
    passwordFormatValid,
    passwordMismatch,
    setCurrentPassword: (value) => {
      setCurrentPassword(value);
      setVerificationErrorMessage('');
    },
    setNewPassword: (value) => {
      setNewPassword(value);
      setPasswordErrorMessage('');
    },
    setNewPasswordConfirm: (value) => {
      setNewPasswordConfirm(value);
      setPasswordErrorMessage('');
    },
    verificationErrorMessage,
    verificationLoading,
    verifyCurrentPassword,
  };
}
