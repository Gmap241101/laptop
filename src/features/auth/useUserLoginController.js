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
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  beginUserAuthTransition,
  bindUserAuthTransitionIdentity,
  clearUserAuthTransition,
  completeUserAuthTransition,
} from './authSessionService.js';
import {
  publishUserAccountLifecycleObservation,
  readUserAccountLifecycleCutoverConfig,
} from './userAccountLifecycleCutover.js';
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
  clientTrustCode: '',
  clientTrustRequired: false,
  clientTrustStrategy: '',
  clientTrustDestination: '',
  clientTrustMigration: '',
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
    const lifecycleConfig = readUserAccountLifecycleCutoverConfig();
    let clerkSignOutFailed = false;

    setUserAuthLoading(true);
    clearUserAuthTransition();

    try {
      if (lifecycleConfig.userAuthRequested) {
        try {
          await clerkStagingClient.signOut();
        } catch (error) {
          clerkSignOutFailed = true;
          console.error('User Clerk logout error:', error);
        }
      }
      await signOut(firebaseAuth);
      clearUserLoginReturnTarget();
      clearUserAuthenticatedSession('user-logout', { clearTransition: true });
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

      triggerToast(
        clerkSignOutFailed
          ? 'Firebase 로그아웃은 완료됐지만 Clerk 세션 정리에 실패했습니다. 페이지를 새로고침해 로그인 상태를 확인해 주세요.'
          : '로그아웃되었습니다.',
        clerkSignOutFailed ? 'error' : 'success'
      );
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

  const finalizeUserAuthentication = useCallback(async ({
    firebaseUser,
    effectiveUserSessionPolicy,
  }) => {
    const userAccountSnapshot = await getDoc(
      doc(db, USER_ACCOUNTS_COLLECTION_NAME, firebaseUser.uid)
    );

    if (!userAccountSnapshot.exists()) {
      const error = new Error('Registered member profile was not found.');
      error.code = 'user_account_not_found';
      throw error;
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

        if (serviceMode === SERVICE_MODE.NORMAL || isPolicyDisabledRestore) {
          try {
            const verificationResult = await verifyUserDirectoryMembership({
              authUser: firebaseUser,
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
      setUserAuthenticatedSession(firebaseUser.uid, effectiveUserSessionPolicy);
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
      return { active: false, retainedSession: true };
    }

    if (signedInUserStatus !== USER_PROFILE_STATUS.ACTIVE) {
      const statusPageType =
        signedInUserStatus === USER_PROFILE_STATUS.PENDING
          ? 'loginPending'
          : signedInUserStatus === USER_PROFILE_STATUS.BLOCKED
            ? 'loginBlocked'
            : 'loginRetired';

      showUserAccountStatus(statusPageType);
      clearUserAuthenticatedSession('inactive-login-status', {
        clearTransition: true,
      });
      await clerkStagingClient.signOut().catch(() => {});
      await signOut(firebaseAuth).catch((logoutError) => {
        console.error('Inactive login sign-out error:', logoutError);
      });
      return { active: false, retainedSession: false };
    }

    setUserAuthenticatedSession(firebaseUser.uid, effectiveUserSessionPolicy);
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
    return { active: true, retainedSession: true };
  }, [
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    createMemberPolicyError,
    dataSettings,
    navigateToUserReturnTarget,
    setIsCommunityMenuOpen,
    setUserAuthenticatedSession,
    setUserAuthForm,
    setUserTab,
    setView,
    showUserAccountStatus,
    siteSettings,
    triggerToast,
    verifyUserDirectoryMembership,
  ]);

  const submitUserLogin = useCallback(async (event) => {
    event.preventDefault();

    const lifecycleConfig = readUserAccountLifecycleCutoverConfig();
    const email = normalizeEmailAddress(userAuthForm.email);
    const password = userAuthForm.password;
    const isClientTrustVerification = Boolean(userAuthForm.clientTrustRequired);

    if (!email) {
      triggerToast('이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!isValidEmailAddress(email)) {
      triggerToast('올바른 이메일 주소를 입력해 주세요.', 'error');
      return;
    }

    if (!isClientTrustVerification && !password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    if (isClientTrustVerification && !String(userAuthForm.clientTrustCode || '').trim()) {
      triggerToast('Clerk 새 기기 확인 인증코드를 입력해 주세요.', 'error');
      return;
    }

    let signedInUserForRoleCheck = null;
    let clerkSignedIn = false;
    let effectiveUserSessionPolicy = null;

    setUserAuthLoading(true);

    if (lifecycleConfig.userAuthRequested && !isClientTrustVerification) {
      beginUserAuthTransition({ email });
    } else if (lifecycleConfig.userAuthRequested && firebaseAuth.currentUser?.uid) {
      bindUserAuthTransitionIdentity(firebaseAuth.currentUser.uid);
    }

    if (isClientTrustVerification) {
      try {
        if (!lifecycleConfig.userAuthRequested) {
          const error = new Error('Clerk user authority is not enabled for this session.');
          error.code = 'user_clerk_client_trust_not_requested';
          throw error;
        }
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const error = new Error('Firebase compatibility session expired during Clerk Client Trust verification.');
          error.code = 'user_clerk_client_trust_firebase_session_missing';
          throw error;
        }
        if (normalizeEmailAddress(firebaseUser.email || '') !== email) {
          const error = new Error('Firebase compatibility identity changed during Clerk Client Trust verification.');
          error.code = 'user_clerk_client_trust_identity_changed';
          throw error;
        }

        effectiveUserSessionPolicy = await resolveEffectiveUserSessionPolicy({
          policy: userSessionPolicy,
          policyReady: userSessionPolicyReady,
        });
        await clerkStagingClient.verifyUserClientTrust(userAuthForm.clientTrustCode);
        clerkSignedIn = true;
        const verifiedPayload = await clerkStagingClient.getUserClerkSession();
        const authority = verifiedPayload?.userAuthentication;
        if (authority?.firebaseUid !== firebaseUser.uid) {
          const error = new Error('Clerk and Firebase user identities do not match.');
          error.code = 'user_clerk_session_identity_mismatch';
          throw error;
        }

        publishUserAccountLifecycleObservation({
          userAuthRequested: true,
          userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
          userAuthSource: 'clerk',
          userFirebaseCompatibility: 'signed-in',
          userClerkMigration: userAuthForm.clientTrustMigration || 'existing',
          userClerkUser: authority?.clerkUserId || '',
          userClientTrustStatus: 'verified',
          userClientTrustStrategy: userAuthForm.clientTrustStrategy || '',
          userClientTrustDestination: userAuthForm.clientTrustDestination || '',
          error: '',
        });

        const finalizationResult = await finalizeUserAuthentication({
          firebaseUser,
          effectiveUserSessionPolicy,
        });
        if (lifecycleConfig.userAuthRequested && finalizationResult?.retainedSession) {
          completeUserAuthTransition(firebaseUser.uid);
        } else {
          clearUserAuthTransition();
        }
      } catch (error) {
        const clerkErrorCode =
          error?.errors?.[0]?.code || error?.code || error?.message || 'user-clerk-client-trust-failed';
        const retryableCode = ['form_code_incorrect', 'form_code_invalid', 'verification_failed'].includes(clerkErrorCode);
        console.error('User Clerk Client Trust verification error:', error);
        publishUserAccountLifecycleObservation({
          userAuthRequested: true,
          userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
          userAuthSource: retryableCode ? 'client-trust-required' : 'failed',
          userFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          userClerkMigration: userAuthForm.clientTrustMigration || '',
          userClientTrustStatus: retryableCode ? 'code-retry' : 'failed',
          userClientTrustStrategy: userAuthForm.clientTrustStrategy || '',
          userClientTrustDestination: userAuthForm.clientTrustDestination || '',
          error: clerkErrorCode,
        });
        if (!retryableCode) {
          if (clerkSignedIn) await clerkStagingClient.signOut().catch(() => {});
          if (firebaseAuth.currentUser) await signOut(firebaseAuth).catch(() => {});
          clearUserAuthenticatedSession('client-trust-failed', {
            clearTransition: true,
          });
          clearAdminAuthenticatedSession();
          setUserAuthForm(createDefaultUserAuthForm());
          clearUserAuthTransition();
        }
        triggerToast(
          retryableCode
            ? 'Clerk 인증코드가 올바르지 않습니다. 받은 코드를 다시 확인해 주세요.'
            : 'Clerk 새 기기 확인을 완료하지 못했습니다. 사용자 로그인을 다시 시도해 주세요.',
          'error'
        );
      } finally {
        setUserAuthLoading(false);
      }
      return;
    }

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
      if (lifecycleConfig.userAuthRequested) {
        bindUserAuthTransitionIdentity(credential.user.uid);
      }

      const adminAccountSnapshot = await getDoc(
        doc(db, 'adminAccounts', credential.user.uid)
      );
      if (adminAccountSnapshot.exists()) {
        const error = new Error('Administrator account cannot use user login.');
        error.code = 'user_account_is_admin';
        throw error;
      }

      let migration = 'not-requested';
      if (lifecycleConfig.userAuthRequested) {
        let signInResult;
        try {
          signInResult = await clerkStagingClient.signInUserWithPassword(email, password);
          migration = 'existing';
        } catch (existingError) {
          await clerkStagingClient.signOut().catch(() => {});
          const firebaseIdToken = await credential.user.getIdToken();
          const migrationPayload = await clerkStagingClient.migrateUserToClerk(firebaseIdToken, password);
          migration = migrationPayload?.userAuthentication?.migration || 'firebase-user-to-clerk';
          signInResult = await clerkStagingClient.signInUserWithPassword(email, password);
        }

        if (signInResult?.status === 'needs_client_trust') {
          setUserAuthForm((current) => ({
            ...current,
            password: '',
            clientTrustCode: '',
            clientTrustRequired: true,
            clientTrustStrategy: signInResult.clientTrustStrategy || '',
            clientTrustDestination: signInResult.clientTrustDestination || email,
            clientTrustMigration: migration,
          }));
          publishUserAccountLifecycleObservation({
            userAuthRequested: true,
            userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
            userAuthSource: 'client-trust-required',
            userFirebaseCompatibility: 'signed-in',
            userClerkMigration: migration,
            userClientTrustStatus: 'code-sent',
            userClientTrustStrategy: signInResult.clientTrustStrategy || '',
            userClientTrustDestination: signInResult.clientTrustDestination || '',
            error: '',
          });
          signedInUserForRoleCheck = null;
          triggerToast(
            `Clerk 새 기기 확인을 위해 ${signInResult.clientTrustDestination || '등록된 연락처'}로 인증코드를 전송했습니다.`,
            'success'
          );
          return;
        }

        clerkSignedIn = true;
        const verifiedPayload = await clerkStagingClient.getUserClerkSession();
        const authority = verifiedPayload?.userAuthentication;
        if (authority?.firebaseUid !== credential.user.uid) {
          const error = new Error('Clerk and Firebase user identities do not match.');
          error.code = 'user_clerk_session_identity_mismatch';
          throw error;
        }
        publishUserAccountLifecycleObservation({
          userAuthRequested: true,
          userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
          userAuthSource: 'clerk',
          userFirebaseCompatibility: 'signed-in',
          userClerkMigration: migration,
          userClerkUser: authority?.clerkUserId || '',
          userClientTrustStatus: 'not-required',
          error: '',
        });
      }

      const finalizationResult = await finalizeUserAuthentication({
        firebaseUser: credential.user,
        effectiveUserSessionPolicy,
      });
      if (lifecycleConfig.userAuthRequested && finalizationResult?.retainedSession) {
        completeUserAuthTransition(credential.user.uid);
      } else {
        clearUserAuthTransition();
      }
      signedInUserForRoleCheck = null;
    } catch (error) {
      let firebaseAuthCleanupFailed = false;
      let clerkCleanupFailed = false;

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
      if (lifecycleConfig.userAuthRequested && clerkSignedIn) {
        try {
          await clerkStagingClient.signOut();
        } catch (logoutError) {
          clerkCleanupFailed = true;
          console.error('User Clerk cleanup error:', logoutError);
        }
      }

      clearUserAuthenticatedSession('user-login-failed', {
        clearTransition: true,
      });
      clearAdminAuthenticatedSession();
      clearUserAuthTransition();
      console.error('User auth error:', error);
      if (lifecycleConfig.userAuthRequested) {
        publishUserAccountLifecycleObservation({
          userAuthRequested: true,
          userLifecycleRequested: lifecycleConfig.userLifecycleRequested,
          userAuthSource: 'failed',
          userFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          error: error?.errors?.[0]?.code || error?.code || error?.message || 'user-clerk-authentication-failed',
        });
      }

      const specificMessage = error?.code === 'user_account_is_admin'
        ? '관리자 계정은 사용자 로그인 화면이 아니라 관리자 모드에서 로그인해 주세요.'
        : error?.code === 'user_account_not_found'
          ? '등록된 회원 정보가 없습니다. 관리자에게 문의해 주세요.'
          : error?.code === 'admin_clerk_second_factor_required'
            ? '현재 사용자 로그인 화면은 별도 MFA를 아직 지원하지 않습니다. Clerk 계정의 MFA 설정을 확인해 주세요.'
            : error?.code === 'admin_clerk_client_trust_link_unsupported'
              ? 'Clerk Client Trust가 이메일 링크 방식으로 설정되어 있습니다. Development 인스턴스에서 이메일 인증코드 방식을 활성화해 주세요.'
              : error?.code === 'user_account_retired'
                ? '탈퇴 처리된 계정입니다. 재가입 절차를 이용해 주세요.'
                : '';
      const baseErrorMessage = specificMessage || getUserAuthErrorMessage(error);
      const cleanupFailed = firebaseAuthCleanupFailed || clerkCleanupFailed;

      triggerToast(
        cleanupFailed
          ? `${baseErrorMessage} 인증 세션 정리에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.`
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
    finalizeUserAuthentication,
    getUserAuthErrorMessage,
    setUserAuthForm,
    setUserAuthLoading,
    triggerToast,
    userAuthForm.clientTrustCode,
    userAuthForm.clientTrustDestination,
    userAuthForm.clientTrustMigration,
    userAuthForm.clientTrustRequired,
    userAuthForm.clientTrustStrategy,
    userAuthForm.email,
    userAuthForm.password,
    userSessionPolicy,
    userSessionPolicyReady,
  ]);

  return {
    goToUserLogin,
    logoutUser,
    submitUserLogin,
  };
}
