import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';

import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import { firebaseAuth } from '../../firebase.js';
import {
  clearUserLoginReturnTarget,
  replaceAppPath,
} from '../../routing/appRoutes.js';
import { normalizeUserSessionPolicy } from '../../utils/systemSettings.js';
import {
  clearUserAuthSession,
  readUserAuthSession,
  saveUserAuthSession,
} from './authSessionService.js';
import { createDefaultUserAuthForm } from './useUserLoginController.js';

export const useUserAuthenticationSessionState = ({ userSessionPolicy }) => {
  const [userAuthSessionUid, setUserAuthSessionUid] = useState(
    () => readUserAuthSession().userId
  );
  const [userAuthSessionExpiresAt, setUserAuthSessionExpiresAt] = useState(
    () => readUserAuthSession().expiresAt
  );
  const [
    userAuthSessionAbsoluteExpiresAt,
    setUserAuthSessionAbsoluteExpiresAt,
  ] = useState(() => readUserAuthSession().absoluteExpiresAt);
  const [
    userAuthSessionPolicyVersion,
    setUserAuthSessionPolicyVersion,
  ] = useState(() => readUserAuthSession().policyVersion);
  const userSessionLogoutInProgressRef = useRef(false);

  const applyUserAuthenticatedSession = useCallback((nextSession) => {
    setUserAuthSessionUid(nextSession.userId);
    setUserAuthSessionExpiresAt(nextSession.expiresAt);
    setUserAuthSessionAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
    setUserAuthSessionPolicyVersion(nextSession.policyVersion);
    return nextSession;
  }, []);

  const setUserAuthenticatedSession = useCallback(
    (
      userId,
      policyOverride = null,
      previousSession = null
    ) =>
      applyUserAuthenticatedSession(
        saveUserAuthSession(
          userId,
          policyOverride || userSessionPolicy,
          previousSession
        )
      ),
    [applyUserAuthenticatedSession, userSessionPolicy]
  );

  const clearUserAuthenticatedSession = useCallback(() => {
    clearUserAuthSession();
    setUserAuthSessionUid('');
    setUserAuthSessionExpiresAt(0);
    setUserAuthSessionAbsoluteExpiresAt(0);
    setUserAuthSessionPolicyVersion(0);
  }, []);

  return {
    clearUserAuthenticatedSession,
    setUserAuthenticatedSession,
    userAuthSessionAbsoluteExpiresAt,
    userAuthSessionExpiresAt,
    userAuthSessionPolicyVersion,
    userAuthSessionUid,
    userSessionLogoutInProgressRef,
  };
};

export default function useUserAuthenticationSessionController({
  authenticatedAdminId,
  clearUserAuthenticatedSession,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  firebaseAuthUser,
  setIsCommunityMenuOpen,
  setSelectedFooterPageId,
  setSelectedNoticePostId,
  setUserAuthenticatedSession,
  setUserAuthForm,
  setUserTab,
  setView,
  triggerToast,
  userAuthLoading,
  userAuthSessionAbsoluteExpiresAt,
  userAuthSessionExpiresAt,
  userAuthSessionPolicyVersion,
  userAuthSessionUid,
  userProfile,
  userProfileReady,
  userSessionLogoutInProgressRef,
  userSessionPolicy,
  userSessionPolicyReady,
  withdrawalLoading,
}) {
  const hasEstablishedUserSession = Boolean(
    firebaseAuthUser?.uid &&
      userAuthSessionUid === firebaseAuthUser.uid &&
      userAuthSessionExpiresAt > Date.now()
  );

  const expireCurrentUserSession = useCallback(
    async (message) => {
      if (userSessionLogoutInProgressRef.current) return;
      userSessionLogoutInProgressRef.current = true;

      try {
        if (firebaseAuth.currentUser) {
          await signOut(firebaseAuth);
        }
      } catch (error) {
        console.error('Expired user Firebase Auth logout error:', error);
      } finally {
        clearUserAuthenticatedSession();
        clearUserLoginReturnTarget();
        setUserAuthForm(createDefaultUserAuthForm());
        replaceAppPath('user', 'login');
        setView('user');
        setUserTab('login');
        setSelectedFooterPageId('');
        setSelectedNoticePostId('');
        setIsCommunityMenuOpen(false);
        userSessionLogoutInProgressRef.current = false;
        triggerToast(message, 'error');
      }
    },
    [
      clearUserAuthenticatedSession,
      setIsCommunityMenuOpen,
      setSelectedFooterPageId,
      setSelectedNoticePostId,
      setUserAuthForm,
      setUserTab,
      setView,
      triggerToast,
      userSessionLogoutInProgressRef,
    ]
  );

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      ![
        USER_PROFILE_STATUS.ACTIVE,
        USER_PROFILE_STATUS.PROFILE_REQUIRED,
      ].includes(userProfile.status) ||
      userAuthLoading ||
      withdrawalLoading ||
      !userSessionPolicyReady
    ) {
      return undefined;
    }

    const normalizedPolicy = normalizeUserSessionPolicy(userSessionPolicy);
    if (
      !userAuthSessionUid ||
      userAuthSessionUid !== firebaseAuthUser.uid
    ) {
      void expireCurrentUserSession(
        '로그인 세션 정보를 확인할 수 없어 다시 로그인이 필요합니다.'
      );
      return undefined;
    }

    if (
      userAuthSessionPolicyVersion !==
      normalizedPolicy.userSecurityPolicyVersion
    ) {
      void expireCurrentUserSession(
        '사용자 보안 설정이 변경되어 다시 로그인이 필요합니다.'
      );
      return undefined;
    }

    if (
      !userAuthSessionExpiresAt ||
      userAuthSessionExpiresAt <= Date.now()
    ) {
      const absoluteExpired =
        userAuthSessionAbsoluteExpiresAt > 0 &&
        userAuthSessionAbsoluteExpiresAt <= Date.now();
      void expireCurrentUserSession(
        absoluteExpired
          ? '로그인 최대 유지시간이 지나 자동으로 로그아웃되었습니다.'
          : '장시간 사용하지 않아 자동으로 로그아웃되었습니다.'
      );
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const absoluteExpired =
        userAuthSessionAbsoluteExpiresAt > 0 &&
        userAuthSessionAbsoluteExpiresAt <= Date.now();
      void expireCurrentUserSession(
        absoluteExpired
          ? '로그인 최대 유지시간이 지나 자동으로 로그아웃되었습니다.'
          : '장시간 사용하지 않아 자동으로 로그아웃되었습니다.'
      );
    }, Math.max(0, userAuthSessionExpiresAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    expireCurrentUserSession,
    firebaseAuthUser?.uid,
    userAuthLoading,
    userAuthSessionAbsoluteExpiresAt,
    userAuthSessionExpiresAt,
    userAuthSessionPolicyVersion,
    userAuthSessionUid,
    userProfile?.status,
    userProfile?.uid,
    userProfileReady,
    userSessionPolicy,
    userSessionPolicyReady,
    withdrawalLoading,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      ![
        USER_PROFILE_STATUS.ACTIVE,
        USER_PROFILE_STATUS.PROFILE_REQUIRED,
      ].includes(userProfile.status) ||
      userAuthSessionUid !== firebaseAuthUser.uid ||
      !userSessionPolicyReady
    ) {
      return undefined;
    }

    const normalizedPolicy = normalizeUserSessionPolicy(userSessionPolicy);
    let lastRefreshAt = 0;
    const refreshSession = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 30000) return;
      lastRefreshAt = now;

      const currentSession = readUserAuthSession();
      if (
        !currentSession.userId ||
        currentSession.userId !== firebaseAuthUser.uid
      ) {
        return;
      }

      setUserAuthenticatedSession(
        firebaseAuthUser.uid,
        normalizedPolicy,
        {
          absoluteExpiresAt: currentSession.absoluteExpiresAt,
        }
      );
    };

    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) =>
      window.addEventListener(eventName, refreshSession, { passive: true })
    );
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, refreshSession)
      );
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthUser?.uid,
    setUserAuthenticatedSession,
    userAuthSessionUid,
    userProfile?.status,
    userProfile?.uid,
    userProfileReady,
    userSessionPolicy,
    userSessionPolicyReady,
  ]);

  return {
    hasEstablishedUserSession,
  };
}
