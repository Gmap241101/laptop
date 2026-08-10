import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import {
  ADMIN_ACCOUNTS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
  SYSTEM_ADMIN_SETTINGS_DOC_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  USER_SESSION_POLICY_DOC_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import { parseDomesticPhoneNumber } from '../../utils/memberPolicy.js';
import {
  DEFAULT_SYSTEM_ADMIN_SETTINGS,
  DEFAULT_USER_SESSION_POLICY,
  normalizeSystemAdminSettings,
  normalizeUserSessionPolicy,
} from '../../utils/systemSettings.js';
import { publishMemberProfileReadObservation } from '../members/memberProfileReadObservation.js';
import {
  chooseMemberProfileReadSource,
  loadMemberProfileWithoutFirestoreWatcher,
  publishMemberProfileCutoverObservation,
  readMemberProfileCutoverConfig,
  requestMemberProfileCutoverCandidate,
  requestMemberProfileFirestoreFallback,
  shouldUseMemberProfileFirestoreWatcher,
} from '../members/memberProfileReadCutover.js';
import { subscribeMemberProfileWriteThroughObservation } from '../members/memberProfileWriteThrough.js';
import {
  loadRentalRestrictionWithoutFirestoreWatcher,
  publishRentalRestrictionCutoverObservation,
  readRentalRestrictionCutoverConfig,
  requestRentalRestrictionCandidate,
  requestRentalRestrictionFallback,
  subscribeRentalRestrictionWriteThroughObservation,
} from '../requests/rentalRestrictionReadCutover.js';
import { createDefaultUserProfileForm } from '../members/useUserMyPageAccountController.js';
import { readUserAuthTransition } from './authSessionService.js';


export const normalizeAdminAccounts = function(adminAccounts) {
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
      adminRole: ['owner', 'admin'].includes(account.adminRole) ? account.adminRole : 'owner',
      createdAt: account.createdAt || '',
      updatedAt: account.updatedAt || '',
    }));
}
;

export const useAuthIdentityPolicySubscriptionState = () => {
  const [systemAdminSettings, setSystemAdminSettings] = useState(
    DEFAULT_SYSTEM_ADMIN_SETTINGS
  );
  const [systemAdminSettingsReady, setSystemAdminSettingsReady] = useState(false);
  const [
    systemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsLoadErrorMessage,
  ] = useState('');
  const [userSessionPolicy, setUserSessionPolicy] = useState(
    DEFAULT_USER_SESSION_POLICY
  );
  const [userSessionPolicyReady, setUserSessionPolicyReady] = useState(false);
  const [
    userSessionPolicyLoadErrorMessage,
    setUserSessionPolicyLoadErrorMessage,
  ] = useState('');
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminAccountsReady, setAdminAccountsReady] = useState(false);
  const [adminAccountsLoadErrorMessage, setAdminAccountsLoadErrorMessage] = useState('');
  const [adminAccountsRemoteHasData, setAdminAccountsRemoteHasData] = useState(false);
  const [firebaseAuthUser, setFirebaseAuthUser] = useState(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [currentAuthAdminAccount, setCurrentAuthAdminAccount] = useState(null);
  const [currentAuthRoleReady, setCurrentAuthRoleReady] = useState(false);
  const [currentAuthRoleErrorMessage, setCurrentAuthRoleErrorMessage] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const [currentUserRestriction, setCurrentUserRestriction] = useState(null);
  const [currentUserRestrictionReady, setCurrentUserRestrictionReady] = useState(false);

  return {
    adminAccounts,
    adminAccountsLoadErrorMessage,
    adminAccountsReady,
    adminAccountsRemoteHasData,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    currentUserRestriction,
    currentUserRestrictionReady,
    firebaseAuthReady,
    firebaseAuthUser,
    setAdminAccounts,
    setAdminAccountsLoadErrorMessage,
    setAdminAccountsReady,
    setAdminAccountsRemoteHasData,
    setCurrentAuthAdminAccount,
    setCurrentAuthRoleErrorMessage,
    setCurrentAuthRoleReady,
    setCurrentUserRestriction,
    setCurrentUserRestrictionReady,
    setFirebaseAuthReady,
    setFirebaseAuthUser,
    setSystemAdminSettings,
    setSystemAdminSettingsLoadErrorMessage,
    setSystemAdminSettingsReady,
    setUserProfile,
    setUserProfileReady,
    setUserSessionPolicy,
    setUserSessionPolicyLoadErrorMessage,
    setUserSessionPolicyReady,
    systemAdminSettings,
    systemAdminSettingsLoadErrorMessage,
    systemAdminSettingsReady,
    userProfile,
    userProfileReady,
    userSessionPolicy,
    userSessionPolicyLoadErrorMessage,
    userSessionPolicyReady,
  };
};

export default function useAuthIdentityPolicySubscriptionController({
  adminTab,
  authenticatedAdminId,
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
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
  setCurrentUserRestriction,
  setCurrentUserRestrictionReady,
  setFirebaseAuthReady,
  setFirebaseAuthUser,
  setSystemAdminSettings,
  setSystemAdminSettingsLoadErrorMessage,
  setSystemAdminSettingsReady,
  setToast,
  setUserProfile,
  setUserProfileForm,
  setUserProfileReady,
  setUserSessionPolicy,
  setUserSessionPolicyLoadErrorMessage,
  setUserSessionPolicyReady,
  triggerToast,
  view,
}) {
  const observedFirebaseAuthUidRef = useRef('');
  const adminAccountsApplyingRemoteRef = useRef(false);
  const adminAccountsLastSyncedRef = useRef({});
  const allowAdminAccountsWriteRef = useRef(false);
  const triggerToastRef = useRef(triggerToast);
  const hasFirebaseAuthSession = Boolean(
    firebaseAuthUser || firebaseAuth.currentUser
  );

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        const nextAuthUid = user?.uid || '';
        const authIdentityChanged =
          observedFirebaseAuthUidRef.current !== nextAuthUid;

        observedFirebaseAuthUidRef.current = nextAuthUid;

        if (authIdentityChanged) {
          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage('');
          setCurrentAuthRoleReady(!user);
        }

        setFirebaseAuthUser(user);
        if (!user) {
          const authTransition = readUserAuthTransition();
          if (!authTransition) {
            clearUserAuthenticatedSession('firebase-auth-signed-out');
          }
        }
        setFirebaseAuthReady(true);
      },
      (error) => {
        console.error('Firebase Auth state error:', error);

        observedFirebaseAuthUidRef.current = '';
        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);

        setFirebaseAuthUser(null);
        clearUserAuthenticatedSession('firebase-auth-state-error', {
          clearTransition: true,
        });
        setFirebaseAuthReady(true);
      }
    );

    return unsubscribe;
  }, [clearUserAuthenticatedSession]);

  useEffect(() => {
    if (!firebaseAuthReady) return;

    if (!firebaseAuthUser) {
      setCurrentAuthAdminAccount(null);
      setCurrentAuthRoleErrorMessage('');
      setCurrentAuthRoleReady(true);
      return;
    }

    const currentAuthUid = firebaseAuthUser.uid;

    setCurrentAuthAdminAccount(null);
    setCurrentAuthRoleErrorMessage('');
    setCurrentAuthRoleReady(false);

    const unsubscribe = onSnapshot(
      doc(db, 'adminAccounts', currentAuthUid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage('');
          setCurrentAuthRoleReady(true);
          return;
        }

        const normalizedAdminAccount =
          normalizeAdminAccounts([
            {
              ...snapshot.data(),
              id: snapshot.id,
            },
          ])[0] || null;

        const hasValidAdminUidStructure =
          Boolean(normalizedAdminAccount) &&
          snapshot.id === currentAuthUid &&
          normalizedAdminAccount.id === currentAuthUid &&
          normalizedAdminAccount.authUid === currentAuthUid;

        if (!hasValidAdminUidStructure) {
          const message =
            '관리자 계정 문서의 UID 정보가 올바르지 않습니다. adminAccounts 문서 ID, id, authUid가 모두 같은지 확인해 주세요.';

          clearAdminAuthenticatedSession();

          setCurrentAuthAdminAccount(null);
          setCurrentAuthRoleErrorMessage(message);
          setCurrentAuthRoleReady(true);

          triggerToastRef.current?.(message, 'error');
          return;
        }

        setCurrentAuthAdminAccount(normalizedAdminAccount);
        setCurrentAuthRoleErrorMessage('');
        setCurrentAuthRoleReady(true);
      },
      (error) => {
        const message =
          '현재 로그인 계정의 관리자 권한을 확인하지 못했습니다. Firestore Rules를 확인해 주세요.';

        console.error('Current auth role sync error:', error);

        setCurrentAuthAdminAccount(null);
        setCurrentAuthRoleErrorMessage(message);
        setCurrentAuthRoleReady(true);

        triggerToastRef.current?.(message, 'error');
      }
    );

    return unsubscribe;
  }, [firebaseAuthReady, firebaseAuthUser?.uid]);

  useEffect(() => {
    if (!hasFirebaseAuthSession) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (!currentAuthRoleReady) {
      setUserProfileReady(false);
      return;
    }

    if (currentAuthRoleErrorMessage) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    if (currentAuthAdminAccount || authenticatedAdminId) {
      setUserProfile(null);
      setUserProfileReady(true);
      setUserProfileForm(createDefaultUserProfileForm());
      return;
    }

    setUserProfileReady(false);

    let active = true;
    let firestoreProfile = undefined;
    let postgresProfile = null;
    let postgresCandidateState = 'pending';
    let postgresCandidateError = '';
    let lastCommittedProfileKey = null;
    const cutoverConfig = readMemberProfileCutoverConfig();

    const commitResolvedProfile = ({
      profile,
      source,
      equivalent = null,
      changedFields = [],
      fallbackReason = '',
      firestoreFallbackReads = 0,
    }) => {
      if (!active) return;

      publishMemberProfileCutoverObservation({
        requested: cutoverConfig.requested,
        enabled: cutoverConfig.enabled,
        firebaseUid: firebaseAuthUser.uid,
        activeSource: source,
        equivalent,
        changedFields,
        fallbackReason,
        firestoreWatcherDisabled: cutoverConfig.firestoreWatcherDisabled,
        firestoreFallbackReads,
      });

      const nextProfileKey = profile ? JSON.stringify(profile) : '__null__';
      if (lastCommittedProfileKey === nextProfileKey) {
        setUserProfileReady(true);
        return;
      }
      lastCommittedProfileKey = nextProfileKey;

      if (!profile) {
        setUserProfile(null);
        setUserProfileForm({
          name: firebaseAuthUser.displayName || '',
          team: '',
          phonePrefix: '010',
          phoneMiddle: '',
          phoneLast: '',
          newPassword: '',
          newPasswordConfirm: '',
        });
        setUserProfileReady(true);
        return;
      }

      const parsedPhone = parseDomesticPhoneNumber(profile.phone || '');
      setUserProfile(profile);
      setUserProfileForm({
        name: profile.name || '',
        team: profile.team || '',
        phonePrefix: parsedPhone.prefix,
        phoneMiddle: parsedPhone.middle,
        phoneLast: parsedPhone.last,
        newPassword: '',
        newPasswordConfirm: '',
      });
      setUserProfileReady(true);
    };

    if (!shouldUseMemberProfileFirestoreWatcher(cutoverConfig)) {
      let refreshInFlight = false;
      const refreshPostgresProfile = async ({ allowFirestoreFallback = false } = {}) => {
        if (!active || refreshInFlight) return;
        refreshInFlight = true;
        try {
          if (allowFirestoreFallback) {
            const result = await loadMemberProfileWithoutFirestoreWatcher({
              loadPostgresCandidate: () =>
                requestMemberProfileCutoverCandidate({
                  firebaseUser: firebaseAuthUser,
                  apiBaseUrl: cutoverConfig.apiBaseUrl,
                }),
              loadFirestoreFallback: () =>
                requestMemberProfileFirestoreFallback({
                  firebaseUser: firebaseAuthUser,
                  apiBaseUrl: cutoverConfig.apiBaseUrl,
                }),
            });
            commitResolvedProfile(result);
            return;
          }

          const candidate = await requestMemberProfileCutoverCandidate({
            firebaseUser: firebaseAuthUser,
            apiBaseUrl: cutoverConfig.apiBaseUrl,
          });
          commitResolvedProfile({
            profile: candidate.profile,
            source: 'postgresql-shadow',
            equivalent: true,
            changedFields: [],
            fallbackReason: '',
            firestoreFallbackReads: 0,
          });
        } catch (error) {
          if (!active) return;
          if (allowFirestoreFallback) {
            console.error('Member profile primary read failed with Firestore watcher disabled:', {
              code: error?.code,
              candidateCode: error?.candidateCode,
            });
            commitResolvedProfile({
              profile: null,
              source: 'unavailable',
              equivalent: null,
              changedFields: [],
              fallbackReason: error?.code || 'member-profile-read-unavailable',
              firestoreFallbackReads: Number(error?.firestoreFallbackReads) || 1,
            });
            triggerToastRef.current?.(
              '회원 정보를 불러오지 못했습니다. PostgreSQL 및 Firestore 연결 상태를 확인해 주세요.',
              'error'
            );
            return;
          }
          console.warn('PostgreSQL member profile refresh failed; keeping the last known profile.', {
            code: error?.code,
            status: error?.status,
          });
        } finally {
          refreshInFlight = false;
        }
      };

      void refreshPostgresProfile({ allowFirestoreFallback: true });

      const postgresRefreshTimer = setInterval(() => {
        void refreshPostgresProfile();
      }, 15000);

      const unsubscribeWriteThrough = subscribeMemberProfileWriteThroughObservation((observation) => {
        if (
          observation?.status === 'synced' &&
          observation?.firebaseUid === firebaseAuthUser.uid
        ) {
          void refreshPostgresProfile();
        }
      });

      return () => {
        active = false;
        clearInterval(postgresRefreshTimer);
        unsubscribeWriteThrough();
      };
    }

    const applyResolvedProfile = () => {
      if (!active || firestoreProfile === undefined) return;
      const decision = chooseMemberProfileReadSource({
        firestoreProfile,
        postgresProfile,
        requested: cutoverConfig.requested && postgresCandidateState === 'ready',
      });
      const fallbackReason = cutoverConfig.requested
        ? postgresCandidateState === 'error'
          ? postgresCandidateError || 'postgres-candidate-error'
          : postgresCandidateState === 'pending'
            ? 'postgres-candidate-pending'
            : decision.fallbackReason
        : decision.fallbackReason;

      commitResolvedProfile({
        profile: decision.profile,
        source: decision.source,
        equivalent: decision.equivalent,
        changedFields: decision.changedFields,
        fallbackReason,
        firestoreFallbackReads: 0,
      });
    };

    if (cutoverConfig.requested) {
      void requestMemberProfileCutoverCandidate({
        firebaseUser: firebaseAuthUser,
        apiBaseUrl: cutoverConfig.apiBaseUrl,
      })
        .then((candidate) => {
          if (!active) return;
          postgresProfile = candidate.profile;
          postgresCandidateState = 'ready';
          postgresCandidateError = '';
          applyResolvedProfile();
        })
        .catch((error) => {
          if (!active) return;
          console.warn('PostgreSQL member profile cutover candidate unavailable; Firestore fallback remains active.', {
            code: error?.code,
            status: error?.status,
          });
          postgresProfile = null;
          postgresCandidateState = 'error';
          postgresCandidateError = error?.code || 'postgres-candidate-error';
          applyResolvedProfile();
        });
    } else {
      postgresCandidateState = 'disabled';
    }

    const unsubscribe = onSnapshot(
      doc(db, USER_ACCOUNTS_COLLECTION_NAME, firebaseAuthUser.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          firestoreProfile = null;
          publishMemberProfileReadObservation({ firebaseUid: firebaseAuthUser.uid, profile: null });
          applyResolvedProfile();
          return;
        }

        firestoreProfile = snapshot.data();
        publishMemberProfileReadObservation({
          firebaseUid: firebaseAuthUser.uid,
          profile: firestoreProfile,
        });
        applyResolvedProfile();
      },
      (error) => {
        console.error('User account sync error:', error);
        setUserProfile(null);
        setUserProfileReady(true);
        triggerToastRef.current?.(
          '마이페이지 정보를 불러오지 못했습니다. Firestore 권한을 확인해 주세요.',
          'error'
        );
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    firebaseAuthUser?.displayName,
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId
    ) {
      setCurrentUserRestriction(null);
      setCurrentUserRestrictionReady(true);
      return;
    }

    setCurrentUserRestrictionReady(false);
    const restrictionCutoverConfig = readRentalRestrictionCutoverConfig();

    if (restrictionCutoverConfig.requested) {
      let active = true;
      let refreshInFlight = false;

      const refreshRestriction = async ({ allowFirestoreFallback = false } = {}) => {
        if (!active || refreshInFlight) return;
        refreshInFlight = true;
        try {
          if (allowFirestoreFallback) {
            const result = await loadRentalRestrictionWithoutFirestoreWatcher({
              loadCandidate: () =>
                requestRentalRestrictionCandidate({
                  firebaseUser: firebaseAuthUser,
                  apiBaseUrl: restrictionCutoverConfig.apiBaseUrl,
                }),
              loadFallback: () =>
                requestRentalRestrictionFallback({
                  firebaseUser: firebaseAuthUser,
                  apiBaseUrl: restrictionCutoverConfig.apiBaseUrl,
                }),
            });
            if (!active) return;
            setCurrentUserRestriction(result.restriction);
            setCurrentUserRestrictionReady(true);
            publishRentalRestrictionCutoverObservation({
              requested: true,
              activeSource: result.source,
              firestoreWatcherDisabled: true,
              firestoreFallbackReads: result.firestoreFallbackReads,
              fallbackReason: result.fallbackReason,
              firebaseUid: firebaseAuthUser.uid,
            });
            return;
          }

          const candidate = await requestRentalRestrictionCandidate({
            firebaseUser: firebaseAuthUser,
            apiBaseUrl: restrictionCutoverConfig.apiBaseUrl,
          });
          if (!active) return;
          setCurrentUserRestriction(candidate.exists ? candidate.restriction : null);
          setCurrentUserRestrictionReady(true);
          publishRentalRestrictionCutoverObservation({
            requested: true,
            activeSource: 'postgresql-shadow',
            firestoreWatcherDisabled: true,
            firestoreFallbackReads: 0,
            fallbackReason: '',
            firebaseUid: firebaseAuthUser.uid,
          });
        } catch (error) {
          if (!active) return;
          if (allowFirestoreFallback) {
            console.error('Rental restriction PostgreSQL read and one-time Firestore fallback both failed:', error);
            setCurrentUserRestriction(null);
            setCurrentUserRestrictionReady(true);
            publishRentalRestrictionCutoverObservation({
              requested: true,
              activeSource: 'unavailable',
              firestoreWatcherDisabled: true,
              firestoreFallbackReads: Number(error?.firestoreFallbackReads) || 1,
              fallbackReason: error?.code || 'rental-restriction-unavailable',
              firebaseUid: firebaseAuthUser.uid,
            });
            triggerToastRef.current?.(
              '대여 제한 상태를 불러오지 못했습니다. PostgreSQL 및 Firestore 연결 상태를 확인해 주세요.',
              'error'
            );
          } else {
            console.warn('PostgreSQL rental restriction refresh failed; keeping the last known restriction.', {
              code: error?.code,
              status: error?.status,
            });
          }
        } finally {
          refreshInFlight = false;
        }
      };

      void refreshRestriction({ allowFirestoreFallback: true });
      const refreshTimer = setInterval(() => void refreshRestriction(), 15000);
      const unsubscribeWriteThrough = subscribeRentalRestrictionWriteThroughObservation((observation) => {
        if (observation?.status === 'synced' && observation?.firebaseUid === firebaseAuthUser.uid) {
          void refreshRestriction();
        }
      });

      return () => {
        active = false;
        clearInterval(refreshTimer);
        unsubscribeWriteThrough();
      };
    }

    publishRentalRestrictionCutoverObservation({
      requested: false,
      activeSource: 'firestore-onSnapshot',
      firestoreWatcherDisabled: false,
      firestoreFallbackReads: 0,
      fallbackReason: 'restriction-cutover-not-requested',
      firebaseUid: firebaseAuthUser.uid,
    });

    const unsubscribe = onSnapshot(
      doc(
        RENTAL_RESTRICTIONS_COLLECTION_REF,
        firebaseAuthUser.uid
      ),
      (snapshot) => {
        setCurrentUserRestriction(
          snapshot.exists()
            ? {
                ...snapshot.data(),
                uid: snapshot.id,
              }
            : null
        );
        setCurrentUserRestrictionReady(true);
      },
      (error) => {
        console.error('Rental restriction sync error:', error);
        setCurrentUserRestriction(null);
        setCurrentUserRestrictionReady(true);
        triggerToastRef.current?.(
          '대여 제한 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    const shouldSubscribeForActiveUser = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      !currentAuthRoleErrorMessage &&
      !currentAuthAdminAccount &&
      !authenticatedAdminId
    );
    const shouldSubscribeForAdminSecurity = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      (currentAuthAdminAccount || authenticatedAdminId) &&
      view === 'admin' &&
      adminTab === 'accountSecurity'
    );
    const shouldSubscribeUserSessionPolicy =
      shouldSubscribeForActiveUser || shouldSubscribeForAdminSecurity;

    if (!shouldSubscribeUserSessionPolicy) {
      setUserSessionPolicyReady(false);
      setUserSessionPolicyLoadErrorMessage('');
      return undefined;
    }

    setUserSessionPolicyReady(false);
    const unsubscribe = onSnapshot(
      USER_SESSION_POLICY_DOC_REF,
      (snapshot) => {
        setUserSessionPolicy(
          normalizeUserSessionPolicy(
            snapshot.exists() ? snapshot.data() : DEFAULT_USER_SESSION_POLICY
          )
        );
        setUserSessionPolicyLoadErrorMessage('');
        setUserSessionPolicyReady(true);
      },
      (error) => {
        console.error('User session policy sync error:', error);
        setUserSessionPolicy(DEFAULT_USER_SESSION_POLICY);
        setUserSessionPolicyLoadErrorMessage(
          '사용자 세션 정책을 불러오지 못해 기본값을 사용합니다.'
        );
        setUserSessionPolicyReady(true);
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthRoleErrorMessage,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
    view,
    adminTab,
  ]);

  useEffect(() => {
    const canReadSystemAdminSettings = Boolean(
      firebaseAuthUser &&
      currentAuthRoleReady &&
      (currentAuthAdminAccount || authenticatedAdminId)
    );

    if (!canReadSystemAdminSettings) {
      setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
      setSystemAdminSettingsReady(true);
      setSystemAdminSettingsLoadErrorMessage('');
      return undefined;
    }

    setSystemAdminSettingsReady(false);
    const unsubscribe = onSnapshot(
      SYSTEM_ADMIN_SETTINGS_DOC_REF,
      (snapshot) => {
        setSystemAdminSettings(
          normalizeSystemAdminSettings(
            snapshot.exists() ? snapshot.data() : DEFAULT_SYSTEM_ADMIN_SETTINGS
          )
        );
        setSystemAdminSettingsLoadErrorMessage('');
        setSystemAdminSettingsReady(true);
      },
      (error) => {
        console.error('System admin settings sync error:', error);
        setSystemAdminSettings(DEFAULT_SYSTEM_ADMIN_SETTINGS);
        setSystemAdminSettingsLoadErrorMessage(
          '관리자 시스템 설정을 불러오지 못했습니다.'
        );
        setSystemAdminSettingsReady(true);
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthUser?.uid,
    currentAuthRoleReady,
    currentAuthAdminAccount?.id,
    authenticatedAdminId,
  ]);

  useEffect(() => {
    if (!firebaseAuthReady || !currentAuthRoleReady) {
      setAdminAccountsReady(false);
      return undefined;
    }

    const hasAdminSession =
      Boolean(authenticatedAdminId) &&
      Boolean(currentAuthAdminAccount?.id);

    const shouldLoadAdminAccounts =
      hasAdminSession &&
      view === 'admin' &&
      adminTab === 'adminAccounts';

    if (!shouldLoadAdminAccounts) {
      allowAdminAccountsWriteRef.current = false;
      setAdminAccounts(
        hasAdminSession && currentAuthAdminAccount
          ? [currentAuthAdminAccount]
          : []
      );
      setAdminAccountsRemoteHasData(hasAdminSession);
      setAdminAccountsReady(true);
      setAdminAccountsLoadErrorMessage('');
      return undefined;
    }

    setAdminAccountsReady(false);

    const unsubscribe = onSnapshot(
      ADMIN_ACCOUNTS_COLLECTION_REF,
      (snapshot) => {
        try {
          if (snapshot.empty) {
            const message =
              '최상위 adminAccounts 컬렉션에 관리자 문서가 없습니다. 기존 관리자 데이터를 UID 문서로 이전했는지 확인해 주세요.';

            allowAdminAccountsWriteRef.current = false;
            setAdminAccountsRemoteHasData(false);
            adminAccountsLastSyncedRef.current = {};
            adminAccountsApplyingRemoteRef.current = true;
            setAdminAccounts([]);
            setAdminAccountsLoadErrorMessage(message);
            setAdminAccountsReady(true);
            return;
          }

          const remoteAdminAccounts = normalizeAdminAccounts(
            snapshot.docs.map((adminDoc) => ({
              ...adminDoc.data(),
              id: adminDoc.id,
            }))
          );

          const remoteSyncMap = Object.fromEntries(
            remoteAdminAccounts.map((account) => [
              account.id,
              JSON.stringify(account),
            ])
          );

          allowAdminAccountsWriteRef.current = true;
          setAdminAccountsRemoteHasData(true);
          setAdminAccountsLoadErrorMessage('');
          adminAccountsLastSyncedRef.current = remoteSyncMap;
          adminAccountsApplyingRemoteRef.current = true;
          setAdminAccounts(remoteAdminAccounts);
          setAdminAccountsReady(true);
        } catch (error) {
          const message =
            '관리자 ID 컬렉션 동기화 처리 중 오류가 발생했습니다.';

          console.error(
            'Admin accounts collection snapshot handling error:',
            error
          );

          allowAdminAccountsWriteRef.current = false;
          setAdminAccountsRemoteHasData(false);
          setAdminAccountsLoadErrorMessage(message);
          setAdminAccountsReady(true);
          setToast({
            message,
            type: 'error',
          });
        }
      },
      (error) => {
        const message =
          '관리자 ID 컬렉션 연결 또는 권한 오류가 발생했습니다.';

        console.error('Admin accounts collection sync error:', error);
        allowAdminAccountsWriteRef.current = false;
        setAdminAccountsRemoteHasData(false);
        setAdminAccountsLoadErrorMessage(message);
        setAdminAccountsReady(true);
        setToast({
          message,
          type: 'error',
        });
      }
    );

    return unsubscribe;
  }, [
    firebaseAuthReady,
    currentAuthRoleReady,
    authenticatedAdminId,
    currentAuthAdminAccount?.id,
    view,
    adminTab,
  ]);





}
