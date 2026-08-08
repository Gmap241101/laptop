import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  doc,
  getDocs,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  MEMBER_IDENTITY_CLAIMS_COLLECTION_REF,
  PUBLIC_CONFIG_DOC_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  USER_ACCOUNTS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  PROFILE_REQUIRED_REASON,
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  createMemberIdentityKey,
  normalizeMemberName,
  normalizeMemberTeam,
} from '../../utils/memberPolicy.js';
import {
  buildMemberAccountIndexEntries,
  buildMemberAccountIndexOperations,
  commitFirestoreOperations,
} from './memberAccountIndexService.js';
import {
  getRestorableUserProfileStatus,
  getSafeMemberDirectoryVersion,
  isRegisteredMemberSignupRequired,
} from './memberAccountPolicy.js';
import { syncMemberProfilesWriteThroughBestEffort } from './memberProfileWriteThrough.js';

export default function useAdminMemberDirectoryAuditActions({
  authenticatedAdminAccount,
  authenticatedAdminId,
  borrowers,
  isAdminAuthenticated,
  isSplitStorageReady,
  settings,
  openAdminMemberAccounts,
  triggerConfirm,
  triggerToast,
}) {
  const directoryMismatchRestoreInProgressRef = useRef(false);
  const directoryMismatchRestoreAttemptKeyRef = useRef('');
  const triggerConfirmRef = useRef(triggerConfirm);
  const triggerToastRef = useRef(triggerToast);
  const [memberDirectoryAuditLoading, setMemberDirectoryAuditLoading] =
    useState(false);
  const [memberDirectoryAuditResult, setMemberDirectoryAuditResult] =
    useState(null);

  useEffect(() => {
    triggerConfirmRef.current = triggerConfirm;
  }, [triggerConfirm]);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const resetDirectoryMismatchRestoreAttempt = useCallback(() => {
    directoryMismatchRestoreAttemptKeyRef.current = '';
  }, []);


  const clearMemberDirectoryAuditResult = useCallback(() => {
    setMemberDirectoryAuditResult(null);
  }, []);

  const restoreDirectoryMismatchAccountsAfterPolicyDisabled = useCallback(
    async (sourceAccounts = null) => {
      if (directoryMismatchRestoreInProgressRef.current) {
        return 0;
      }

      directoryMismatchRestoreInProgressRef.current = true;

      try {
        const accountDocuments = Array.isArray(sourceAccounts)
          ? sourceAccounts
              .filter((account) => account?.uid)
              .map((account) => ({
                ref: doc(
                  db,
                  USER_ACCOUNTS_COLLECTION_NAME,
                  account.uid
                ),
                data: () => account,
              }))
          : (
              await getDocs(
                firestoreQuery(
                  USER_ACCOUNTS_COLLECTION_REF,
                  where(
                    'status',
                    '==',
                    USER_PROFILE_STATUS.PROFILE_REQUIRED
                  ),
                  where(
                    'profileRequiredReason',
                    '==',
                    PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH
                  )
                )
              )
            ).docs;
        const restoreOperations = [];
        const restoredUids = [];
        let restoredCount = 0;

        accountDocuments.forEach((accountDocument) => {
          const account = accountDocument.data() || {};

          if (
            account.status !== USER_PROFILE_STATUS.PROFILE_REQUIRED ||
            account.profileRequiredReason !==
              PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH
          ) {
            return;
          }

          const restoredStatus = getRestorableUserProfileStatus(
            account.statusBeforeProfileRequired
          );

          restoreOperations.push({
            type: 'update',
            ref: accountDocument.ref,
            data: {
              status: restoredStatus,
              profileRequiredReason: '',
              profileRequiredAt: '',
              statusBeforeProfileRequired: '',
              updatedAt: serverTimestamp(),
            },
          });

          if (account.recoveryKey) {
            restoreOperations.push({
              type: 'set',
              ref: doc(
                ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
                account.recoveryKey
              ),
              data: {
                recoveryKey: account.recoveryKey,
                maskedEmail: account.maskedEmail || '',
                accountStatus: restoredStatus,
                enabled: true,
                updatedAt: serverTimestamp(),
              },
              options: { merge: true },
            });
          }

          restoredUids.push(accountDocument.ref.id);
          restoredCount += 1;
        });

        if (restoreOperations.length > 0) {
          await commitFirestoreOperations(restoreOperations);
          await syncMemberProfilesWriteThroughBestEffort({
            firebaseUser: firebaseAuth.currentUser,
            firebaseUids: restoredUids,
            reason: 'admin-directory-policy-restore',
          });
        }

        return restoredCount;
      } finally {
        directoryMismatchRestoreInProgressRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    const shouldCheckDirectoryMismatchRestore =
      isAdminAuthenticated &&
      isSplitStorageReady &&
      !isRegisteredMemberSignupRequired(settings);

    if (!shouldCheckDirectoryMismatchRestore) return undefined;

    const restoreAttemptKey = `disabled:${getSafeMemberDirectoryVersion(
      settings
    )}`;

    if (
      directoryMismatchRestoreAttemptKeyRef.current === restoreAttemptKey
    ) {
      return undefined;
    }

    directoryMismatchRestoreAttemptKeyRef.current = restoreAttemptKey;
    let cancelled = false;

    void restoreDirectoryMismatchAccountsAfterPolicyDisabled()
      .then((restoredCount) => {
        if (!cancelled && restoredCount > 0) {
          triggerToastRef.current(
            `가입 제한 정책이 꺼져 있어 등록 명부 불일치 회원 ${restoredCount}명을 이전 이용 상태로 자동 복원했습니다.`,
            'success'
          );
        }
      })
      .catch((error) => {
        if (cancelled) return;

        console.error(
          'Automatic directory mismatch account restoration error:',
          error
        );
        directoryMismatchRestoreAttemptKeyRef.current = '';
        triggerToastRef.current(
          '등록 명부 불일치 회원의 자동 복원에 실패했습니다. 최신 Firestore Rules를 게시한 뒤 다시 확인해 주세요.',
          'error'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAdminAuthenticated,
    isSplitStorageReady,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    settings,
  ]);


  const executeFullMemberDirectoryAudit = useCallback(async () => {
    if (!isAdminAuthenticated) {
      triggerToastRef.current(
        '관리자 인증 후 전체 회원 검사를 실행할 수 있습니다.',
        'error'
      );
      return;
    }

    if (!isRegisteredMemberSignupRequired(settings)) {
      triggerToastRef.current(
        '회원가입 제한 정책을 저장한 뒤 전체 회원 검사를 실행해 주세요.',
        'error'
      );
      return;
    }

    setMemberDirectoryAuditLoading(true);
    setMemberDirectoryAuditResult(null);

    try {
      const directoryVersion = getSafeMemberDirectoryVersion(settings);
      const directoryEntries = await Promise.all(
        (borrowers || []).map(async (borrower) => ({
          ...borrower,
          name: normalizeMemberName(borrower.name || ''),
          team: normalizeMemberTeam(borrower.team || ''),
          identityKey: await createMemberIdentityKey(
            borrower.team,
            borrower.name
          ),
        }))
      );
      const directoryByIdentityKey = new Map(
        directoryEntries.map((entry) => [entry.identityKey, entry])
      );
      const [
        currentUserAccountsSnapshot,
        currentClaimsSnapshot,
        currentRecoverySnapshot,
      ] = await Promise.all([
        getDocs(USER_ACCOUNTS_COLLECTION_REF),
        getDocs(MEMBER_IDENTITY_CLAIMS_COLLECTION_REF),
        getDocs(ACCOUNT_RECOVERY_KEYS_COLLECTION_REF),
      ]);
      const accountEntries = await buildMemberAccountIndexEntries(
        currentUserAccountsSnapshot.docs.map((accountDocument) => ({
          ...accountDocument.data(),
          uid: accountDocument.data().uid || accountDocument.id,
        }))
      );
      const {
        accountMetadataOperations,
        claimOperations,
        recoveryOperations,
        groups: accountGroups,
      } = buildMemberAccountIndexOperations({
        accountEntries,
        currentClaimDocuments: currentClaimsSnapshot.docs,
        currentRecoveryDocuments: currentRecoverySnapshot.docs,
      });
      let duplicateAccounts = 0;

      accountGroups.forEach((group) => {
        const liveEntries = group.filter(
          (entry) => entry.account.status !== USER_PROFILE_STATUS.RETIRED
        );

        if (liveEntries.length > 1) {
          duplicateAccounts += liveEntries.length;
        }
      });

      const auditableStatuses = new Set([
        USER_PROFILE_STATUS.PENDING,
        USER_PROFILE_STATUS.ACTIVE,
        USER_PROFILE_STATUS.PROFILE_REQUIRED,
      ]);
      const auditableTotal = accountEntries.filter((entry) =>
        auditableStatuses.has(entry.account.status || '')
      ).length;
      const accountOperations = [];
      let normal = 0;
      let profileRequired = 0;
      let missing = 0;

      accountEntries.forEach((entry) => {
        const { account, identityKey, name, team } = entry;
        const accountStatus = account.status || '';
        const isAuditable = auditableStatuses.has(accountStatus);
        const group = identityKey ? accountGroups.get(identityKey) || [] : [];
        const isDuplicate =
          group.filter(
            (groupEntry) =>
              groupEntry.account.status !== USER_PROFILE_STATUS.RETIRED
          ).length > 1;
        const directoryEntry = identityKey
          ? directoryByIdentityKey.get(identityKey)
          : null;
        const directoryMatches = Boolean(
          directoryEntry &&
            directoryEntry.name === name &&
            directoryEntry.team === team
        );

        if (!isAuditable) {
          return;
        }

        if (!identityKey || !directoryMatches || isDuplicate) {
          if (!identityKey || !directoryMatches) {
            missing += 1;
          }

          profileRequired += 1;
          const nextReason = isDuplicate
            ? PROFILE_REQUIRED_REASON.DUPLICATE_IDENTITY
            : PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
          const previousStatus = [
            USER_PROFILE_STATUS.PENDING,
            USER_PROFILE_STATUS.ACTIVE,
          ].includes(accountStatus)
            ? accountStatus
            : account.statusBeforeProfileRequired ||
              USER_PROFILE_STATUS.PENDING;

          accountOperations.push({
            type: 'set',
            ref: doc(db, USER_ACCOUNTS_COLLECTION_NAME, account.uid),
            data: {
              status: USER_PROFILE_STATUS.PROFILE_REQUIRED,
              statusBeforeProfileRequired: previousStatus,
              profileRequiredReason: nextReason,
              profileRequiredAt: serverTimestamp(),
              identityKey,
              directoryMemberId: directoryMatches
                ? directoryEntry.id || ''
                : '',
              directoryVerifiedVersion: 0,
              directoryVerifiedAt: '',
              updatedAt: serverTimestamp(),
            },
            options: { merge: true },
            auditOutcome: 'profileRequired',
          });
          return;
        }

        normal += 1;
        const shouldRestore =
          accountStatus === USER_PROFILE_STATUS.PROFILE_REQUIRED &&
          account.profileRequiredReason ===
            PROFILE_REQUIRED_REASON.DIRECTORY_MISMATCH;
        const nextStatus = shouldRestore
          ? getRestorableUserProfileStatus(account.statusBeforeProfileRequired)
          : accountStatus;

        accountOperations.push({
          type: 'set',
          ref: doc(db, USER_ACCOUNTS_COLLECTION_NAME, account.uid),
          data: {
            status: nextStatus,
            identityKey,
            directoryMemberId: directoryEntry.id || '',
            directoryVerifiedVersion: directoryVersion,
            directoryVerifiedAt: serverTimestamp(),
            profileRequiredReason: shouldRestore
              ? ''
              : account.profileRequiredReason || '',
            profileRequiredAt: shouldRestore
              ? ''
              : account.profileRequiredAt || '',
            statusBeforeProfileRequired: shouldRestore
              ? ''
              : account.statusBeforeProfileRequired || '',
            updatedAt: serverTimestamp(),
          },
          options: { merge: true },
          auditOutcome: 'normal',
        });
      });

      await commitFirestoreOperations([
        ...claimOperations,
        ...recoveryOperations,
        ...accountMetadataOperations,
      ]);

      await syncMemberProfilesWriteThroughBestEffort({
        firebaseUser: firebaseAuth.currentUser,
        firebaseUids: accountMetadataOperations
          .filter((operation) => operation?.ref?.parent?.id === USER_ACCOUNTS_COLLECTION_NAME)
          .map((operation) => operation.ref.id),
        reason: 'admin-member-index-rebuild',
      });

      let failed = 0;
      const updatedAccountUids = [];

      for (const operation of accountOperations) {
        try {
          await setDoc(operation.ref, operation.data, operation.options);
          updatedAccountUids.push(operation.ref.id);
        } catch (accountError) {
          failed += 1;

          if (operation.auditOutcome === 'normal') {
            normal = Math.max(0, normal - 1);
          } else if (operation.auditOutcome === 'profileRequired') {
            profileRequired = Math.max(0, profileRequired - 1);
          }

          console.error(
            'Member directory audit account update error:',
            accountError
          );
        }
      }

      await syncMemberProfilesWriteThroughBestEffort({
        firebaseUser: firebaseAuth.currentUser,
        firebaseUids: updatedAccountUids,
        reason: 'admin-member-directory-audit',
      });

      const auditSummary = {
        total: auditableTotal,
        normal,
        profileRequired,
        duplicates: duplicateAccounts,
        missing,
        failed,
        directoryVersion,
        completedAtText: new Date().toLocaleString('ko-KR'),
        completedBy:
          authenticatedAdminAccount?.email ||
          authenticatedAdminAccount?.adminLoginId ||
          authenticatedAdminId,
        completedAt: serverTimestamp(),
      };

      await setDoc(
        PUBLIC_CONFIG_DOC_REF,
        {
          memberDirectoryAudit: auditSummary,
          settings: {
            ...settings,
            memberIdentityClaimsReady: true,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMemberDirectoryAuditResult(auditSummary);
      triggerToastRef.current(
        `전체 회원 명부 검사가 완료되었습니다. 정상 ${normal}명, 정보 수정 필요 ${profileRequired}명, 중복 ${duplicateAccounts}명, 실패 ${failed}명입니다.`,
        profileRequired > 0 || failed > 0 ? 'error' : 'success'
      );
    } catch (error) {
      console.error('Full member directory audit error:', error);
      triggerToastRef.current(
        '전체 회원 명부 검사에 실패했습니다. 기존 회원 상태는 가능한 범위에서 유지됩니다.',
        'error'
      );
    } finally {
      setMemberDirectoryAuditLoading(false);
    }
  }, [
    authenticatedAdminAccount,
    authenticatedAdminId,
    borrowers,
    isAdminAuthenticated,
    settings,
  ]);

  const runFullMemberDirectoryAudit = useCallback(() => {
    triggerConfirmRef.current(
      '전체 회원 명부 검사',
      "현재 회원 계정과 부서·사용자 명부를 비교합니다. 불일치 회원은 '정보 수정 필요' 상태로 전환되며 등록 정보는 자동으로 변경되지 않습니다. 검사를 실행하시겠습니까?",
      executeFullMemberDirectoryAudit
    );
  }, [executeFullMemberDirectoryAudit]);

  const openProfileRequiredMembers = useCallback(() => {
    openAdminMemberAccounts({
      query: '',
      statusFilter: USER_PROFILE_STATUS.PROFILE_REQUIRED,
    });
  }, [openAdminMemberAccounts]);


  return {
    clearMemberDirectoryAuditResult,
    memberDirectoryAuditLoading,
    memberDirectoryAuditResult,
    openProfileRequiredMembers,
    resetDirectoryMismatchRestoreAttempt,
    restoreDirectoryMismatchAccountsAfterPolicyDisabled,
    runFullMemberDirectoryAudit,
  };
}
