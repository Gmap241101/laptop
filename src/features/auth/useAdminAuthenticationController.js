import { useCallback, useEffect, useRef, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
} from '../../platform/retiredLegacyDataCompat.js';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  SYSTEM_ADMIN_SETTINGS_DOC_REF,
  db,
  firebaseAuth,
} from '../../platform/appDataRefs.js';
import {
  PROTECTED_USER_TABS,
  clearAdminRouteIntent,
  clearUserLoginReturnTarget,
  readAdminRouteIntent,
  replaceAppPath,
  writeAdminRouteIntent,
} from '../../routing/appRoutes.js';
import { normalizeSystemAdminSettings } from '../../utils/systemSettings.js';
import { formatKoreanDateTime } from '../../utils/appUtils.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { getClerkPasswordSignInErrorMessage } from './loginErrorMessages.js';
import {
  publishAccountAuthObservation,
  readAccountAuthCutoverConfig,
} from './accountAuthCutover.js';
import { readFirebaseRuntimeRetirementConfig } from './firebaseRuntimeRetirement.js';
import {
  clearAdminAuthSession,
  configureFirebaseAuthPersistence,
  createDefaultAdminAuthForm,
  readAdminAuthSession,
  saveAdminAuthSession,
} from './authSessionService.js';

export { createDefaultAdminAuthForm } from './authSessionService.js';

const signOutClerkForRuntimeSurface = (runtimeSurface) =>
  clerkStagingClient.signOut(
    runtimeSurface === 'admin'
      ? { redirectUrl: '/admin' }
      : undefined
  );

const syncAdminRouteIntentAfterAuthClear = (runtimeSurface) => {
  if (runtimeSurface === 'admin') {
    writeAdminRouteIntent();
    return;
  }
  clearAdminRouteIntent();
};

export const useAdminAuthenticationState = ({ systemAdminSettings, runtimeSurface = 'user' }) => {
  const [adminAuthForm, setAdminAuthForm] = useState(createDefaultAdminAuthForm);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminLogoutInProgress, setAdminLogoutInProgress] = useState(false);
  const [authenticatedAdminId, setAuthenticatedAdminId] = useState(
    () => (runtimeSurface === 'admin' ? readAdminAuthSession().adminId : '')
  );
  const [adminAuthExpiresAt, setAdminAuthExpiresAt] = useState(
    () => (runtimeSurface === 'admin' ? readAdminAuthSession().expiresAt : 0)
  );
  const [adminAuthAbsoluteExpiresAt, setAdminAuthAbsoluteExpiresAt] = useState(
    () => (runtimeSurface === 'admin' ? readAdminAuthSession().absoluteExpiresAt : 0)
  );
  const [adminAuthPolicyVersion, setAdminAuthPolicyVersion] = useState(
    () => (runtimeSurface === 'admin' ? readAdminAuthSession().policyVersion : 0)
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

  const rebaseAdminAuthenticatedSession = useCallback(
    (securitySettingsOverride = null) => {
      const currentSession = readAdminAuthSession();
      if (!currentSession.adminId) return null;

      const normalizedSecurity = normalizeSystemAdminSettings(
        securitySettingsOverride || systemAdminSettings
      );
      const now = Date.now();
      const absoluteDurationMs =
        normalizedSecurity.adminAbsoluteTimeoutHours > 0
          ? normalizedSecurity.adminAbsoluteTimeoutHours * 60 * 60 * 1000
          : 0;
      const currentAbsoluteExpiresAt = Number(
        currentSession.absoluteExpiresAt || 0
      );
      const boundedPreviousSession = {
        ...currentSession,
        absoluteExpiresAt:
          absoluteDurationMs === 0
            ? 0
            : currentAbsoluteExpiresAt > now
              ? Math.min(currentAbsoluteExpiresAt, now + absoluteDurationMs)
              : 0,
      };
      const nextSession = saveAdminAuthSession(
        currentSession.adminId,
        normalizedSecurity,
        boundedPreviousSession
      );

      setAuthenticatedAdminId(nextSession.adminId);
      setAdminAuthExpiresAt(nextSession.expiresAt);
      setAdminAuthAbsoluteExpiresAt(nextSession.absoluteExpiresAt);
      setAdminAuthPolicyVersion(nextSession.policyVersion);
      return nextSession;
    },
    [systemAdminSettings]
  );

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
    rebaseAdminAuthenticatedSession,
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
  runtimeSurface = 'user',
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
  getAdminAuthErrorMessage,
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
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig().requested;
  const [adminClerkSessionVerified, setAdminClerkSessionVerified] = useState(
    () => !adminClerkAuthRequested
  );
  const [adminPostLoginRouteGuardActive, setAdminPostLoginRouteGuardActive] = useState(
    readAdminRouteIntent
  );

  const loadAuthoritativeAdminSecuritySettings = useCallback(async () => {
    const payload = await clerkStagingClient.getAdminSystemConfiguration('admin-security');
    const rawSettings = payload?.systemConfiguration?.payload;
    if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
      const error = new Error('PostgreSQL administrator security configuration is unavailable.');
      error.code = 'admin_security_configuration_unavailable';
      throw error;
    }
    return normalizeSystemAdminSettings(rawSettings);
  }, []);

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
    firebaseRuntimeRetired
      ? Boolean(authenticatedAdminAccount) && currentAuthAdminAccount?.id === authenticatedAdminAccount.id
      : Boolean(authenticatedAdminAccount?.authUid) &&
        firebaseAuthReady &&
        currentAuthRoleReady &&
        firebaseAuth.currentUser?.uid === authenticatedAdminAccount.authUid &&
        currentAuthAdminAccount?.id === authenticatedAdminAccount.id;

  const isAdminAuthenticated =
    Boolean(authenticatedAdminAccount) &&
    !adminLogoutInProgress &&
    hasMatchingAdminFirebaseAuth &&
    (!adminClerkAuthRequested || adminClerkSessionVerified);

  const applyClerkAdminAuthority = useCallback((authority = {}) => {
    const adminId = String(authority.firebaseUid || authority.adminId || authority.clerkUserId || '').trim();
    if (!adminId) throw Object.assign(new Error('PostgreSQL administrator registry identifier is missing.'), { code: 'admin_registry_id_missing' });
    const nextAccount = normalizeAdminAccounts([{
      id: adminId,
      authUid: adminId,
      adminLoginId: authority.adminLoginId || authority.authEmail || '',
      authEmail: authority.authEmail || '',
      email: authority.authEmail || '',
      adminRole: authority.adminRole || 'admin',
      clerkUserId: authority.clerkUserId || '',
      clerkLinkState: authority.clerkLinkState || 'linked',
      authProvider: 'clerk',
      authAuthorityMode: 'clerk-postgresql',
      lastLoginAt: formatKoreanDateTime(new Date(), '-'),
      updatedAt: new Date().toISOString(),
    }])[0];
    setCurrentAuthAdminAccount(nextAccount);
    setCurrentAuthRoleErrorMessage('');
    setCurrentAuthRoleReady(true);
    setAdminAccounts((previousAccounts) => [
      nextAccount,
      ...(previousAccounts || []).filter((account) => account.id !== nextAccount.id),
    ]);
    return nextAccount;
  }, [normalizeAdminAccounts, setAdminAccounts, setCurrentAuthAdminAccount, setCurrentAuthRoleErrorMessage, setCurrentAuthRoleReady]);

  const stabilizeAdminPostLoginRoute = useCallback(() => {
    const applyAdminRoute = () => {
      replaceAppPath('admin');
      setAdminTab('dashboard');
      setView('admin');
      setIsCommunityMenuOpen(false);
    };

    applyAdminRoute();

    if (typeof window !== 'undefined') {
      if (typeof window.queueMicrotask === 'function') {
        window.queueMicrotask(applyAdminRoute);
      }
      window.requestAnimationFrame?.(() => {
        window.requestAnimationFrame?.(applyAdminRoute);
      });
      window.setTimeout(applyAdminRoute, 150);
      window.setTimeout(applyAdminRoute, 600);
    }
  }, [setAdminTab, setIsCommunityMenuOpen, setView]);

  useEffect(() => {
    if (runtimeSurface !== 'admin') return undefined;
    if (!adminPostLoginRouteGuardActive) return undefined;

    if (!readAdminRouteIntent()) {
      setAdminPostLoginRouteGuardActive(false);
      return undefined;
    }

    const persistedAdminId = readAdminAuthSession().adminId;
    if (!authenticatedAdminId && !persistedAdminId) {
      syncAdminRouteIntentAfterAuthClear(runtimeSurface);
      setAdminPostLoginRouteGuardActive(false);
      return undefined;
    }

    const normalizedPath =
      typeof window === 'undefined'
        ? '/admin'
        : window.location.pathname.replace(/\/+$/, '') || '/';
    const routeIsAdmin = ['/admin', '/admin/index.html'].includes(normalizedPath) && view === 'admin';

    if (!routeIsAdmin) {
      stabilizeAdminPostLoginRoute();
    }

    return undefined;
  }, [
    adminPostLoginRouteGuardActive,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    currentAuthRoleReady,
    adminClerkSessionVerified,
    isAdminAuthenticated,
    stabilizeAdminPostLoginRoute,
    view,
    runtimeSurface,
  ]);

  useEffect(() => {
    if (runtimeSurface !== 'admin') return undefined;
    if (!adminClerkAuthRequested) {
      setAdminClerkSessionVerified(true);
      return undefined;
    }
    if (!authenticatedAdminId || (!firebaseRuntimeRetired && (!firebaseAuthReady || !currentAuthRoleReady))) {
      setAdminClerkSessionVerified(false);
      return undefined;
    }

    let cancelled = false;
    // Keep an already verified interactive login authenticated while the authoritative
    // Clerk session is rechecked. Initial/restored sessions still start as unverified
    // and remain behind the loading gate until this verification succeeds.
    const verify = async () => {
      try {
        const payload = await clerkStagingClient.getAdminClerkSession();
        const authority = payload?.adminAuthentication;
        if (
          authority?.authority !== 'clerk' ||
          authority?.firebaseUid !== authenticatedAdminId ||
          (!firebaseRuntimeRetired && firebaseAuth.currentUser?.uid !== authenticatedAdminId)
        ) {
          throw new Error('admin-clerk-session-identity-mismatch');
        }
        if (!cancelled) {
          if (firebaseRuntimeRetired) applyClerkAdminAuthority(authority);
          setAdminClerkSessionVerified(true);
          publishAccountAuthObservation({
            adminClerkAuthRequested: true,
            adminAuthSource: 'clerk',
            adminFirebaseCompatibility: firebaseRuntimeRetired ? 'retired' : 'signed-in',
            adminClerkUserId: authority.clerkUserId || '',
            adminAuthError: '',
          });
        }
      } catch (error) {
        if (cancelled) return;
        setAdminClerkSessionVerified(false);
        syncAdminRouteIntentAfterAuthClear(runtimeSurface);
        setAdminPostLoginRouteGuardActive(false);
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
    firebaseRuntimeRetired,
    authenticatedAdminId,
    firebaseAuthReady,
    currentAuthRoleReady,
    firebaseAuthUser?.uid,
    clearAdminAuthenticatedSession,
    applyClerkAdminAuthority,
    runtimeSurface,
  ]);

  useEffect(() => {
    if (runtimeSurface !== 'admin') return undefined;
    if (!authenticatedAdminId) return undefined;
    if (!firebaseRuntimeRetired && !firebaseAuthReady) return undefined;
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

      const shouldSignOutFirebaseAdmin = !firebaseRuntimeRetired &&
        Boolean(expiringAdminAccount?.authUid) &&
        firebaseAuth.currentUser?.uid === expiringAdminAccount.authUid;

      let firebaseSignOutFailed = false;

      try {
        if (shouldSignOutFirebaseAdmin) {
          await signOut(firebaseAuth);
        }
        if (adminClerkAuthRequested) {
          await signOutClerkForRuntimeSurface(runtimeSurface);
          setAdminClerkSessionVerified(false);
        }
      } catch (error) {
        firebaseSignOutFailed = true;
        console.error('Expired admin authentication logout error:', error);
      } finally {
        syncAdminRouteIntentAfterAuthClear(runtimeSurface);
        setAdminPostLoginRouteGuardActive(false);
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
    firebaseRuntimeRetired,
    adminAccountsReady,
    adminAccounts,
    runtimeSurface,
  ]);

  useEffect(() => {
    if (runtimeSurface !== 'admin') return undefined;
    if (!authenticatedAdminId) return;
    if (!firebaseRuntimeRetired && !firebaseReady) return;
    if (!firebaseRuntimeRetired && !firebaseAuthReady) return;
    if (!adminAccountsReady) return;
    if (!currentAuthRoleReady) return;
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

    const hasFirebaseAuthMismatch = !firebaseRuntimeRetired &&
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
        void signOutClerkForRuntimeSurface(runtimeSurface).catch((error) => {
          console.error('Locked admin Clerk logout error:', error);
        });
        setAdminClerkSessionVerified(false);
      }
      syncAdminRouteIntentAfterAuthClear(runtimeSurface);
      setAdminPostLoginRouteGuardActive(false);
      clearAdminAuthenticatedSession();
    }
  }, [
    authenticatedAdminId,
    firebaseReady,
    firebaseAuthReady,
    firebaseRuntimeRetired,
    firebaseAuthUser,
    adminAccountsReady,
    adminAccounts,
    currentAuthRoleReady,
    currentAuthAdminAccount,
    runtimeSurface,
  ]);

  useEffect(() => {
    if (runtimeSurface !== 'admin') return undefined;
    if (!authenticatedAdminId || !isAdminAuthenticated) return undefined;

    const normalizedSecurity = normalizeSystemAdminSettings(systemAdminSettings);
    if (
      systemAdminSettingsReady &&
      adminAuthPolicyVersion &&
      adminAuthPolicyVersion !== normalizedSecurity.adminSecurityPolicyVersion
    ) {
      if (!adminLogoutInProgressRef.current) {
        adminLogoutInProgressRef.current = true;
        void (async () => {
          let confirmedPolicyMismatch = true;
          try {
            if (firebaseRuntimeRetired && adminClerkAuthRequested) {
              const authoritativeSecurity = await loadAuthoritativeAdminSecuritySettings();
              confirmedPolicyMismatch =
                adminAuthPolicyVersion !== authoritativeSecurity.adminSecurityPolicyVersion;
            }

            if (!confirmedPolicyMismatch) {
              return;
            }

            setAdminLogoutInProgress(true);
            if (!firebaseRuntimeRetired && firebaseAuth.currentUser) {
              await signOut(firebaseAuth);
            }
            if (adminClerkAuthRequested) {
              await signOutClerkForRuntimeSurface(runtimeSurface);
              setAdminClerkSessionVerified(false);
            }
          } catch (error) {
            console.error('Admin policy change verification/logout error:', error);
          } finally {
            if (confirmedPolicyMismatch) {
              syncAdminRouteIntentAfterAuthClear(runtimeSurface);
              setAdminPostLoginRouteGuardActive(false);
              clearAdminAuthenticatedSession();
              setAdminAuthForm(createDefaultAdminAuthForm());
              triggerToast(
                '관리자 보안 설정이 변경되어 다시 로그인이 필요합니다.',
                'error'
              );
            }
            adminLogoutInProgressRef.current = false;
            setAdminLogoutInProgress(false);
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
    loadAuthoritativeAdminSecuritySettings,
    adminAuthAbsoluteExpiresAt,
    firebaseRuntimeRetired,
    runtimeSurface,
  ]);

  const loadAdminAccountForFirebaseUser = async (firebaseUser) => {
    const adminAccountDocRef = doc(db, 'adminAccounts', firebaseUser.uid);
    const adminAccountSnapshot = await getDoc(adminAccountDocRef);

    if (!adminAccountSnapshot.exists()) {
      const error = new Error('Firebase Auth login succeeded but the administrator account is not registered.');
      error.code = 'admin_permission_missing';
      throw error;
    }

    const matchedAdminAccount = normalizeAdminAccounts([
      {
        ...adminAccountSnapshot.data(),
        id: adminAccountSnapshot.id,
      },
    ])[0];

    const hasValidAdminUidStructure =
      Boolean(matchedAdminAccount) &&
      adminAccountSnapshot.id === firebaseUser.uid &&
      matchedAdminAccount.id === firebaseUser.uid &&
      matchedAdminAccount.authUid === firebaseUser.uid;

    if (!hasValidAdminUidStructure) {
      const error = new Error('admin-auth-uid-mismatch');
      error.code = 'admin_auth_uid_mismatch';
      throw error;
    }

    if (
      matchedAdminAccount.lockUntil &&
      matchedAdminAccount.lockUntil > Date.now()
    ) {
      const error = new Error('Administrator account is locked.');
      error.code = 'admin_account_locked';
      error.remainingMinutes = Math.ceil(
        (matchedAdminAccount.lockUntil - Date.now()) / 60000
      );
      throw error;
    }

    return { adminAccountDocRef, matchedAdminAccount };
  };

  const finalizeAdminAuthentication = async ({
    firebaseUser,
    adminAccountDocRef,
    matchedAdminAccount,
    adminClerkAuthority = null,
    adminClerkMigration = 'not-requested',
  }) => {
    if (adminClerkAuthRequested) {
      setAdminClerkSessionVerified(true);
      publishAccountAuthObservation({
        adminClerkAuthRequested: true,
        adminAuthSource: 'clerk',
        adminFirebaseCompatibility: 'signed-in',
        adminClerkMigration,
        adminClerkUserId: adminClerkAuthority?.clerkUserId || '',
        adminClientTrustStatus: 'verified',
        adminClientTrustStrategy: adminAuthForm.clientTrustStrategy || '',
        adminAuthError: '',
      });
    }

    const nowText = formatKoreanDateTime(new Date(), '-');
    const nextAdminAccount = {
      ...matchedAdminAccount,
      id: firebaseUser.uid,
      authUid: firebaseUser.uid,
      authEmail:
        firebaseUser.email ||
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
    writeAdminRouteIntent();
    setAdminPostLoginRouteGuardActive(true);
    stabilizeAdminPostLoginRoute();

    triggerToast(
      adminClerkAuthRequested
        ? `[${nextAdminAccount.adminLoginId}] Clerk 관리자 인증이 완료되었습니다.`
        : `[${nextAdminAccount.adminLoginId}] 관리자 인증이 완료되었습니다.`,
      'success'
    );
  };

  const beginAdminClientTrust = ({ signInResult, migration }) => {
    setAdminAuthForm((current) => ({
      ...current,
      password: '',
      clientTrustCode: '',
      clientTrustRequired: true,
      clientTrustStrategy: signInResult?.clientTrustStrategy || '',
      clientTrustDestination: signInResult?.clientTrustDestination || current.adminLoginId,
      clientTrustMigration: migration || 'existing',
    }));
    publishAccountAuthObservation({
      adminClerkAuthRequested: true,
      adminAuthSource: 'client-trust-required',
      adminFirebaseCompatibility: firebaseRuntimeRetired ? 'retired' : 'signed-in',
      adminClerkMigration: migration || 'existing',
      adminClientTrustStatus: 'code-sent',
      adminClientTrustStrategy: signInResult?.clientTrustStrategy || '',
      adminClientTrustDestination: signInResult?.clientTrustDestination || '',
      adminAuthError: '',
    });
    triggerToast(
      `새 기기 인증을 위해 ${signInResult?.clientTrustDestination || '로그인 이메일'}로 인증코드를 전송했습니다.`,
      'success'
    );
  };

  const authenticateAdmin = async () => {
    if (runtimeSurface !== 'admin') return;
    const adminIdentifier = adminAuthForm.adminLoginId.trim();
    const adminEmail = adminIdentifier;
    const password = adminAuthForm.password;
    const isClientTrustVerification = Boolean(adminAuthForm.clientTrustRequired);

    if (!adminIdentifier) {
      triggerToast('관리자 ID 또는 로그인 이메일을 입력해 주세요.', 'error');
      return;
    }

    if (!isClientTrustVerification && !password) {
      triggerToast('비밀번호를 입력해 주세요.', 'error');
      return;
    }

    const clientTrustCode = String(adminAuthForm.clientTrustCode || '').replace(/\D/g, '').slice(0, 6);
    if (isClientTrustVerification && !/^\d{6}$/.test(clientTrustCode)) {
      triggerToast('6자리 인증코드를 모두 입력해 주세요.', 'error');
      return;
    }

    let signedInAdminUser = null;
    let clerkSignedIn = false;

    setAdminAuthLoading(true);
    if (adminClerkAuthRequested) setAdminClerkSessionVerified(false);

    if (firebaseRuntimeRetired) {
      try {
        clearUserAuthenticatedSession('admin-login-switch', { clearTransition: true });
        if (isClientTrustVerification) {
          await clerkStagingClient.verifyAdminClientTrust(clientTrustCode);
        } else {
          const resolvedIdentifier = adminIdentifier.includes('@')
            ? adminIdentifier
            : (await clerkStagingClient.resolveAdminLoginIdentifier(adminIdentifier, password)).authEmail;
          const signInResult = await clerkStagingClient.signInWithPassword(resolvedIdentifier, password);
          if (signInResult?.status === 'needs_client_trust') {
            beginAdminClientTrust({ signInResult, migration: 'clerk-only' });
            return;
          }
        }
        const verifiedPayload = await clerkStagingClient.getAdminClerkSession();
        const authority = verifiedPayload?.adminAuthentication;
        if (authority?.authority !== 'clerk') {
          throw Object.assign(new Error('Clerk administrator authority is unavailable.'), { code: 'admin_clerk_not_authorized' });
        }
        const nextAdminAccount = applyClerkAdminAuthority(authority);
        const loginSecuritySettings = await loadAuthoritativeAdminSecuritySettings();
        setAdminClerkSessionVerified(true);
        setAdminAuthenticatedSession(nextAdminAccount.id, loginSecuritySettings);
        setAdminAuthForm(createDefaultAdminAuthForm());
        writeAdminRouteIntent();
        setAdminPostLoginRouteGuardActive(true);
        stabilizeAdminPostLoginRoute();
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: 'clerk',
          adminFirebaseCompatibility: 'retired',
          adminClerkMigration: 'clerk-only',
          adminClerkUserId: authority.clerkUserId || '',
          adminClientTrustStatus: 'verified',
          adminAuthError: '',
        });
        triggerToast(`[${nextAdminAccount.adminLoginId}] Clerk 관리자 인증이 완료되었습니다.`, 'success');
      } catch (error) {
        const code = error?.errors?.[0]?.code || error?.code || error?.message || 'admin-clerk-authentication-failed';
        const retryable = ['form_code_incorrect', 'form_code_invalid', 'verification_failed'].includes(code);
        if (!retryable) {
          await signOutClerkForRuntimeSurface(runtimeSurface).catch(() => {});
          setAdminAuthForm(createDefaultAdminAuthForm());
          syncAdminRouteIntentAfterAuthClear(runtimeSurface);
          setAdminPostLoginRouteGuardActive(false);
          clearAdminAuthenticatedSession();
          setCurrentAuthAdminAccount(null);
        }
        publishAccountAuthObservation({ adminClerkAuthRequested: true, adminAuthSource: retryable ? 'client-trust-required' : 'failed', adminFirebaseCompatibility: 'retired', adminAuthError: code });
        const clerkCredentialMessage = getClerkPasswordSignInErrorMessage(error);
        const adminCredentialMessage = code === 'admin_login_credentials_invalid'
          ? '관리자 ID 또는 비밀번호가 올바르지 않습니다.'
          : code === 'admin_account_locked'
            ? '잠긴 관리자 계정입니다. 최고 관리자에게 잠금 해제를 요청해 주세요.'
            : '';
        triggerToast(
          retryable
            ? 'Clerk 인증코드를 다시 확인해 주세요.'
            : adminCredentialMessage || clerkCredentialMessage || 'Clerk 관리자 인증에 실패했습니다.',
          'error'
        );
      } finally {
        setAdminAuthLoading(false);
      }
      return;
    }

    if (isClientTrustVerification) {
      try {
        if (!adminClerkAuthRequested) {
          const error = new Error('Clerk administrator authority is not enabled for this session.');
          error.code = 'admin_clerk_client_trust_not_requested';
          throw error;
        }

        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const error = new Error('Firebase administrator compatibility session expired during Clerk Client Trust verification.');
          error.code = 'admin_clerk_client_trust_firebase_session_missing';
          throw error;
        }
        if ((firebaseUser.email || '').trim().toLowerCase() !== adminEmail.toLowerCase()) {
          const error = new Error('Firebase administrator compatibility identity changed during Clerk Client Trust verification.');
          error.code = 'admin_clerk_client_trust_identity_changed';
          throw error;
        }

        const { adminAccountDocRef, matchedAdminAccount } =
          await loadAdminAccountForFirebaseUser(firebaseUser);

        await clerkStagingClient.verifyAdminClientTrust(clientTrustCode);
        clerkSignedIn = true;

        const verifiedPayload = await clerkStagingClient.getAdminClerkSession();
        const adminClerkAuthority = verifiedPayload?.adminAuthentication;
        if (adminClerkAuthority?.firebaseUid !== firebaseUser.uid) {
          const error = new Error('admin-clerk-session-identity-mismatch');
          error.code = 'admin_clerk_session_identity_mismatch';
          throw error;
        }

        await finalizeAdminAuthentication({
          firebaseUser,
          adminAccountDocRef,
          matchedAdminAccount,
          adminClerkAuthority,
          adminClerkMigration: adminAuthForm.clientTrustMigration || 'existing',
        });
      } catch (error) {
        const clerkErrorCode =
          error?.errors?.[0]?.code ||
          error?.code ||
          error?.message ||
          'admin-clerk-client-trust-verification-failed';
        const retryableCode = [
          'form_code_incorrect',
          'form_code_invalid',
          'verification_failed',
        ].includes(clerkErrorCode);

        console.error('Admin Clerk Client Trust verification error:', error);
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: retryableCode ? 'client-trust-required' : 'failed',
          adminFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          adminClerkMigration: adminAuthForm.clientTrustMigration || '',
          adminClientTrustStatus: retryableCode ? 'code-retry' : 'failed',
          adminClientTrustStrategy: adminAuthForm.clientTrustStrategy || '',
          adminClientTrustDestination: adminAuthForm.clientTrustDestination || '',
          adminAuthError: clerkErrorCode,
        });

        if (!retryableCode) {
          if (clerkSignedIn) {
            await signOutClerkForRuntimeSurface(runtimeSurface).catch(() => {});
          }
          if (firebaseAuth.currentUser) {
            await signOut(firebaseAuth).catch(() => {});
          }
          setAdminAuthForm(createDefaultAdminAuthForm());
          syncAdminRouteIntentAfterAuthClear(runtimeSurface);
          setAdminPostLoginRouteGuardActive(false);
          clearAdminAuthenticatedSession();
          setCurrentAuthAdminAccount(null);
        }

        const message = retryableCode
          ? 'Clerk 인증코드가 올바르지 않습니다. 받은 코드를 다시 확인해 주세요.'
          : error?.code === 'admin_clerk_client_trust_expired'
            ? 'Clerk 새 기기 확인이 만료되었습니다. 관리자 이메일과 비밀번호로 다시 로그인해 주세요.'
            : 'Clerk 새 기기 확인을 완료하지 못했습니다. 관리자 로그인을 다시 시도해 주세요.';
        triggerToast(message, 'error');
      } finally {
        setAdminAuthLoading(false);
      }
      return;
    }

    try {
      const initialSecuritySettings = normalizeSystemAdminSettings(
        systemAdminSettings
      );
      await configureFirebaseAuthPersistence(
        firebaseAuth,
        initialSecuritySettings.adminLogoutOnBrowserClose
      );
      clearUserAuthenticatedSession('admin-login-switch', {
        clearTransition: true,
      });

      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        adminEmail,
        password
      );
      signedInAdminUser = credential.user;

      const { adminAccountDocRef, matchedAdminAccount } =
        await loadAdminAccountForFirebaseUser(credential.user);

      let adminClerkAuthority = null;
      let adminClerkMigration = 'not-requested';

      if (adminClerkAuthRequested) {
        let existingClerkAuthority = null;
        try {
          const signInResult = await clerkStagingClient.signInWithPassword(
            adminEmail,
            password
          );
          if (signInResult?.status === 'needs_client_trust') {
            beginAdminClientTrust({ signInResult, migration: 'existing' });
            signedInAdminUser = null;
            return;
          }
          clerkSignedIn = true;
          const existingPayload = await clerkStagingClient.getAdminClerkSession();
          if (existingPayload?.adminAuthentication?.firebaseUid !== credential.user.uid) {
            const error = new Error('admin-clerk-session-identity-mismatch');
            error.code = 'admin_clerk_session_identity_mismatch';
            throw error;
          }
          existingClerkAuthority = existingPayload.adminAuthentication;
          adminClerkMigration = 'existing';
        } catch (existingError) {
          if (clerkSignedIn) {
            await signOutClerkForRuntimeSurface(runtimeSurface).catch(() => {});
            clerkSignedIn = false;
          }
          const firebaseIdToken = await credential.user.getIdToken();
          const migrationPayload = await clerkStagingClient.migrateAdminToClerk(
            firebaseIdToken,
            password
          );
          adminClerkMigration = migrationPayload?.adminAuthentication?.migration || 'firebase-admin-to-clerk';
          const migratedSignInResult = await clerkStagingClient.signInWithPassword(
            adminEmail,
            password
          );
          if (migratedSignInResult?.status === 'needs_client_trust') {
            beginAdminClientTrust({
              signInResult: migratedSignInResult,
              migration: adminClerkMigration,
            });
            signedInAdminUser = null;
            return;
          }
          clerkSignedIn = true;
          const verifiedPayload = await clerkStagingClient.getAdminClerkSession();
          if (verifiedPayload?.adminAuthentication?.firebaseUid !== credential.user.uid) {
            const error = new Error('admin-clerk-session-identity-mismatch');
            error.code = 'admin_clerk_session_identity_mismatch';
            throw error;
          }
          existingClerkAuthority = verifiedPayload.adminAuthentication;
        }
        adminClerkAuthority = existingClerkAuthority;
      }

      await finalizeAdminAuthentication({
        firebaseUser: credential.user,
        adminAccountDocRef,
        matchedAdminAccount,
        adminClerkAuthority,
        adminClerkMigration,
      });
      signedInAdminUser = null;
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
          await signOutClerkForRuntimeSurface(runtimeSurface);
        } catch (logoutError) {
          clerkCleanupFailed = true;
          console.error('Failed admin login Clerk cleanup error:', logoutError);
        }
      }

      setAdminClerkSessionVerified(!adminClerkAuthRequested);
      syncAdminRouteIntentAfterAuthClear(runtimeSurface);
      setAdminPostLoginRouteGuardActive(false);
      clearAdminAuthenticatedSession();
      setCurrentAuthAdminAccount(null);

      console.error('Admin authentication error:', error);
      if (adminClerkAuthRequested) {
        publishAccountAuthObservation({
          adminClerkAuthRequested: true,
          adminAuthSource: 'failed',
          adminFirebaseCompatibility: firebaseAuth.currentUser ? 'signed-in' : 'signed-out',
          adminClientTrustStatus: '',
          adminAuthError:
            error?.errors?.[0]?.code ||
            error?.code ||
            error?.message ||
            'admin-clerk-authentication-failed',
        });
      }

      const clerkMessage = error?.code === 'admin_registry_not_ready'
        ? 'PostgreSQL 관리자 identity registry가 준비되지 않았습니다. Phase 21 registry 동기화 상태를 확인해 주세요.'
        : error?.code === 'admin_clerk_second_factor_required'
          ? '현재 관리자 로그인 화면은 사용자 설정 MFA를 아직 지원하지 않습니다. Clerk 관리자 계정의 MFA 설정을 확인해 주세요.'
          : error?.code === 'admin_clerk_client_trust_link_unsupported'
            ? 'Clerk Client Trust가 이메일 링크 방식으로 설정되어 있습니다. Development 인스턴스에서 이메일 인증코드 방식을 활성화해 주세요.'
            : error?.code === 'admin_clerk_password_too_short'
              ? 'Clerk 관리자 신규 비밀번호는 8자 이상이어야 합니다.'
              : error?.code === 'admin_permission_missing'
                ? 'Firebase Auth 로그인은 성공했지만 등록된 관리자 권한이 없습니다.'
                : error?.code === 'admin_account_locked'
                  ? `관리자 계정이 잠금 상태입니다. 약 ${error.remainingMinutes || 1}분 후 다시 시도해 주세요.`
                  : '';
      const clerkCredentialMessage = getClerkPasswordSignInErrorMessage(error);
      const baseErrorMessage = clerkMessage || clerkCredentialMessage || getAdminAuthErrorMessage(error);
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
    syncAdminRouteIntentAfterAuthClear(runtimeSurface);
    setAdminPostLoginRouteGuardActive(false);

    const adminAccountForLogout =
      authenticatedAdminAccount || currentAuthAdminAccount;

    const shouldSignOutFirebaseAdmin = !firebaseRuntimeRetired &&
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
        await signOutClerkForRuntimeSurface(runtimeSurface);
      }
    } catch (error) {
      clerkSignOutFailed = true;
      console.error('Admin Clerk logout error:', error);
    } finally {
      setAdminClerkSessionVerified(!adminClerkAuthRequested);
      clearUserLoginReturnTarget();
      syncAdminRouteIntentAfterAuthClear(runtimeSurface);
      setAdminPostLoginRouteGuardActive(false);
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
