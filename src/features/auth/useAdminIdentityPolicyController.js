import { useEffect, useState } from 'react';

import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { setFirebaseRuntimePrincipal } from '../../platform/appDataRefs.js';
import {
  DEFAULT_SYSTEM_ADMIN_SETTINGS,
  DEFAULT_USER_SESSION_POLICY,
  normalizeSystemAdminSettings,
  normalizeUserSessionPolicy,
} from '../../utils/systemSettings.js';

export const normalizeAdminAccounts = (adminAccounts) => {
  if (!Array.isArray(adminAccounts)) return [];

  return adminAccounts
    .filter((account) => account && (account.adminLoginId || account.id))
    .map((account, index) => ({
      id: account.id || account.authUid || `ADMIN-LEGACY-${index}`,
      adminLoginId: account.adminLoginId || '',
      authUid: account.authUid || '',
      authEmail: account.authEmail || account.email || '',
      authProvider: account.authProvider || '',
      authLinkedAt: account.authLinkedAt || '',
      clerkUserId: account.clerkUserId || '',
      clerkLinkState: account.clerkLinkState || '',
      authAuthorityMode: account.authAuthorityMode || '',
      passwordHash: account.passwordHash || '',
      passwordSalt: account.passwordSalt || '',
      passwordHashAlgorithm:
        account.passwordHashAlgorithm ||
        account.passwordHashAlgorith ||
        (account.authUid ? 'Firebase Auth' : 'SHA-256'),
      passwordHashIterations: Number(account.passwordHashIterations) || 0,
      failedLoginCount: Number(account.failedLoginCount) || 0,
      lockUntil: Number(account.lockUntil) || 0,
      lockReason: account.lockReason || '',
      lastLoginAt: account.lastLoginAt || '',
      passwordChangedAt: account.passwordChangedAt || '',
      organizationName: account.organizationName || '',
      userName: account.userName || '',
      email: account.email || '',
      phone: account.phone || '',
      adminRole: ['owner', 'admin'].includes(account.adminRole)
        ? account.adminRole
        : 'owner',
      createdAt: account.createdAt || '',
      updatedAt: account.updatedAt || '',
    }));
};

const createAdminPrincipal = ({ uid, email = '', displayName = '' } = {}) => {
  const normalizedUid = String(uid || '').trim();
  if (!normalizedUid) return null;

  return Object.freeze({
    uid: normalizedUid,
    email: String(email || '').trim().toLowerCase(),
    displayName: String(displayName || '').trim(),
    emailVerified: true,
    providerId: 'clerk-postgresql',
    __mkAuthSource: 'clerk-postgresql',
    async getIdToken() {
      return '';
    },
  });
};

const createAdminAccountFromAuthority = (authority = {}) => {
  const adminId = String(
    authority.firebaseUid || authority.adminId || authority.clerkUserId || ''
  ).trim();
  if (!adminId) return null;

  return normalizeAdminAccounts([
    {
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
    },
  ])[0] || null;
};

export const useAdminIdentityPolicyState = () => {
  const [systemAdminSettings, setSystemAdminSettings] = useState(
    DEFAULT_SYSTEM_ADMIN_SETTINGS
  );
  const [systemAdminSettingsReady, setSystemAdminSettingsReady] = useState(false);
  const [systemAdminSettingsLoadErrorMessage, setSystemAdminSettingsLoadErrorMessage] =
    useState('');
  const [userSessionPolicy, setUserSessionPolicy] = useState(
    DEFAULT_USER_SESSION_POLICY
  );
  const [userSessionPolicyReady, setUserSessionPolicyReady] = useState(false);
  const [userSessionPolicyLoadErrorMessage, setUserSessionPolicyLoadErrorMessage] =
    useState('');
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminAccountsReady, setAdminAccountsReady] = useState(false);
  const [adminAccountsLoadErrorMessage, setAdminAccountsLoadErrorMessage] =
    useState('');
  const [adminAccountsRemoteHasData, setAdminAccountsRemoteHasData] = useState(false);
  const [firebaseAuthUser, setFirebaseAuthUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [currentAuthAdminAccount, setCurrentAuthAdminAccount] = useState(null);
  const [currentAuthRoleReady, setCurrentAuthRoleReady] = useState(false);
  const [currentAuthRoleErrorMessage, setCurrentAuthRoleErrorMessage] = useState('');

  return {
    adminAccounts,
    adminAccountsLoadErrorMessage,
    adminAccountsReady,
    adminAccountsRemoteHasData,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  };
};

export default function useAdminIdentityPolicyController({
  authenticatedAdminId,
  clearAdminAuthenticatedSession,
  currentAuthAdminAccount,
  setAdminAccounts,
  setAdminAccountsLoadErrorMessage,
  setAdminAccountsReady,
  setAdminAccountsRemoteHasData,
  setCurrentAuthAdminAccount,
  setCurrentAuthRoleErrorMessage,
  setCurrentAuthRoleReady,
  setFirebaseAuthReady,
  setFirebaseAuthUser,
  setSystemAdminSettings,
  setSystemAdminSettingsLoadErrorMessage,
  setSystemAdminSettingsReady,
  setUserSessionPolicy,
  setUserSessionPolicyLoadErrorMessage,
  setUserSessionPolicyReady,
}) {
  useEffect(() => {
    let active = true;
    setFirebaseAuthReady(false);

    void (async () => {
      try {
        await clerkStagingClient.initialize();
        const sessionPayload = await clerkStagingClient.getAdminClerkSession();
        if (!active) return;

        const authority = sessionPayload?.adminAuthentication || {};
        const account = createAdminAccountFromAuthority(authority);
        if (!account?.id) {
          const error = new Error(
            'Administrator PostgreSQL registry identifier is missing.'
          );
          error.code = 'admin_registry_id_missing';
          throw error;
        }

        const principal = createAdminPrincipal({
          uid: account.id,
          email: authority.authEmail || account.authEmail,
          displayName: authority.adminLoginId || account.adminLoginId,
        });

        setFirebaseRuntimePrincipal(principal);
        setFirebaseAuthUser(principal);
        setCurrentAuthAdminAccount(account);
        setAdminAccounts([account]);
        setAdminAccountsRemoteHasData(true);
        setAdminAccountsLoadErrorMessage('');
        setAdminAccountsReady(true);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);
      } catch (error) {
        if (!active) return;

        const unauthorized = [401, 403].includes(Number(error?.status || 0));
        setFirebaseRuntimePrincipal(null);
        setFirebaseAuthUser(null);
        setCurrentAuthAdminAccount(null);
        setAdminAccounts([]);
        setAdminAccountsRemoteHasData(false);
        setAdminAccountsLoadErrorMessage('');
        setAdminAccountsReady(true);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);

        if (unauthorized) {
          clearAdminAuthenticatedSession();
        } else {
          console.warn('Clerk/PostgreSQL administrator session bootstrap failed:', error);
        }
      } finally {
        if (active) setFirebaseAuthReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    clearAdminAuthenticatedSession,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
  ]);

  const hasAdminSession =
    Boolean(authenticatedAdminId) && Boolean(currentAuthAdminAccount?.id);

  useEffect(() => {
    if (!hasAdminSession) {
      setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
      setSystemAdminSettingsReady(true);
      setSystemAdminSettingsLoadErrorMessage('');
      return undefined;
    }

    let cancelled = false;
    const run = async () => {
      setSystemAdminSettingsReady(false);
      try {
        const payload = await clerkStagingClient.getAdminSystemConfiguration(
          'admin-security'
        );
        if (cancelled) return;
        setSystemAdminSettings(
          normalizeSystemAdminSettings(
            payload?.systemConfiguration?.payload || DEFAULT_SYSTEM_ADMIN_SETTINGS
          )
        );
        setSystemAdminSettingsLoadErrorMessage('');
      } catch (error) {
        if (cancelled) return;
        console.error('PostgreSQL administrator security settings read error:', error);
        setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
        setSystemAdminSettingsLoadErrorMessage(
          '관리자 시스템 설정을 PostgreSQL에서 불러오지 못했습니다.'
        );
      } finally {
        if (!cancelled) setSystemAdminSettingsReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    hasAdminSession,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
  ]);

  useEffect(() => {
    if (!hasAdminSession) {
      setUserSessionPolicy(DEFAULT_USER_SESSION_POLICY);
      setUserSessionPolicyReady(true);
      setUserSessionPolicyLoadErrorMessage('');
      return undefined;
    }

    let cancelled = false;
    const run = async () => {
      setUserSessionPolicyReady(false);
      try {
        const payload = await clerkStagingClient.getAdminSystemConfiguration(
          'user-session-policy'
        );
        if (cancelled) return;
        setUserSessionPolicy(
          normalizeUserSessionPolicy(
            payload?.systemConfiguration?.payload || DEFAULT_USER_SESSION_POLICY
          )
        );
        setUserSessionPolicyLoadErrorMessage('');
      } catch (error) {
        if (cancelled) return;
        console.error('PostgreSQL user session policy read error:', error);
        setUserSessionPolicy(DEFAULT_USER_SESSION_POLICY);
        setUserSessionPolicyLoadErrorMessage(
          '사용자 세션 정책을 PostgreSQL에서 불러오지 못했습니다.'
        );
      } finally {
        if (!cancelled) setUserSessionPolicyReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    hasAdminSession,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
  ]);

  useEffect(() => {
    if (!hasAdminSession) {
      setAdminAccounts([]);
      setAdminAccountsRemoteHasData(false);
      setAdminAccountsLoadErrorMessage('');
      setAdminAccountsReady(true);
      return undefined;
    }

    let cancelled = false;
    const run = async () => {
      setAdminAccountsReady(false);
      try {
        const payload = await clerkStagingClient.getAdminAccountsPostgresql();
        if (cancelled) return;
        setAdminAccounts(normalizeAdminAccounts(payload?.adminAccounts?.accounts || []));
        setAdminAccountsRemoteHasData(true);
        setAdminAccountsLoadErrorMessage('');
      } catch (error) {
        if (cancelled) return;
        console.error('PostgreSQL administrator accounts read error:', error);
        setAdminAccounts(currentAuthAdminAccount ? [currentAuthAdminAccount] : []);
        setAdminAccountsRemoteHasData(false);
        setAdminAccountsLoadErrorMessage(
          '관리자 ID 목록을 PostgreSQL에서 불러오지 못했습니다.'
        );
      } finally {
        if (!cancelled) setAdminAccountsReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    currentAuthAdminAccount,
    hasAdminSession,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
  ]);
}
