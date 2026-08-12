import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from '../../platform/retiredLegacyDataCompat.js';
import {
  doc,
  runTransaction,
  serverTimestamp,
} from '../../platform/retiredLegacyDataCompat.js';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  PUBLIC_CONFIG_DOC_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  db,
  firebaseAuth,
} from '../../platform/appDataRefs.js';
import {
  PROFILE_REQUIRED_REASON,
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import { normalizeRentalPolicySettings } from '../../domain/rentalPolicy.js';
import {
  clearUserLoginReturnTarget,
  replaceAppPath,
} from '../../routing/appRoutes.js';
import {
  createMemberIdentityKey,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  SERVICE_MODE,
  normalizeSiteSettings,
} from '../../utils/systemSettings.js';
import { createDefaultUserAuthForm } from '../auth/useUserLoginController.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
  getRestorableUserProfileStatus,
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './memberAccountPolicy.js';
import { syncMemberProfileWriteThroughBestEffort } from './memberProfileWriteThrough.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { readUserAccountLifecycleCutoverConfig } from '../auth/userAccountLifecycleCutover.js';
import { readMemberAuthorityCutoverConfig } from './memberAuthorityCutover.js';

export const useUserMembershipStatusState = () => {
  const [
    userDirectoryVerificationLoading,
    setUserDirectoryVerificationLoading,
  ] = useState(false);
  const userDirectoryVerificationKeyRef = useRef('');
  const profileRequiredRedirectRef = useRef('');
  const userStatusLogoutInProgressRef = useRef(false);

  return {
    profileRequiredRedirectRef,
    setUserDirectoryVerificationLoading,
    userDirectoryVerificationKeyRef,
    userDirectoryVerificationLoading,
    userStatusLogoutInProgressRef,
  };
};

export default function useUserMembershipStatusController({
  runtimeSurface = 'user',
  authenticatedAdminId,
  clearAdminAuthenticatedSession,
  clearUserAuthenticatedSession,
  createMemberPolicyError,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  dataSettings,
  firebaseAuthUser,
  hasEstablishedUserSession,
  initialSettings,
  profileRequiredRedirectRef,
  setIsCommunityMenuOpen,
  setUserAuthForm,
  setUserDirectoryVerificationLoading,
  setUserTab,
  setView,
  showUserAccountStatus,
  siteSettings,
  triggerToast,
  userAuthLoading,
  userDirectoryVerificationKeyRef,
  userDirectoryVerificationLoading,
  userProfile,
  userProfileReady,
  userStatusLogoutInProgressRef,
  userTab,
  withdrawalLoading,
}) {
  const verifyUserDirectoryMembership = useCallback(
    async ({ authUser, account, force = false }) => {
      if (!authUser?.uid || !account) {
        throw createMemberPolicyError('member/account-not-ready');
      }

      const memberAuthorityConfig = readMemberAuthorityCutoverConfig();
      if (memberAuthorityConfig.memberRequested) {
        const firebaseIdToken = await authUser.getIdToken();
        const response = await clerkStagingClient.verifyMemberDirectory(firebaseIdToken);
        const verification = response?.memberDirectoryVerification || {};
        return {
          status: verification?.profile?.status || account.status || '',
          policyEnabled: Boolean(verification.policyEnabled),
          verified: Boolean(verification.verified),
          reason: verification.reason || '',
          changed: Boolean(verification.changed),
          restored:
            Boolean(verification.changed) &&
            verification?.profile?.status === USER_PROFILE_STATUS.ACTIVE &&
            account.status === USER_PROFILE_STATUS.PROFILE_REQUIRED,
          authority: 'postgresql',
        };
      }

      const normalizedName = normalizeMemberName(account.name || '');
      const normalizedTeam = normalizeMemberTeam(account.team || '');
      const identityKey = await createMemberIdentityKey(
        normalizedTeam,
        normalizedName
      );

      const result = await runTransaction(db, async (transaction) => {
        const configRef = PUBLIC_CONFIG_DOC_REF;
        const userRef = doc(
          db,
          USER_ACCOUNTS_COLLECTION_NAME,
          authUser.uid
        );
        const directoryRef = doc(
          MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
          identityKey
        );
        const claimRef = doc(
          MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
          identityKey
        );

        const configSnapshot = await transaction.get(configRef);
        const userSnapshot = await transaction.get(userRef);

        if (!userSnapshot.exists()) {
          throw createMemberPolicyError('member/account-not-ready');
        }

        const currentAccount = userSnapshot.data();
        const latestName = normalizeMemberName(currentAccount.name || '');
        const latestTeam = normalizeMemberTeam(currentAccount.team || '');

        if (latestName !== normalizedName || latestTeam !== normalizedTeam) {
          throw createMemberPolicyError('member/profile-changed');
        }

        const settings = normalizeRentalPolicySettings({
          ...initialSettings,
          ...(configSnapshot.exists()
            ? configSnapshot.data()?.settings || {}
            : {}),
        });
        const policyEnabled = isRegisteredMemberSignupRequired(settings);
        const directoryVersion = getSafeMemberDirectoryVersion(settings);
        const currentStatus = currentAccount.status || '';

        if (!policyEnabled) {
          if (
            currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
            currentAccount.profileRequiredReason ===
              PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH
          ) {
            const restoredStatus = getRestorableUserProfileStatus(
              currentAccount.statusBeforeProfileRequired
            );

            transaction.update(userRef, {
              status: restoredStatus,
              profileRequiredReason: '',
              profileRequiredAt: '',
              statusBeforeProfileRequired: '',
              updatedAt: serverTimestamp(),
            });

            if (currentAccount.recoveryKey) {
              transaction.set(
                doc(
                  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
                  currentAccount.recoveryKey
                ),
                {
                  recoveryKey: currentAccount.recoveryKey,
                  maskedEmail: currentAccount.maskedEmail || '',
                  accountStatus: restoredStatus,
                  enabled: true,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            }

            return {
              status: restoredStatus,
              policyEnabled: false,
              restored: true,
              changed: true,
            };
          }

          return {
            status: currentStatus,
            policyEnabled: false,
            restored: false,
            changed: false,
          };
        }

        if (
          !force &&
          currentStatus === USER_PROFILE_STATUS.ACTIVE &&
          Number(currentAccount.directoryVerifiedVersion || 0) ===
            directoryVersion
        ) {
          return {
            status: currentStatus,
            policyEnabled: true,
            verified: true,
            changed: false,
          };
        }

        const directorySnapshot = await transaction.get(directoryRef);
        const claimSnapshot = await transaction.get(claimRef);
        const directoryData = directorySnapshot.exists()
          ? directorySnapshot.data()
          : null;
        const claimData = claimSnapshot.exists()
          ? claimSnapshot.data()
          : null;

        const directoryMatches = Boolean(
          directoryData &&
            directoryData.enabled !== false &&
            normalizeMemberName(directoryData.name || '') === normalizedName &&
            normalizeMemberTeam(directoryData.team || '') === normalizedTeam
        );
        const claimConflict = Boolean(
          claimData &&
            (claimData.conflict === true ||
              getClaimCurrentUid(claimData) !== authUser.uid)
        );

        if (directoryMatches && !claimConflict) {
          transaction.set(
            claimRef,
            {
              identityKey,
              uid: authUser.uid,
              currentUid: authUser.uid,
              status: 'active',
              name: normalizedName,
              team: normalizedTeam,
              conflict: false,
              conflictingUids: [],
              formerUids: getClaimFormerUids(claimData || {}),
              directoryMemberId: directoryData.directoryMemberId || '',
              restrictionSnapshot: claimData?.restrictionSnapshot || {},
              createdAt: claimData?.createdAt || serverTimestamp(),
              releasedAt: '',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          const shouldRestore =
            currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
            currentAccount.profileRequiredReason ===
              PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
          const nextStatus = shouldRestore
            ? getRestorableUserProfileStatus(
                currentAccount.statusBeforeProfileRequired
              )
            : currentStatus;

          transaction.update(userRef, {
            status: nextStatus,
            identityKey,
            directoryMemberId: directoryData.directoryMemberId || '',
            directoryVerifiedVersion: directoryVersion,
            directoryVerifiedAt: serverTimestamp(),
            profileRequiredReason: shouldRestore
              ? ''
              : currentAccount.profileRequiredReason || '',
            profileRequiredAt: shouldRestore
              ? ''
              : currentAccount.profileRequiredAt || '',
            statusBeforeProfileRequired: shouldRestore
              ? ''
              : currentAccount.statusBeforeProfileRequired || '',
            updatedAt: serverTimestamp(),
          });

          if (currentAccount.recoveryKey) {
            transaction.set(
              doc(
                ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
                currentAccount.recoveryKey
              ),
              {
                accountStatus: nextStatus,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          return {
            status: nextStatus,
            policyEnabled: true,
            verified: true,
            restored: shouldRestore,
            changed: true,
          };
        }

        const nextReason = claimConflict
          ? PROFILE_REQUIRED_REASON.DUPLICATE_IDENTITY
          : PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
        const statusBeforeProfileRequired =
          [USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PENDING].includes(
            currentStatus
          )
            ? currentStatus
            : currentAccount.statusBeforeProfileRequired ||
              USER_PROFILE_STATUS.PENDING;

        transaction.update(userRef, {
          status: USER_PROFILE_STATUS.PROFILE_REQUIRED,
          statusBeforeProfileRequired,
          profileRequiredReason: nextReason,
          profileRequiredAt: serverTimestamp(),
          identityKey,
          directoryMemberId: directoryMatches
            ? directoryData.directoryMemberId || ''
            : '',
          directoryVerifiedVersion: 0,
          directoryVerifiedAt: '',
          updatedAt: serverTimestamp(),
        });

        if (currentAccount.recoveryKey) {
          transaction.set(
            doc(
              ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
              currentAccount.recoveryKey
            ),
            {
              accountStatus: USER_PROFILE_STATUS.PROFILE_REQUIRED,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        return {
          status: USER_PROFILE_STATUS.PROFILE_REQUIRED,
          policyEnabled: true,
          verified: false,
          reason: nextReason,
          changed: true,
        };
      });

      if (result?.changed) {
        await syncMemberProfileWriteThroughBestEffort({
          firebaseUser: authUser,
          firebaseUid: authUser.uid,
          reason: 'user-directory-membership-sync',
        });
      }

      return result;
    },
    [createMemberPolicyError, initialSettings]
  );

  useEffect(() => {
    if (runtimeSurface !== 'user') return undefined;
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      userProfile.uid !== firebaseAuthUser.uid ||
      !hasEstablishedUserSession ||
      userAuthLoading ||
      withdrawalLoading
    ) {
      return undefined;
    }

    const currentStatus = userProfile.status || '';

    if (currentStatus === USER_PROFILE_STATUS.ACTIVE) {
      const wasRedirectedForProfileRequired =
        profileRequiredRedirectRef.current.startsWith(
          `${firebaseAuthUser.uid}:`
        );

      profileRequiredRedirectRef.current = '';

      if (wasRedirectedForProfileRequired && userTab === 'mypage') {
        replaceAppPath('user', 'rental');
        setView('user');
        setUserTab('rental');
        setIsCommunityMenuOpen(false);
        triggerToast(
          '회원 상태가 정상 이용 가능 상태로 복원되었습니다.',
          'success'
        );
      }

      return undefined;
    }

    if (currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED) {
      const redirectKey = `${firebaseAuthUser.uid}:${userProfile.profileRequiredReason || ''}`;

      if (profileRequiredRedirectRef.current !== redirectKey) {
        profileRequiredRedirectRef.current = redirectKey;
        replaceAppPath('user', 'mypage');
        setView('user');
        setUserTab('mypage');
        setIsCommunityMenuOpen(false);
        triggerToast(
          '등록 정보 확인이 필요합니다. 부서와 성명을 수정해 주세요.',
          'error'
        );
      }

      return undefined;
    }

    if (userStatusLogoutInProgressRef.current) {
      return undefined;
    }

    userStatusLogoutInProgressRef.current = true;

    const logoutInactiveUser = async () => {
      try {
        let confirmedStatus = currentStatus;
        const lifecycleConfig = readUserAccountLifecycleCutoverConfig();
        if (lifecycleConfig.userAuthRequested) {
          const sessionPayload = await clerkStagingClient.getUserClerkSession();
          const postgresStatusSource = String(sessionPayload?.compatibility?.memberStatusSource || '').trim();
          const postgresStatus = String(sessionPayload?.userAuthentication?.memberStatus || '').trim();
          if (postgresStatusSource === 'postgresql' && postgresStatus) {
            confirmedStatus = postgresStatus;
          }
        }

        if (
          [USER_PROFILE_STATUS.ACTIVE, USER_PROFILE_STATUS.PROFILE_REQUIRED].includes(
            confirmedStatus
          )
        ) {
          return;
        }

        const statusPageType =
          confirmedStatus === USER_PROFILE_STATUS.PENDING
            ? 'loginPending'
            : confirmedStatus === USER_PROFILE_STATUS.BLOCKED
              ? 'loginBlocked'
              : 'loginRetired';

        showUserAccountStatus(statusPageType);
        clearUserAuthenticatedSession('inactive-member-status', {
          clearTransition: true,
        });
        await clerkStagingClient.signOut().catch((logoutError) => {
          console.error('Inactive user Clerk logout error:', logoutError);
        });
        await signOut(firebaseAuth);

        clearUserLoginReturnTarget();
        clearAdminAuthenticatedSession();
        setUserAuthForm(createDefaultUserAuthForm());
      } catch (error) {
        console.error('Inactive user PostgreSQL status verification/logout error:', error);
        triggerToast(
          'PostgreSQL 회원 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      } finally {
        userStatusLogoutInProgressRef.current = false;
      }
    };

    void logoutInactiveUser();
    return undefined;
  }, [
    authenticatedAdminId,
    clearAdminAuthenticatedSession,
    clearUserAuthenticatedSession,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    firebaseAuthUser,
    hasEstablishedUserSession,
    profileRequiredRedirectRef,
    setIsCommunityMenuOpen,
    setUserAuthForm,
    setUserTab,
    setView,
    showUserAccountStatus,
    triggerToast,
    userAuthLoading,
    userProfile,
    userProfileReady,
    userStatusLogoutInProgressRef,
    userTab,
    withdrawalLoading,
    runtimeSurface,
  ]);

  useEffect(() => {
    if (runtimeSurface !== 'user') return undefined;
    if (
      !firebaseAuthUser ||
      !currentAuthRoleReady ||
      currentAuthRoleErrorMessage ||
      currentAuthAdminAccount ||
      authenticatedAdminId ||
      !userProfileReady ||
      !userProfile ||
      userAuthLoading ||
      userDirectoryVerificationLoading
    ) {
      return undefined;
    }

    const policyEnabled = isRegisteredMemberSignupRequired(dataSettings);
    const directoryVersion = getSafeMemberDirectoryVersion(dataSettings);
    const currentStatus = userProfile.status || '';
    const isDirectoryMismatchProfile =
      currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
      userProfile.profileRequiredReason ===
        PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
    const needsVerification =
      isDirectoryMismatchProfile ||
      (policyEnabled &&
        currentStatus === USER_PROFILE_STATUS.ACTIVE &&
        Number(userProfile.directoryVerifiedVersion || 0) !==
          directoryVersion);

    if (!needsVerification) {
      return undefined;
    }

    const serviceMode = normalizeSiteSettings(siteSettings).serviceMode;
    const isPolicyDisabledRestore =
      !policyEnabled &&
      currentStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
      userProfile.profileRequiredReason ===
        PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;

    if (
      serviceMode !== SERVICE_MODE.NORMAL &&
      !isPolicyDisabledRestore
    ) {
      return undefined;
    }

    const verificationKey = [
      firebaseAuthUser.uid,
      policyEnabled ? 'on' : 'off',
      directoryVersion,
      currentStatus,
      userProfile.name || '',
      userProfile.team || '',
      userProfile.profileRequiredReason || '',
    ].join(':');

    if (userDirectoryVerificationKeyRef.current === verificationKey) {
      return undefined;
    }

    userDirectoryVerificationKeyRef.current = verificationKey;
    setUserDirectoryVerificationLoading(true);

    void verifyUserDirectoryMembership({
      authUser: firebaseAuthUser,
      account: userProfile,
    })
      .catch((error) => {
        console.error('User directory verification error:', error);
        userDirectoryVerificationKeyRef.current = '';
        triggerToast(
          error?.code === 'permission-denied'
            ? '회원가입 명부 정책 변경에 따른 회원 상태 동기화 권한이 거부되었습니다. 최신 Firestore Rules를 게시한 뒤 다시 로그인해 주세요.'
            : '회원 명부 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
          'error'
        );
      })
      .finally(() => {
        setUserDirectoryVerificationLoading(false);
      });

    return undefined;
  }, [
    authenticatedAdminId,
    currentAuthAdminAccount,
    currentAuthRoleErrorMessage,
    currentAuthRoleReady,
    dataSettings,
    firebaseAuthUser,
    setUserDirectoryVerificationLoading,
    siteSettings,
    triggerToast,
    userAuthLoading,
    userDirectoryVerificationKeyRef,
    userDirectoryVerificationLoading,
    userProfile,
    userProfileReady,
    verifyUserDirectoryMembership,
    runtimeSurface,
  ]);

  return {
    verifyUserDirectoryMembership,
  };
}
