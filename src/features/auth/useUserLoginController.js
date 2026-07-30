import { useCallback, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import {
  USER_ACCOUNTS_COLLECTION_NAME,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  PROFILE_REQUIRED_REASON,
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from '../members/memberAccountPolicy.js';
import {
  PROTECTED_USER_TABS,
  clearUserLoginReturnTarget,
  pushAppPath,
  readUserLoginReturnTarget,
  replaceAppPath,
} from '../../routing/appRoutes.js';
import {
  isValidEmailAddress,
  normalizeEmailAddress,
} from '../../utils/memberPolicy.js';
import {
  SERVICE_MODE,
  normalizeSiteSettings,
} from '../../utils/systemSettings.js';
import { resolveEffectiveUserSessionPolicy } from './userSessionPolicyService.js';

export const createDefaultUserAuthForm = () => ({
  email: '',
  password: '',
  passwordConfirm: '',
  name: '',
  team: '',
  phonePrefix: '010',
  phoneMiddle: '',
  phoneLast: '',
});

export const useUserAuthState = () => {
  const [userAuthForm, setUserAuthForm] = useState(createDefaultUserAuthForm);
  const [userAuthLoading, setUserAuthLoading] = useState(false);

  return {
    userAuthForm,
    userAuthLoading,
    setUserAuthForm,
    setUserAuthLoading,
  };
};

export default function useUserLoginController({
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
  configureFirebaseAuthPersistence,
  createMemberPolicyError,
  dataSettings,
  getUserAuthErrorMessage,
  navigateToUserReturnTarget,
  pendingProtectedUserTabRef,
  resetAccountRecoveryForLogin,
  saveCurrentUserLoginReturnTarget,
  setIsCommunityMenuOpen,
  setSelectedFooterPageId,
  setSelectedNoticePostId,
  setUserAuthenticatedSession,
  siteSettings,
  setUserAuthForm,
  setUserAuthLoading,
  setUserTab,
  setView,
  showUserAccountStatus,
  triggerToast,
  userAuthForm,
  userSessionPolicy,
  userSessionPolicyReady,
  userTab,
  verifyUserDirectoryMembership,
}) {
  const goToUserLogin = useCallback(() => {
    pendingProtectedUserTabRef.current = '';

    if (
      !['login', 'signup', 'findEmail', 'resetPassword', 'accountStatus'].includes(
        userTab
      )
    ) {
      saveCurrentUserLoginReturnTarget();
    }

    resetAccountRecoveryForLogin();
    pushAppPath('user', 'login');
    setView('user');
    setUserTab('login');
    setIsCommunityMenuOpen(false);
  }, [
    pendingProtectedUserTabRef,
    resetAccountRecoveryForLogin,
    saveCurrentUserLoginReturnTarget,
    setIsCommunityMenuOpen,
    setUserTab,
    setView,
    userTab,
  ]);

  const logoutUser = useCallback(async () => {
    pendingProtectedUserTabRef.current = '';

    const shouldLeaveProtectedPage = PROTECTED_USER_TABS.has(userTab);

    setUserAuthLoading(true);

    try {
      await signOut(firebaseAuth);
      clearUserLoginReturnTarget();
      clearUserAuthenticatedSession();
      clearAdminAuthenticatedSession();
      setUserAuthForm(createDefaultUserAuthForm());

      if (shouldLeaveProtectedPage) {
        replaceAppPath('user', 'home');
        setView('user');
        setUserTab('home');
        setSelectedFooterPageId('');
        setSelectedNoticePostId('');
        setIsCommunityMenuOpen(false);
      }

      triggerToast('로그아웃되었습니다.', 'success');
    } catch (error) {
      console.error('User logout error:', error);
      triggerToast('로그아웃 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setUserAuthLoading(false);
    }
  }, [
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    pendingProtectedUserTabRef,
    setIsCommunityMenuOpen,
    setSelectedFooterPageId,
    setSelectedNoticePostId,
    setUserAuthForm,
    setUserAuthLoading,
    setUserTab,
    setView,
    triggerToast,
    userTab,
  ]);

  const submitUserLogin = useCallback(async (event) => {
    event.preventDefault();

    const email = normalizeEmailAddress(userAuthForm.email);
    const password = userAuthForm.password;

    if (!email) {
      triggerToast('이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!isValidEmailAddress(email)) {
      triggerToast('올바른 이메일 주소를 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    let signedInUserForRoleCheck = null;
    let effectiveUserSessionPolicy = null;

    setUserAuthLoading(true);

    try {
      effectiveUserSessionPolicy = await resolveEffectiveUserSessionPolicy({
        policy: userSessionPolicy,
        policyReady: userSessionPolicyReady,
      });

      await configureFirebaseAuthPersistence(
        firebaseAuth,
        effectiveUserSessionPolicy.userLogoutOnBrowserClose
      );
      clearAdminAuthenticatedSession();

      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password
      );

      signedInUserForRoleCheck = credential.user;

      const adminAccountSnapshot = await getDoc(
        doc(db, 'adminAccounts', credential.user.uid)
      );

      if (adminAccountSnapshot.exists()) {
        await signOut(firebaseAuth);
        signedInUserForRoleCheck = null;
        triggerToast(
          '관리자 계정은 사용자 로그인 화면이 아니라 관리자 모드에서 로그인해 주세요.',
          'error'
        );
        return;
      }

      const userAccountSnapshot = await getDoc(
        doc(db, USER_ACCOUNTS_COLLECTION_NAME, credential.user.uid)
      );

      if (!userAccountSnapshot.exists()) {
        await signOut(firebaseAuth);
        signedInUserForRoleCheck = null;
        triggerToast(
          '등록된 회원 정보가 없습니다. 관리자에게 문의해 주세요.',
          'error'
        );
        return;
      }

      const signedInAccount = userAccountSnapshot.data();
      let signedInUserStatus = signedInAccount.status || '';

      if (
        [
          USER_PROFILE_STATUS.ACTIVE,
          USER_PROFILE_STATUS.PROFILE_REQUIRED,
        ].includes(signedInUserStatus)
      ) {
        const policyEnabled = isRegisteredMemberSignupRequired(dataSettings);
        const directoryVersion = getSafeMemberDirectoryVersion(dataSettings);
        const isDirectoryMismatchProfile =
          signedInUserStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
          signedInAccount.profileRequiredReason ===
            PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
        const needsDirectoryVerification =
          isDirectoryMismatchProfile ||
          (policyEnabled &&
            signedInUserStatus === USER_PROFILE_STATUS.ACTIVE &&
            Number(signedInAccount.directoryVerifiedVersion || 0) !==
              directoryVersion);

        if (needsDirectoryVerification) {
          const serviceMode = normalizeSiteSettings(siteSettings).serviceMode;
          const isPolicyDisabledRestore =
            !policyEnabled &&
            signedInUserStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
            signedInAccount.profileRequiredReason ===
              PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;

          if (
            serviceMode === SERVICE_MODE.NORMAL ||
            isPolicyDisabledRestore
          ) {
            try {
              const verificationResult = await verifyUserDirectoryMembership({
                authUser: credential.user,
                account: signedInAccount,
              });
              signedInUserStatus = verificationResult.status;
            } catch (verificationError) {
              if (verificationError?.code === 'permission-denied') {
                throw createMemberPolicyError(
                  'member/directory-status-sync-permission-denied'
                );
              }
              throw verificationError;
            }
          }
        }
      }

      if (signedInUserStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED) {
        setUserAuthenticatedSession(
          credential.user.uid,
          effectiveUserSessionPolicy
        );
        signedInUserForRoleCheck = null;
        clearAdminAuthenticatedSession();
        setUserAuthForm(createDefaultUserAuthForm());
        clearUserLoginReturnTarget();
        replaceAppPath('user', 'mypage');
        setView('user');
        setUserTab('mypage');
        setIsCommunityMenuOpen(false);
        triggerToast(
          '등록 정보 확인이 필요합니다. 부서와 성명을 수정해 주세요.',
          'error'
        );
        return;
      }

      if (signedInUserStatus !== USER_PROFILE_STATUS.ACTIVE) {
        const statusPageType =
          signedInUserStatus === USER_PROFILE_STATUS.PENDING
            ? 'loginPending'
            : signedInUserStatus === USER_PROFILE_STATUS.BLOCKED
              ? 'loginBlocked'
              : 'loginRetired';

        showUserAccountStatus(statusPageType);
        clearUserAuthenticatedSession();
        await signOut(firebaseAuth).catch((logoutError) => {
          console.error('Inactive login sign-out error:', logoutError);
        });
        signedInUserForRoleCheck = null;
        return;
      }

      setUserAuthenticatedSession(
        credential.user.uid,
        effectiveUserSessionPolicy
      );
      signedInUserForRoleCheck = null;
      clearAdminAuthenticatedSession();
      setUserAuthForm(createDefaultUserAuthForm());
      triggerToast('로그인되었습니다.', 'success');

      const returnTarget = readUserLoginReturnTarget();
      clearUserLoginReturnTarget();

      navigateToUserReturnTarget(
        returnTarget || {
          userTab: 'rental',
          routeId: '',
          noticePostId: '',
        },
        { replace: true }
      );
    } catch (error) {
      let firebaseAuthCleanupFailed = false;

      if (
        signedInUserForRoleCheck &&
        firebaseAuth.currentUser?.uid === signedInUserForRoleCheck.uid
      ) {
        try {
          await signOut(firebaseAuth);
        } catch (logoutError) {
          firebaseAuthCleanupFailed = true;
          console.error('User role-check logout error:', logoutError);
        }
      }

      clearUserAuthenticatedSession();
      clearAdminAuthenticatedSession();
      console.error('User auth error:', error);

      const baseErrorMessage = getUserAuthErrorMessage(error);

      triggerToast(
        firebaseAuthCleanupFailed
          ? `${baseErrorMessage} Firebase Auth 로그아웃에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
          : baseErrorMessage,
        'error'
      );
    } finally {
      setUserAuthLoading(false);
    }
  }, [
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    configureFirebaseAuthPersistence,
    createMemberPolicyError,
    dataSettings,
    getUserAuthErrorMessage,
    navigateToUserReturnTarget,
    setIsCommunityMenuOpen,
    setUserAuthenticatedSession,
    siteSettings,
    setUserAuthForm,
    setUserAuthLoading,
    setUserTab,
    setView,
    showUserAccountStatus,
    triggerToast,
    userAuthForm.email,
    userAuthForm.password,
    userSessionPolicy,
    userSessionPolicyReady,
    verifyUserDirectoryMembership,
  ]);

  return {
    goToUserLogin,
    logoutUser,
    submitUserLogin,
  };
}
