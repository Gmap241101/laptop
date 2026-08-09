import { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import {
  SYSTEM_ADMIN_SETTINGS_DOC_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  PROTECTED_USER_TABS,
  clearUserLoginReturnTarget,
  replaceAppPath,
} from '../../routing/appRoutes.js';
import { normalizeSystemAdminSettings } from '../../utils/systemSettings.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  publishAccountAuthObservation,
  readAccountAuthCutoverConfig,
} from './accountAuthCutover.js';
import {
  clearAdminAuthSession,
  configureFirebaseAuthPersistence,
  createDefaultAdminAuthForm,
  readAdminAuthSession,
  saveAdminAuthSession,
} from './authSessionService.js';

export { createDefaultAdminAuthForm } from './authSessionService.js';

export const useAdminAuthenticationState = ({ systemAdminSettings }) => {
  const [adminAuthForm, setAdminAuthForm] = useState(createDefaultAdminAuthForm);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminLogoutInProgress, setAdminLogoutInProgress] = useState(false);
  const [authenticatedAdminId, setAuthenticatedAdminId] = useState(
    () => readAdminAuthSession().adminId
  );
  const [adminAuthExpiresAt, setAdminAuthExpiresAt] = useState(
    () => readAdminAuthSession().expiresAt
  );
  const [adminAuthAbsoluteExpiresAt, setAdminAuthAbsoluteExpiresAt] = useState(
    () => readAdminAuthSession().absoluteExpiresAt
  );
  const [adminAuthPolicyVersion, setAdminAuthPolicyVersion] = useState(
    () => readAdminAuthSession().policyVersion
  );
  const adminLogoutInProgressRef = useRef(false);

  const setAdminAuthenticatedSession = useCallback(
    (adminId, securitySettingsOverride = null) => {
      const nextSession = saveAdminAuthSession(
        adminId,
        securitySettingsOverride || systemAdminSettings
      );

      setAuthenticatedAdminId(nextSession.adminId);
      setAdminAuthExpiresAt(nextSession.expiresAt);
      setAdminAuthAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
      setAdminAuthPolicyVersion(nextSession.policyVersion);
    },
    [systemAdminSettings]
  );

  const clearAdminAuthenticatedSession = useCallback(() => {
    clearAdminAuthSession();
    setAuthenticatedAdminId('');
    setAdminAuthExpiresAt(0);
    setAdminAuthAbsoluteExpiresAt(0);
    setAdminAuthPolicyVersion(0);
  }, []);

  return {
    adminAuthAbsoluteExpiresAt,
    adminAuthExpiresAt,
    adminAuthForm,
    adminAuthLoading,
    adminAuthPolicyVersion,
    adminLogoutInProgress,
    adminLogoutInProgressRef,
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    setAdminAuthenticatedSession,
    setAdminAuthAbsoluteExpiresAt,
    setAdminAuthExpiresAt,
    setAdminAuthForm,
    setAdminAuthLoading,
    setAdminAuthPolicyVersion,
    setAdminLogoutInProgress,
  };
};

export default function useAdminAuthenticationController({
  adminAccounts,
  adminAccountsReady,
  adminAuthAbsoluteExpiresAt,
  adminAuthExpiresAt,
  adminAuthForm,
  adminAuthPolicyVersion,
  adminLogoutInProgress,
  adminLogoutInProgressRef,
  authenticatedAdminId,
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
  currentAuthAdminAccount,
  currentAuthRoleReady,
  firebaseAuthReady,
  firebaseAuthUser,
  firebaseReady,
  getAdminFirebaseAuthErrorMessage,
  normalizeAdminAccounts,
  setAdminAccounts,
  setAdminAuthenticatedSession,
  setAdminAuthAbsoluteExpiresAt,
  setAdminAuthExpiresAt,
  setAdminAuthForm,
  setAdminAuthLoading,
  setAdminAuthPolicyVersion,
  setAdminLogoutInProgress,
  setCurrentAuthAdminAccount,
  setCurrentAuthRoleErrorMessage,
  setCurrentAuthRoleReady,
  setIsCommunityMenuOpen,
  setSelectedFooterPageId,
  setSelectedNoticePostId,
  setUserTab,
  setView,
  setAdminTab,
  systemAdminSettings,
  systemAdminSettingsReady,
  triggerToast,
  userTab,
  view,
}) {
  const registeredAdminAccounts = adminAccounts || [];
  const adminClerkAuthRequested = readAccountAuthCutoverConfig().adminClerkAuthRequested;
  const [adminClerkSessionVerified, setAdminClerkSessionVerified] = useState(
    () => !adminClerkAuthRequested
  );

  const authenticatedAdminAccount =
    registeredAdminAccounts.find(
      (account) => account.id === authenticatedAdminId
    ) ||
    (
      currentAuthAdminAccount?.id === authenticatedAdminId
        ? currentAuthAdminAccount
        : null
    );

  const hasMatchingAdminFirebaseAuth =
    Boolean(authenticatedAdminAccount?.authUid) &&
    firebaseAuthReady &&
    currentAuthRoleReady &&
    firebaseAuth.currentUser?.uid === authenticatedAdminAccount.authUid &&
    currentAuthAdminAccount?.id === authenticatedAdminAccount.id;

  const isAdminAuthenticated =
    Boolean(authenticatedAdminAccount) &&
    !adminLogoutInProgress &&
    hasMatchingAdminFirebaseAuth &&
    (!adminClerkAuthRequested || adminClerkSessionVerified);

  useEffect(() => {
    if (!adminClerkAuthRequested) {
      setAdminClerkSessionVerified(true);
      return undefined;
    }
    if (!authenticatedAdminId || !firebaseAuthReady || !currentAuthRoleReady) {
      setAdminClerkSessionVerified(false);
      return undefined;
    }

    let cancelled = false;
    setAdminClerkSessionVerified(false);
    const verify = async () => {
      try {
        const payload = await clerkStagingClient.getAdminClerkSession();
        const authority = payload?.adminAuthentication;
        if (
          authority?.authority !== 'clerk' ||
          authority?.firebaseUid !== authenticatedAdminId ||
          firebaseAuth.currentUser?.uid !== authenticatedAdminId
        ) {
          throw new Error('admin-clerk-session-identity-mismatch');
        }
        if (!cancelled) {
          setAdminClerkSessionVerified(true);
          publishAccountAuthObservation({
            adminClerkAuthRequested: true,
            adminAuthSource: 'clerk',
            adminFirebaseCompatibility: 'signed-in',
            adminClerkUserId: authority.clerkUserId || '',
            adminAuthError: '',
          });
        }
      } catch (error) {
        if (cancelled) return;
        setAdminClerkSessionVerified(false);
        clearAdminAuthenticatedSession();
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: 'failed',
          adminFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          adminAuthError: error?.code || error?.message || 'admin-clerk-session-verification-failed',
        });
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [
    adminClerkAuthRequested,
    authenticatedAdminId,
    firebaseAuthReady,
    currentAuthRoleReady,
    firebaseAuthUser?.uid,
    clearAdminAuthenticatedSession,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId) return undefined;
    if (!firebaseAuthReady) return undefined;
    if (!adminAccountsReady) return undefined;

    const expireAdminSession = async () => {
      if (adminLogoutInProgressRef.current) return;

      adminLogoutInProgressRef.current = true;
      setAdminLogoutInProgress(true);

      const expiringAdminAccount =
        (adminAccounts || []).find(
          (account) => account.id === authenticatedAdminId
        ) ||
        (
          currentAuthAdminAccount?.id === authenticatedAdminId
            ? currentAuthAdminAccount
            : null
        );

      const shouldSignOutFirebaseAdmin =
        Boolean(expiringAdminAccount?.authUid) &&
        firebaseAuth.currentUser?.uid === expiringAdminAccount.authUid;

      let firebaseSignOutFailed = false;

      try {
        if (shouldSignOutFirebaseAdmin) {
          await signOut(firebaseAuth);
        }
        if (adminClerkAuthRequested) {
          await clerkStagingClient.signOut();
          setAdminClerkSessionVerified(false);
        }
      } catch (error) {
        firebaseSignOutFailed = true;
        console.error('Expired admin authentication logout error:', error);
      } finally {
        clearAdminAuthenticatedSession();
        setAdminAuthForm(createDefaultAdminAuthForm());

        adminLogoutInProgressRef.current = false;
        setAdminLogoutInProgress(false);

        triggerToast(
          firebaseSignOutFailed
            ? '관리자 세션은 만료되었지만 Firebase Auth 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
            : '관리자 세션이 만료되어 로그아웃되었습니다.',
          firebaseSignOutFailed ? 'error' : 'success'
        );
      }
    };

    if (!adminAuthExpiresAt || adminAuthExpiresAt <= Date.now()) {
      void expireAdminSession();
      return undefined;
    }

    const remainingTime = adminAuthExpiresAt - Date.now();
    const sessionTimer = window.setTimeout(() => {
      void expireAdminSession();
    }, remainingTime);

    return () => {
      window.clearTimeout(sessionTimer);
    };
  }, [
    authenticatedAdminId,
    adminAuthExpiresAt,
    firebaseAuthReady,
    adminAccountsReady,
    adminAccounts,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId) return;
    if (!firebaseReady) return;
    if (!firebaseAuthReady) return;
    if (!adminAccountsReady) return;
    if (adminLogoutInProgressRef.current) return;

    const authenticatedAccount =
      (adminAccounts || []).find(
        (account) => account.id === authenticatedAdminId
      ) ||
      (
        currentAuthAdminAccount?.id === authenticatedAdminId
          ? currentAuthAdminAccount
          : null
      );

    const hasFirebaseAuthMismatch =
      Boolean(authenticatedAccount?.authUid) &&
      firebaseAuth.currentUser?.uid !== authenticatedAccount.authUid;
    const hasActiveAdminLock =
      Number(authenticatedAccount?.lockUntil || 0) > Date.now();

    if (!authenticatedAccount || hasFirebaseAuthMismatch || hasActiveAdminLock) {
      if (hasActiveAdminLock && firebaseAuth.currentUser) {
        void signOut(firebaseAuth).catch((error) => {
          console.error('Locked admin Firebase Auth logout error:', error);
        });
      }
      if (adminClerkAuthRequested) {
        void clerkStagingClient.signOut().catch((error) => {
          console.error('Locked admin Clerk logout error:', error);
        });
        setAdminClerkSessionVerified(false);
      }
      clearAdminAuthenticatedSession();
    }
  }, [
    authenticatedAdminId,
    firebaseReady,
    firebaseAuthReady,
    firebaseAuthUser,
    adminAccountsReady,
    adminAccounts,
  ]);

  useEffect(() => {
    if (!authenticatedAdminId || !isAdminAuthenticated) return undefined;

    const normalizedSecurity = normalizeSystemAdminSettings(systemAdminSettings);
    if (
      systemAdminSettingsReady &&
      adminAuthPolicyVersion &&
      adminAuthPolicyVersion !== normalizedSecurity.adminSecurityPolicyVersion
    ) {
      if (!adminLogoutInProgressRef.current) {
        adminLogoutInProgressRef.current = true;
        setAdminLogoutInProgress(true);
        void (async () => {
          try {
            if (firebaseAuth.currentUser) {
              await signOut(firebaseAuth);
            }
            if (adminClerkAuthRequested) {
              await clerkStagingClient.signOut();
              setAdminClerkSessionVerified(false);
            }
          } catch (error) {
            console.error('Admin policy change logout error:', error);
          } finally {
            clearAdminAuthenticatedSession();
            setAdminAuthForm(createDefaultAdminAuthForm());
            adminLogoutInProgressRef.current = false;
            setAdminLogoutInProgress(false);
            triggerToast(
              '관리자 보안 설정이 변경되어 다시 로그인이 필요합니다.',
              'error'
            );
          }
        })();
      }
      return undefined;
    }

    let lastRefreshAt = 0;
    const refreshSession = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 30000) return;
      lastRefreshAt = now;

      const currentSession = readAdminAuthSession();
      if (
        !currentSession.adminId ||
        currentSession.adminId !== authenticatedAdminId
      ) {
        return;
      }

      const nextSession = saveAdminAuthSession(
        authenticatedAdminId,
        normalizedSecurity,
        {
          absoluteExpiresAt:
            adminAuthAbsoluteExpiresAt || currentSession.absoluteExpiresAt,
        }
      );
      setAdminAuthExpiresAt(nextSession.expiresAt);
      setAdminAuthAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
      setAdminAuthPolicyVersion(nextSession.policyVersion);
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
    isAdminAuthenticated,
    systemAdminSettings,
    systemAdminSettingsReady,
    adminAuthPolicyVersion,
    adminAuthAbsoluteExpiresAt,
  ]);

  const authenticateAdmin = async () => {
    const adminEmail = adminAuthForm.adminLoginId.trim();
    const password = adminAuthForm.password;

    if (!adminEmail) {
      triggerToast('관리자 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    let signedInAdminUser = null;
    let clerkSignedIn = false;

    setAdminAuthLoading(true);
    if (adminClerkAuthRequested) setAdminClerkSessionVerified(false);

    try {
      const initialSecuritySettings = normalizeSystemAdminSettings(
        systemAdminSettings
      );
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        initialSecuritySettings.adminLogoutOnBrowserClose
      );
      clearUserAuthenticatedSession();

      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        adminEmail,
        password
      );

      signedInAdminUser = credential.user;

      const adminAccountDocRef = doc(
        db,
        'adminAccounts',
        credential.user.uid
      );

      const adminAccountSnapshot = await getDoc(adminAccountDocRef);

      if (!adminAccountSnapshot.exists()) {
        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          'Firebase Auth 로그인은 성공했지만 등록된 관리자 권한이 없습니다.',
          'error'
        );

        return;
      }

      const matchedAdminAccount = normalizeAdminAccounts([
        {
          ...adminAccountSnapshot.data(),
          id: adminAccountSnapshot.id,
        },
      ])[0];

      const hasValidAdminUidStructure =
        Boolean(matchedAdminAccount) &&
        adminAccountSnapshot.id === credential.user.uid &&
        matchedAdminAccount.id === credential.user.uid &&
        matchedAdminAccount.authUid === credential.user.uid;

      if (!hasValidAdminUidStructure) {
        throw new Error('admin-auth-uid-mismatch');
      }

      if (
        matchedAdminAccount.lockUntil &&
        matchedAdminAccount.lockUntil > Date.now()
      ) {
        const remainingMinutes = Math.ceil(
          (matchedAdminAccount.lockUntil - Date.now()) / 60000
        );

        await signOut(firebaseAuth);
        signedInAdminUser = null;

        triggerToast(
          `관리자 계정이 잠금 상태입니다. 약 ${remainingMinutes}분 후 다시 시도해 주세요.`,
          'error'
        );

        return;
      }

      let adminClerkAuthority = null;
      let adminClerkMigration = 'not-requested';

      if (adminClerkAuthRequested) {
        let existingClerkAuthority = null;
        try {
          await clerkStagingClient.signInWithPassword(adminEmail, password);
          clerkSignedIn = true;
          const existingPayload = await clerkStagingClient.getAdminClerkSession();
          if (existingPayload?.adminAuthentication?.firebaseUid !== credential.user.uid) {
            throw new Error('admin-clerk-session-identity-mismatch');
          }
          existingClerkAuthority = existingPayload.adminAuthentication;
          adminClerkMigration = 'existing';
        } catch (existingError) {
          if (clerkSignedIn) {
            await clerkStagingClient.signOut().catch(() => {});
            clerkSignedIn = false;
          }
          const firebaseIdToken = await credential.user.getIdToken();
          const migrationPayload = await clerkStagingClient.migrateAdminToClerk(
            firebaseIdToken,
            password
          );
          adminClerkMigration = migrationPayload?.adminAuthentication?.migration || 'firebase-admin-to-clerk';
          await clerkStagingClient.signInWithPassword(adminEmail, password);
          clerkSignedIn = true;
          const verifiedPayload = await clerkStagingClient.getAdminClerkSession();
          if (verifiedPayload?.adminAuthentication?.firebaseUid !== credential.user.uid) {
            throw new Error('admin-clerk-session-identity-mismatch');
          }
          existingClerkAuthority = verifiedPayload.adminAuthentication;
        }
        adminClerkAuthority = existingClerkAuthority;
        setAdminClerkSessionVerified(true);
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: 'clerk',
          adminFirebaseCompatibility: 'signed-in',
          adminClerkMigration,
          adminClerkUserId: adminClerkAuthority?.clerkUserId || '',
          adminAuthError: '',
        });
      }

      const nowText = new Date().toLocaleString('ko-KR');

      const nextAdminAccount = {
        ...matchedAdminAccount,
        id: credential.user.uid,
        authUid: credential.user.uid,
        authEmail:
          credential.user.email ||
          matchedAdminAccount.authEmail ||
          '',
        authProvider: adminClerkAuthRequested
          ? 'clerk+firebase-compatibility'
          : 'firebase-auth',
        ...(adminClerkAuthority
          ? {
              clerkUserId: adminClerkAuthority.clerkUserId || '',
              clerkLinkState: adminClerkAuthority.clerkLinkState || 'linked',
              authAuthorityMode: adminClerkAuthority.authAuthorityMode || 'clerk-authoritative-firebase-compatibility',
            }
          : {}),
        lastLoginAt: nowText,
        updatedAt: nowText,
      };

      await setDoc(
        adminAccountDocRef,
        {
          ...nextAdminAccount,
          syncedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setCurrentAuthAdminAccount(nextAdminAccount);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);

      setAdminAccounts((previousAccounts) => [
        nextAdminAccount,
        ...(previousAccounts || []).filter(
          (account) => account.id !== nextAdminAccount.id
        ),
      ]);

      const securitySettingsSnapshot = await getDoc(
        SYSTEM_ADMIN_SETTINGS_DOC_REF
      ).catch(() => null);
      const loginSecuritySettings = normalizeSystemAdminSettings(
        securitySettingsSnapshot?.exists()
          ? securitySettingsSnapshot.data()
          : systemAdminSettings
      );
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        loginSecuritySettings.adminLogoutOnBrowserClose
      );

      setAdminAuthenticatedSession(
        nextAdminAccount.id,
        loginSecuritySettings
      );
      setAdminAuthForm(createDefaultAdminAuthForm());
      setAdminTab('dashboard');

      signedInAdminUser = null;

      triggerToast(
        adminClerkAuthRequested
          ? `[${nextAdminAccount.adminLoginId}] Clerk 관리자 인증이 완료되었습니다.`
          : `[${nextAdminAccount.adminLoginId}] 관리자 인증이 완료되었습니다.`,
        'success'
      );
    } catch (error) {
      let firebaseAuthCleanupFailed = false;
      let clerkCleanupFailed = false;

      if (
        signedInAdminUser &&
        firebaseAuth.currentUser?.uid === signedInAdminUser.uid
      ) {
        try {
          await signOut(firebaseAuth);
        } catch (logoutError) {
          firebaseAuthCleanupFailed = true;
          console.error('Failed admin login Firebase cleanup error:', logoutError);
        }
      }
      if (adminClerkAuthRequested && clerkSignedIn) {
        try {
          await clerkStagingClient.signOut();
        } catch (logoutError) {
          clerkCleanupFailed = true;
          console.error('Failed admin login Clerk cleanup error:', logoutError);
        }
      }

      setAdminClerkSessionVerified(!adminClerkAuthRequested);
      clearAdminAuthenticatedSession();
      setCurrentAuthAdminAccount(null);

      console.error('Admin authentication error:', error);
      if (adminClerkAuthRequested) {
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: 'failed',
          adminFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          adminAuthError: error?.code || error?.message || 'admin-clerk-authentication-failed',
        });
      }

      const clerkMessage = error?.code === 'admin_registry_not_ready'
        ? 'PostgreSQL 관리자 identity registry가 준비되지 않았습니다. Phase 21 registry 동기화 상태를 확인해 주세요.'
        : error?.code === 'admin_clerk_second_factor_required'
          ? '현재 관리자 로그인 화면은 Clerk 2차 인증을 지원하지 않습니다. Clerk Development 인스턴스의 관리자 계정 2차 인증 설정을 확인해 주세요.'
          : error?.code === 'admin_clerk_password_too_short'
            ? 'Clerk 관리자 신규 비밀번호는 8자 이상이어야 합니다.'
            : '';
      const baseErrorMessage = clerkMessage || getAdminFirebaseAuthErrorMessage(error);
      const cleanupMessage = firebaseAuthCleanupFailed || clerkCleanupFailed
        ? ' 인증 정리에도 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
        : '';

      triggerToast(`${baseErrorMessage}${cleanupMessage}`, 'error');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const logoutAdmin = async () => {
    if (adminLogoutInProgressRef.current || adminLogoutInProgress) return;

    const shouldLeaveProtectedUserPage =
      view === 'user' &&
      PROTECTED_USER_TABS.has(userTab);

    adminLogoutInProgressRef.current = true;
    setAdminLogoutInProgress(true);

    const adminAccountForLogout =
      authenticatedAdminAccount || currentAuthAdminAccount;

    const shouldSignOutFirebaseAdmin =
      Boolean(adminAccountForLogout?.authUid) &&
      firebaseAuth.currentUser?.uid === adminAccountForLogout.authUid;

    let firebaseSignOutFailed = false;
    let clerkSignOutFailed = false;

    try {
      if (shouldSignOutFirebaseAdmin) {
        await signOut(firebaseAuth);
      }
    } catch (error) {
      firebaseSignOutFailed = true;
      console.error('Admin Firebase Auth logout error:', error);
    }
    try {
      if (adminClerkAuthRequested) {
        await clerkStagingClient.signOut();
      }
    } catch (error) {
      clerkSignOutFailed = true;
      console.error('Admin Clerk logout error:', error);
    } finally {
      setAdminClerkSessionVerified(!adminClerkAuthRequested);
      clearUserLoginReturnTarget();
      clearAdminAuthenticatedSession();
      setAdminAuthForm(createDefaultAdminAuthForm());

      if (shouldLeaveProtectedUserPage) {
        replaceAppPath('user', 'home');
        setView('user');
        setUserTab('home');
        setSelectedFooterPageId('');
        setSelectedNoticePostId('');
        setIsCommunityMenuOpen(false);
      }

      adminLogoutInProgressRef.current = false;
      setAdminLogoutInProgress(false);

      const signOutFailed = firebaseSignOutFailed || clerkSignOutFailed;
      triggerToast(
        signOutFailed
          ? '관리자 화면 인증은 해제되었지만 인증 공급자 로그아웃에 실패했습니다. 페이지를 새로고침한 뒤 로그인 상태를 확인해 주세요.'
          : '관리자 인증이 해제되었습니다.',
        signOutFailed ? 'error' : 'success'
      );
    }
  };

  return {
    authenticateAdmin,
    authenticatedAdminAccount,
    isAdminAuthenticated,
    logoutAdmin,
  };
}
