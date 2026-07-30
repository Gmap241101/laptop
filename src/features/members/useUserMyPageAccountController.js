import { useMemo, useState } from 'react';
import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getCountFromServer,
  query as firestoreQuery,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  PROFILE_REQUIRED_REASON,
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  STATUS,
  USER_REQUEST_REVIEW_STATUS,
} from '../../constants/appConstants.js';
import { normalizeRentalPolicySettings } from '../../domain/rentalPolicy.js';
import { clearUserLoginReturnTarget } from '../../routing/appRoutes.js';
import { today } from '../../utils/appUtils.js';
import {
  buildDomesticPhoneNumber,
  createAccountRecoveryEmailVerifier,
  createAccountRecoveryKey,
  createMemberIdentityKey,
  isValidDomesticPhoneNumber,
  isValidMemberName,
  maskEmailAddress,
  normalizeEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import { getCurrentOverdueRequests } from '../../utils/overduePolicy.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
  getClaimStatus,
  getRestorableUserProfileStatus,
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './memberAccountPolicy.js';

export const createDefaultUserProfileForm = () => ({
  name: '',
  team: '',
  phonePrefix: '010',
  phoneMiddle: '',
  phoneLast: '',
  newPassword: '',
  newPasswordConfirm: '',
});

export const useUserMyPageAccountState = () => {
  const [userProfileForm, setUserProfileForm] = useState(
    createDefaultUserProfileForm
  );
  const [userProfileSaving, setUserProfileSaving] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);

  return {
    setUserProfileForm,
    setUserProfileSaving,
    setWithdrawalDialogOpen,
    setWithdrawalLoading,
    setWithdrawalPassword,
    userProfileForm,
    userProfileSaving,
    withdrawalDialogOpen,
    withdrawalLoading,
    withdrawalPassword,
  };
};

export default function useUserMyPageAccountController({
  clearAdminAuthenticatedSession,
  createMemberPolicyError,
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  currentUserRentalRestrictionStatus,
  currentUserRequests,
  currentUserRestriction,
  currentUserRestrictionReady,
  dataSettings,
  firebaseAuthUser,
  getUserAuthErrorMessage,
  initialSettings,
  rentalRequestsReady,
  setUserProfileForm,
  setUserProfileSaving,
  setWithdrawalDialogOpen,
  setWithdrawalLoading,
  setWithdrawalPassword,
  showUserAccountStatus,
  triggerToast,
  userProfile,
  userProfileForm,
  withdrawalLoading,
  withdrawalPassword,
}) {
  const withdrawalBlockMessage = useMemo(() => {
    if (!firebaseAuthUser?.uid) return '';

    if (!rentalRequestsReady || !currentUserRestrictionReady) {
      return '탈퇴 가능 여부를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.';
    }

    const hasActiveRequest = currentUserRequests.some((request) =>
      [STATUS.REQUESTED, STATUS.ON_HOLD, STATUS.APPROVED].includes(request.status)
    );
    const hasPendingUserAction = currentUserRequests.some(
      (request) =>
        request?.userActionRequest?.status === USER_REQUEST_REVIEW_STATUS.PENDING
    );
    const overdueRequests = getCurrentOverdueRequests(
      currentUserRequests,
      firebaseAuthUser.uid,
      today()
    );
    const restriction = currentUserRestriction || {};
    const hasManualOrIncidentRestriction = Boolean(
      restriction.manualBlock === true ||
        restriction.indefinite === true ||
        restriction.restrictionStatus === 'active' ||
        restriction.lossDamagePending === true ||
        ['pending', 'open', 'unresolved'].includes(
          String(restriction.incidentStatus || '').toLowerCase()
        )
    );

    if (overdueRequests.length > 0) {
      return '현재 연체 중인 대여 기기가 있어 탈퇴할 수 없습니다. 연체 기기를 반납한 후 다시 시도해 주세요.';
    }

    if (
      currentUserRentalRestrictionStatus?.postPenaltyBlocked ||
      (restriction.activePenalty === true &&
        String(restriction.eligibleFromDate || '') > today())
    ) {
      return '연체로 인한 대여 제한 기간에는 탈퇴할 수 없습니다. 제한 종료 후 다시 시도해 주세요.';
    }

    if (hasManualOrIncidentRestriction) {
      return '유효한 대여 제한 또는 미처리된 분실·파손 관련 조치가 있어 탈퇴할 수 없습니다. 관리자에게 문의해 주세요.';
    }

    if (hasActiveRequest || hasPendingUserAction) {
      return '진행 중인 신청·대여 또는 검토 중인 사용자 요청이 있어 탈퇴할 수 없습니다. 관련 처리가 완료된 후 다시 시도해 주세요.';
    }

    return '';
  }, [
    currentUserRentalRestrictionStatus,
    currentUserRequests,
    currentUserRestriction,
    currentUserRestrictionReady,
    firebaseAuthUser?.uid,
    rentalRequestsReady,
  ]);

  const saveMyUserProfile = async () => {
    if (!firebaseAuthUser) {
      triggerToast('로그인 후 마이페이지를 수정할 수 있습니다.', 'error');
      return;
    }

    if (!currentAuthRoleReady) {
      triggerToast('현재 로그인 계정의 권한을 확인하는 중입니다.', 'error');
      return;
    }

    if (currentAuthRoleErrorMessage) {
      triggerToast(currentAuthRoleErrorMessage, 'error');
      return;
    }

    if (currentAuthAdminAccount) {
      triggerToast('관리자 계정은 일반 회원 정보를 수정할 수 없습니다.', 'error');
      return;
    }

    const name = normalizeMemberName(userProfileForm.name);
    const team = normalizeMemberTeam(userProfileForm.team);
    const phoneParts = {
      prefix: userProfileForm.phonePrefix,
      middle: userProfileForm.phoneMiddle,
      last: userProfileForm.phoneLast,
    };
    const phone = buildDomesticPhoneNumber(phoneParts);

    if (!isValidMemberName(name)) {
      triggerToast(
        '이름은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!team) {
      triggerToast(
        isRegisteredMemberSignupRequired(dataSettings)
          ? '부서 / 팀을 선택해 주세요.'
          : '부서 / 팀을 입력해 주세요.',
        'error'
      );
      return;
    }

    if (!isValidDomesticPhoneNumber(phoneParts)) {
      triggerToast('올바른 국내 연락처를 입력해 주세요.', 'error');
      return;
    }

    setUserProfileSaving(true);

    try {
      const nextIdentityKey = await createMemberIdentityKey(team, name);
      const nextRecoveryKey = await createAccountRecoveryKey({ team, name, phone });
      const nextRecoveryEmailVerifier = await createAccountRecoveryEmailVerifier({
        email: firebaseAuthUser.email || userProfile?.email || '',
        team,
        name,
        phone,
      });
      const nextMaskedEmail = maskEmailAddress(
        firebaseAuthUser.email || userProfile?.email || ''
      );
      const previousIdentityKey =
        userProfile?.identityKey ||
        (userProfile?.name && userProfile?.team
          ? await createMemberIdentityKey(userProfile.team, userProfile.name)
          : '');
      const previousRecoveryKey = String(userProfile?.recoveryKey || '');

      await runTransaction(db, async (transaction) => {
        const configSnapshot = await transaction.get(PUBLIC_CONFIG_DOC_REF);
        const userRef = doc(
          db,
          USER_ACCOUNTS_COLLECTION_NAME,
          firebaseAuthUser.uid
        );
        const userSnapshot = await transaction.get(userRef);
        const nextClaimRef = doc(
          MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
          nextIdentityKey
        );
        const nextRecoveryRef = doc(
          ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
          nextRecoveryKey
        );
        const nextClaimSnapshot = await transaction.get(nextClaimRef);
        const previousClaimRef =
          previousIdentityKey && previousIdentityKey !== nextIdentityKey
            ? doc(
                MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
                previousIdentityKey
              )
            : null;
        const previousClaimSnapshot = previousClaimRef
          ? await transaction.get(previousClaimRef)
          : null;
        const previousRecoveryRef =
          previousRecoveryKey && previousRecoveryKey !== nextRecoveryKey
            ? doc(
                ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
                previousRecoveryKey
              )
            : null;

        if (!userSnapshot.exists()) {
          throw createMemberPolicyError('member/account-not-ready');
        }

        const latestSettings = normalizeRentalPolicySettings({
          ...initialSettings,
          ...(configSnapshot.exists()
            ? configSnapshot.data()?.settings || {}
            : {}),
        });
        const policyEnabled = isRegisteredMemberSignupRequired(
          latestSettings
        );
        const directoryVersion = getSafeMemberDirectoryVersion(
          latestSettings
        );
        let directoryData = null;

        if (policyEnabled) {
          const directoryRef = doc(
            MEMBER_DIRECTORY_KEYS_COLLECTION_REF,
            nextIdentityKey
          );
          const directorySnapshot = await transaction.get(directoryRef);
          directoryData = directorySnapshot.exists()
            ? directorySnapshot.data()
            : null;

          if (
            !directoryData ||
            directoryData.enabled === false ||
            normalizeMemberName(directoryData.name || '') !== name ||
            normalizeMemberTeam(directoryData.team || '') !== team
          ) {
            throw createMemberPolicyError('member/directory-mismatch');
          }
        }

        const nextClaimData = nextClaimSnapshot.exists()
          ? nextClaimSnapshot.data()
          : {};
        const nextClaimCurrentUid = getClaimCurrentUid(nextClaimData);
        const nextClaimFormerUids = getClaimFormerUids(nextClaimData);

        if (
          nextClaimSnapshot.exists() &&
          (nextClaimData.conflict === true ||
            (nextClaimCurrentUid && nextClaimCurrentUid !== firebaseAuthUser.uid) ||
            (!nextClaimCurrentUid &&
              getClaimStatus(nextClaimData) === 'released' &&
              nextClaimFormerUids.length > 0 &&
              !nextClaimFormerUids.includes(firebaseAuthUser.uid)))
        ) {
          throw createMemberPolicyError('member/identity-already-claimed');
        }

        const currentAccount = userSnapshot.data();
        const shouldRestoreDirectoryMismatch =
          currentAccount.status === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
          currentAccount.profileRequiredReason ===
            PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
        const nextStatus = shouldRestoreDirectoryMismatch
          ? getRestorableUserProfileStatus(
              currentAccount.statusBeforeProfileRequired
            )
          : currentAccount.status || USER_PROFILE_STATUS.PENDING;

        transaction.set(nextClaimRef, {
          identityKey: nextIdentityKey,
          uid: firebaseAuthUser.uid,
          currentUid: firebaseAuthUser.uid,
          status: 'active',
          name,
          team,
          conflict: false,
          conflictingUids: [],
          formerUids: nextClaimFormerUids,
          directoryMemberId:
            policyEnabled && directoryData
              ? directoryData.directoryMemberId || ''
              : nextClaimData.directoryMemberId || '',
          restrictionSnapshot: nextClaimData.restrictionSnapshot || {},
          createdAt: nextClaimSnapshot.exists()
            ? nextClaimData.createdAt || serverTimestamp()
            : serverTimestamp(),
          releasedAt: '',
          updatedAt: serverTimestamp(),
        });

        if (
          previousClaimRef &&
          previousClaimSnapshot?.exists() &&
          getClaimCurrentUid(previousClaimSnapshot.data()) === firebaseAuthUser.uid
        ) {
          const previousClaimData = previousClaimSnapshot.data();
          transaction.set(
            previousClaimRef,
            {
              ...previousClaimData,
              uid: '',
              currentUid: '',
              status: 'released',
              formerUids: Array.from(
                new Set([
                  ...getClaimFormerUids(previousClaimData),
                  firebaseAuthUser.uid,
                ])
              ),
              releasedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        transaction.update(userRef, {
          email: firebaseAuthUser.email || currentAccount.email || '',
          maskedEmail: nextMaskedEmail,
          name,
          team,
          phone,
          status: nextStatus,
          identityKey: nextIdentityKey,
          recoveryKey: nextRecoveryKey,
          directoryMemberId:
            policyEnabled && directoryData
              ? directoryData.directoryMemberId || ''
              : '',
          directoryVerifiedVersion: policyEnabled
            ? directoryVersion
            : 0,
          directoryVerifiedAt: policyEnabled
            ? serverTimestamp()
            : '',
          profileRequiredReason: shouldRestoreDirectoryMismatch
            ? ''
            : currentAccount.profileRequiredReason || '',
          profileRequiredAt: shouldRestoreDirectoryMismatch
            ? ''
            : currentAccount.profileRequiredAt || '',
          statusBeforeProfileRequired: shouldRestoreDirectoryMismatch
            ? ''
            : currentAccount.statusBeforeProfileRequired || '',
          updatedAt: serverTimestamp(),
        });

        transaction.set(nextRecoveryRef, {
          recoveryKey: nextRecoveryKey,
          maskedEmail: nextMaskedEmail,
          emailVerifier: nextRecoveryEmailVerifier,
          accountStatus: nextStatus,
          enabled: true,
          updatedAt: serverTimestamp(),
        });

        if (previousRecoveryRef) {
          transaction.delete(previousRecoveryRef);
        }
      });

      await updateProfile(firebaseAuthUser, {
        displayName: name,
      });

      setUserProfileForm((previousForm) => ({
        ...previousForm,
        name,
        team,
        newPassword: '',
        newPasswordConfirm: '',
      }));

      triggerToast('마이페이지 정보가 수정되었습니다.', 'success');
    } catch (error) {
      console.error('User profile save error:', error);
      triggerToast(getUserAuthErrorMessage(error), 'error');
    } finally {
      setUserProfileSaving(false);
    }
  };

  const openWithdrawalDialog = () => {
    if (withdrawalBlockMessage) {
      triggerToast(withdrawalBlockMessage, 'error');
      return;
    }

    setWithdrawalPassword('');
    setWithdrawalDialogOpen(true);
  };

  const cancelWithdrawal = () => {
    if (withdrawalLoading) return;
    setWithdrawalPassword('');
    setWithdrawalDialogOpen(false);
  };

  const submitMembershipWithdrawal = async (event) => {
    event.preventDefault();

    if (!firebaseAuthUser || !userProfile) {
      triggerToast('로그인한 회원 정보를 확인할 수 없습니다.', 'error');
      return;
    }

    if (withdrawalBlockMessage) {
      triggerToast(withdrawalBlockMessage, 'error');
      return;
    }

    if (!withdrawalPassword) {
      triggerToast('현재 비밀번호를 입력해 주세요.', 'error');
      return;
    }

    const authEmail = normalizeEmailAddress(firebaseAuthUser.email || '');

    if (!authEmail) {
      triggerToast('재인증할 로그인 이메일을 확인할 수 없습니다.', 'error');
      return;
    }

    const credential = EmailAuthProvider.credential(
      authEmail,
      withdrawalPassword
    );
    let rollbackState = null;

    setWithdrawalLoading(true);

    try {
      await reauthenticateWithCredential(firebaseAuthUser, credential);

      const currentIdentityKey =
        userProfile.identityKey ||
        await createMemberIdentityKey(userProfile.team, userProfile.name);
      const currentRecoveryKey =
        userProfile.recoveryKey ||
        await createAccountRecoveryKey({
          team: userProfile.team,
          name: userProfile.name,
          phone: userProfile.phone,
        });
      const userRef = doc(
        db,
        USER_ACCOUNTS_COLLECTION_NAME,
        firebaseAuthUser.uid
      );
      const claimRef = doc(
        MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
        currentIdentityKey
      );
      const recoveryRef = doc(
        ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
        currentRecoveryKey
      );
      const historicalOverdueCountSnapshot = await getCountFromServer(
        firestoreQuery(
          RENTAL_REQUESTS_COLLECTION_REF,
          where('requesterUid', '==', firebaseAuthUser.uid),
          where('overdueDaysAtReturn', '>', 0)
        )
      );
      const historicalOverdueCount =
        historicalOverdueCountSnapshot.data().count;

      await runTransaction(db, async (transaction) => {
        const userSnapshot = await transaction.get(userRef);
        const claimSnapshot = await transaction.get(claimRef);
        const recoverySnapshot = await transaction.get(recoveryRef);

        if (!userSnapshot.exists()) {
          throw createMemberPolicyError('member/account-not-ready');
        }

        const currentAccount = userSnapshot.data();
        const currentClaim = claimSnapshot.exists()
          ? claimSnapshot.data()
          : {};
        const formerUids = Array.from(
          new Set([
            ...getClaimFormerUids(currentClaim),
            ...(Array.isArray(currentAccount.previousAccountUids)
              ? currentAccount.previousAccountUids
              : []),
            firebaseAuthUser.uid,
          ])
        );
        const restrictionSnapshot = {
          ...(currentUserRestriction || {}),
          lastEvaluatedAt: new Date().toISOString(),
          historicalOverdueCount,
        };

        rollbackState = {
          userData: currentAccount,
          claimExists: claimSnapshot.exists(),
          claimData: currentClaim,
          recoveryExists: recoverySnapshot.exists(),
          recoveryData: recoverySnapshot.exists()
            ? recoverySnapshot.data()
            : null,
          userRef,
          claimRef,
          recoveryRef,
        };

        transaction.set(
          claimRef,
          {
            ...currentClaim,
            identityKey: currentIdentityKey,
            uid: '',
            currentUid: '',
            status: 'released',
            name: normalizeMemberName(currentAccount.name || ''),
            team: normalizeMemberTeam(currentAccount.team || ''),
            conflict: false,
            conflictingUids: [],
            formerUids,
            directoryMemberId: currentAccount.directoryMemberId || '',
            restrictionSnapshot,
            releasedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(
          userRef,
          {
            ...currentAccount,
            status: USER_PROFILE_STATUS.RETIRED,
            name: '탈퇴회원',
            team: '',
            email: '',
            maskedEmail: '',
            phone: '',
            identityKey: '',
            recoveryKey: '',
            directoryMemberId: '',
            directoryVerifiedVersion: 0,
            directoryVerifiedAt: '',
            formerIdentityKey: currentIdentityKey,
            formerDirectoryMemberId: currentAccount.directoryMemberId || '',
            previousAccountUids: formerUids.filter(
              (uid) => uid !== firebaseAuthUser.uid
            ),
            withdrawalPreviousStatus:
              currentAccount.status || USER_PROFILE_STATUS.ACTIVE,
            withdrawalRollbackAllowed: true,
            withdrawnAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: false }
        );

        if (recoverySnapshot.exists()) {
          transaction.delete(recoveryRef);
        }
      });

      await deleteUser(firebaseAuthUser);

      setWithdrawalDialogOpen(false);
      setWithdrawalPassword('');
      clearUserLoginReturnTarget();
      clearAdminAuthenticatedSession();
      showUserAccountStatus('withdrawalComplete');
    } catch (error) {
      console.error('Membership withdrawal error:', error);

      if (rollbackState && firebaseAuth.currentUser) {
        try {
          await runTransaction(db, async (transaction) => {
            transaction.set(
              rollbackState.userRef,
              {
                ...rollbackState.userData,
                withdrawalRollbackAllowed: false,
                updatedAt: serverTimestamp(),
              },
              { merge: false }
            );

            if (rollbackState.claimExists) {
              transaction.set(
                rollbackState.claimRef,
                {
                  ...rollbackState.claimData,
                  updatedAt: serverTimestamp(),
                },
                { merge: false }
              );
            } else {
              transaction.delete(rollbackState.claimRef);
            }

            if (rollbackState.recoveryExists) {
              transaction.set(
                rollbackState.recoveryRef,
                {
                  ...rollbackState.recoveryData,
                  updatedAt: serverTimestamp(),
                },
                { merge: false }
              );
            }
          });
        } catch (rollbackError) {
          console.error('Membership withdrawal rollback error:', rollbackError);
        }
      }

      triggerToast(
        error?.code === 'auth/wrong-password' ||
          error?.code === 'auth/invalid-credential'
          ? '현재 비밀번호가 올바르지 않습니다.'
          : getUserAuthErrorMessage(error),
        'error'
      );
    } finally {
      setWithdrawalLoading(false);
    }
  };

  return {
    cancelWithdrawal,
    openWithdrawalDialog,
    saveMyUserProfile,
    submitMembershipWithdrawal,
    withdrawalBlockMessage,
  };
}
