import { useCallback, useState } from 'react';
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
import { initialData } from '../../services/appDataCompatibilityService.js';
import { normalizeRentalPolicySettings } from '../../domain/rentalPolicy.js';
import {
  buildDomesticPhoneNumber,
  createAccountRecoveryEmailVerifier,
  createAccountRecoveryKey,
  createMemberIdentityKey,
  isValidDomesticPhoneNumber,
  isValidMemberName,
  maskEmailAddress,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  getClaimCurrentUid,
  getClaimFormerUids,
  getClaimStatus,
  getRestorableUserProfileStatus,
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './memberAccountPolicy.js';
import {
  readMemberProfileWriteThroughConfig,
  syncMemberProfileWriteThroughBestEffort,
} from './memberProfileWriteThrough.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { publishMemberAuthorityObservation, readMemberAuthorityCutoverConfig } from './memberAuthorityCutover.js';

const createAdminMemberEditError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

export default function useAdminMemberAccountEditActions({
  isAdminAuthenticated,
  memberDirectoryPolicyEnabled = false,
  triggerToast,
}) {
  const [savingUid, setSavingUid] = useState('');

  const saveAdminMemberAccountProfile = useCallback(
    async ({ account, form }) => {
      const adminUser = firebaseAuth.currentUser;
      const targetUid = String(account?.uid || '');

      if (!isAdminAuthenticated || !adminUser || !targetUid) {
        throw createAdminMemberEditError(
          'admin/member-edit-auth-required',
          '관리자 인증과 대상 회원 정보를 확인해 주세요.'
        );
      }

      if (account?.status === USER_PROFILE_STATUS.RETIRED) {
        throw createAdminMemberEditError(
          'admin/member-edit-retired',
          '탈퇴 회원은 회원정보를 수정할 수 없습니다. 재가입은 새 회원 계정으로 처리합니다.'
        );
      }

      const name = normalizeMemberName(form?.name);
      const team = normalizeMemberTeam(form?.team);
      const phoneParts = {
        prefix: form?.phonePrefix,
        middle: form?.phoneMiddle,
        last: form?.phoneLast,
      };
      const phone = buildDomesticPhoneNumber(phoneParts);
      const directoryOverrideByAdmin = Boolean(memberDirectoryPolicyEnabled && form?.useManagedDirectory === false);

      if (!isValidMemberName(name)) {
        throw createAdminMemberEditError(
          'admin/member-edit-invalid-name',
          '이름은 공백 없이 한글 또는 영문 2~30자로 입력해 주세요.'
        );
      }

      if (!team) {
        throw createAdminMemberEditError(
          'admin/member-edit-invalid-team',
          '부서 / 팀을 입력해 주세요.'
        );
      }

      if (!isValidDomesticPhoneNumber(phoneParts)) {
        throw createAdminMemberEditError(
          'admin/member-edit-invalid-phone',
          '올바른 국내 연락처를 입력해 주세요.'
        );
      }

      setSavingUid(targetUid);

      try {
        const email = String(account?.email || '').trim().toLowerCase();
        const nextIdentityKey = await createMemberIdentityKey(team, name);
        const nextRecoveryKey = await createAccountRecoveryKey({ team, name, phone });
        const nextRecoveryEmailVerifier = await createAccountRecoveryEmailVerifier({
          email,
          team,
          name,
          phone,
        });
        const nextMaskedEmail = maskEmailAddress(email);
        let savedProfile = null;

        const memberAuthorityConfig = readMemberAuthorityCutoverConfig();
        if (memberAuthorityConfig.memberRequested) {
          const firebaseIdToken = await adminUser.getIdToken();
          const response = await clerkStagingClient.writeAdminMemberProfile(firebaseIdToken, targetUid, {
            name,
            team,
            phone,
            email,
            directoryOverrideByAdmin,
          });
          savedProfile = {
            ...account,
            ...(response?.adminMemberProfileWrite?.profile || {}),
            uid: targetUid,
            email,
            name,
            team,
            phone,
            createdAt:
              response?.adminMemberProfileWrite?.profile?.createdAt ||
              account?.createdAt ||
              null,
          };
          publishMemberAuthorityObservation({
            memberWriteRequested: true,
            memberWriteSource: response?.adminMemberProfileWrite?.authority || 'postgresql',
            memberFirestoreMirror: response?.adminMemberProfileWrite?.firestoreMirror || 'synced',
            memberMutationId: response?.adminMemberProfileWrite?.mutationId || '',
            restrictionWriteRequested: memberAuthorityConfig.restrictionRequested,
            operation: 'admin-member-profile-edit',
            error: '',
          });
        } else {
                  await runTransaction(db, async (transaction) => {
                    const configSnapshot = await transaction.get(PUBLIC_CONFIG_DOC_REF);
                    const userRef = doc(db, USER_ACCOUNTS_COLLECTION_NAME, targetUid);
                    const userSnapshot = await transaction.get(userRef);

                    if (!userSnapshot.exists()) {
                      throw createAdminMemberEditError(
                        'admin/member-edit-account-missing',
                        '대상 회원 계정을 찾을 수 없습니다.'
                      );
                    }

                    const currentAccount = userSnapshot.data();
                    const currentEmail = String(currentAccount.email || email || '').trim().toLowerCase();
                    const previousIdentityKey =
                      currentAccount.identityKey ||
                      (currentAccount.name && currentAccount.team
                        ? await createMemberIdentityKey(currentAccount.team, currentAccount.name)
                        : '');
                    const previousRecoveryKey = String(currentAccount.recoveryKey || '');

                    const nextClaimRef = doc(MEMBER_IDENTITY_CLAIMS_COLLECTION_REF, nextIdentityKey);
                    const nextRecoveryRef = doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, nextRecoveryKey);
                    const nextClaimSnapshot = await transaction.get(nextClaimRef);
                    const previousClaimRef =
                      previousIdentityKey && previousIdentityKey !== nextIdentityKey
                        ? doc(MEMBER_IDENTITY_CLAIMS_COLLECTION_REF, previousIdentityKey)
                        : null;
                    const previousClaimSnapshot = previousClaimRef
                      ? await transaction.get(previousClaimRef)
                      : null;
                    const previousRecoveryRef =
                      previousRecoveryKey && previousRecoveryKey !== nextRecoveryKey
                        ? doc(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF, previousRecoveryKey)
                        : null;

                    const latestSettings = normalizeRentalPolicySettings({
                      ...initialData.settings,
                      ...(configSnapshot.exists() ? configSnapshot.data()?.settings || {} : {}),
                    });
                    const policyEnabled = isRegisteredMemberSignupRequired(latestSettings);
                    const directoryVersion = getSafeMemberDirectoryVersion(latestSettings);
                    let directoryData = null;

                    if (policyEnabled && !directoryOverrideByAdmin) {
                      const directoryRef = doc(MEMBER_DIRECTORY_KEYS_COLLECTION_REF, nextIdentityKey);
                      const directorySnapshot = await transaction.get(directoryRef);
                      directoryData = directorySnapshot.exists() ? directorySnapshot.data() : null;

                      if (
                        !directoryData ||
                        directoryData.enabled === false ||
                        normalizeMemberName(directoryData.name || '') !== name ||
                        normalizeMemberTeam(directoryData.team || '') !== team
                      ) {
                        throw createAdminMemberEditError(
                          'admin/member-edit-directory-mismatch',
                          '등록 명부 정책과 일치하는 이름·부서 조합이 아닙니다. 회원가입 정책의 등록 명부를 먼저 확인해 주세요.'
                        );
                      }
                    }

                    const nextClaimData = nextClaimSnapshot.exists() ? nextClaimSnapshot.data() : {};
                    const nextClaimCurrentUid = getClaimCurrentUid(nextClaimData);
                    const nextClaimFormerUids = getClaimFormerUids(nextClaimData);

                    if (
                      nextClaimSnapshot.exists() &&
                      (nextClaimData.conflict === true ||
                        (nextClaimCurrentUid && nextClaimCurrentUid !== targetUid) ||
                        (!nextClaimCurrentUid &&
                          getClaimStatus(nextClaimData) === 'released' &&
                          nextClaimFormerUids.length > 0 &&
                          !nextClaimFormerUids.includes(targetUid)))
                    ) {
                      throw createAdminMemberEditError(
                        'admin/member-edit-identity-conflict',
                        '같은 이름·부서 조합을 사용하는 다른 회원 계정이 있어 수정할 수 없습니다.'
                      );
                    }

                    const shouldRestoreDirectoryMismatch =
                      currentAccount.status === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
                      currentAccount.profileRequiredReason === PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
                    const nextStatus = shouldRestoreDirectoryMismatch
                      ? getRestorableUserProfileStatus(currentAccount.statusBeforeProfileRequired)
                      : currentAccount.status || USER_PROFILE_STATUS.PENDING;

                    transaction.set(nextClaimRef, {
                      identityKey: nextIdentityKey,
                      uid: targetUid,
                      currentUid: targetUid,
                      status: 'active',
                      name,
                      team,
                      conflict: false,
                      conflictingUids: [],
                      formerUids: nextClaimFormerUids,
                      directoryMemberId:
                        policyEnabled && !directoryOverrideByAdmin && directoryData
                          ? directoryData.directoryMemberId || ''
                          : '',
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
                      getClaimCurrentUid(previousClaimSnapshot.data()) === targetUid
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
                            new Set([...getClaimFormerUids(previousClaimData), targetUid])
                          ),
                          releasedAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                        },
                        { merge: true }
                      );
                    }

                    transaction.update(userRef, {
                      email: currentEmail,
                      maskedEmail: maskEmailAddress(currentEmail) || nextMaskedEmail,
                      name,
                      team,
                      phone,
                      status: nextStatus,
                      identityKey: nextIdentityKey,
                      recoveryKey: nextRecoveryKey,
                      directoryMemberId:
                        policyEnabled && !directoryOverrideByAdmin && directoryData ? directoryData.directoryMemberId || '' : '',
                      directoryVerifiedVersion: policyEnabled && !directoryOverrideByAdmin ? directoryVersion : 0,
                      directoryOverrideByAdmin,
                      directoryVerifiedAt: policyEnabled ? serverTimestamp() : '',
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
                      maskedEmail: maskEmailAddress(currentEmail) || nextMaskedEmail,
                      emailVerifier: nextRecoveryEmailVerifier,
                      accountStatus: nextStatus,
                      enabled: nextStatus !== USER_PROFILE_STATUS.RETIRED,
                      updatedAt: serverTimestamp(),
                    });

                    if (previousRecoveryRef) {
                      transaction.delete(previousRecoveryRef);
                    }

                    savedProfile = {
                      ...currentAccount,
                      uid: targetUid,
                      email: currentEmail,
                      maskedEmail: maskEmailAddress(currentEmail) || nextMaskedEmail,
                      name,
                      team,
                      phone,
                      status: nextStatus,
                      identityKey: nextIdentityKey,
                      recoveryKey: nextRecoveryKey,
                      directoryOverrideByAdmin,
                    };
                  });

                  const writeThroughConfig = readMemberProfileWriteThroughConfig();
                  await syncMemberProfileWriteThroughBestEffort({
                    firebaseUser: adminUser,
                    firebaseUid: targetUid,
                    reason: 'admin-member-profile-edit',
                    config: {
                      ...writeThroughConfig,
                      requested: Boolean(writeThroughConfig.enabled),
                    },
                  });
        }

        triggerToast?.(`${name} 회원정보를 수정했습니다.`, 'success');
        return savedProfile;
      } catch (error) {
        console.error('Admin member profile edit error:', error);
        const code = error?.code || error?.name || 'admin_member_profile_edit_failed';
        const message = code === 'member_directory_mismatch'
          ? "지정된 부서·성명을 선택하거나 '지정된 부서·사용자 명부 사용' 체크를 해제해 직접 입력해 주세요."
          : (error?.message || '회원정보 수정에 실패했습니다.');
        triggerToast?.(`${message} 오류 코드: ${code}`, 'error');
        throw error;
      } finally {
        setSavingUid('');
      }
    },
    [isAdminAuthenticated, memberDirectoryPolicyEnabled, triggerToast]
  );

  return {
    adminMemberProfileSavingUid: savingUid,
    saveAdminMemberAccountProfile,
  };
}
