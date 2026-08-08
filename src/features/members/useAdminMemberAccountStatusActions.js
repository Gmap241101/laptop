import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

import {
  ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
  USER_ACCOUNTS_COLLECTION_NAME,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  USER_PROFILE_STATUS,
} from '../../constants/memberConstants.js';
import {
  today,
} from '../../utils/appUtils.js';
import {
  loadMemberAccountHistorySummary,
} from './memberAccountHistoryService.js';
import {
  getUserAccountStatusLabel,
} from './memberAccountPolicy.js';
import { syncMemberProfileWriteThroughBestEffort } from './memberProfileWriteThrough.js';
import { syncRentalRestrictionWriteThroughBestEffort } from '../requests/rentalRestrictionReadCutover.js';

const VALID_USER_ACCOUNT_STATUSES = new Set([
  USER_PROFILE_STATUS.PENDING,
  USER_PROFILE_STATUS.ACTIVE,
  USER_PROFILE_STATUS.PROFILE_REQUIRED,
  USER_PROFILE_STATUS.BLOCKED,
  USER_PROFILE_STATUS.RETIRED,
]);

export default function useAdminMemberAccountStatusActions({
  isAdminAuthenticated,
  triggerConfirm,
  triggerToast,
}) {
  const triggerConfirmRef = useRef(triggerConfirm);
  const triggerToastRef = useRef(triggerToast);
  const [adminUserAccountSavingUid, setAdminUserAccountSavingUid] =
    useState('');

  useEffect(() => {
    triggerConfirmRef.current = triggerConfirm;
  }, [triggerConfirm]);

  useEffect(() => {
    triggerToastRef.current = triggerToast;
  }, [triggerToast]);

  const updateUserAccountStatus = useCallback(
    async (account, nextStatus) => {
      const userUid = account?.uid || '';

      if (!isAdminAuthenticated || !userUid) {
        triggerToastRef.current(
          '관리자 인증과 회원 UID를 확인해 주세요.',
          'error'
        );
        return;
      }

      if (!VALID_USER_ACCOUNT_STATUSES.has(nextStatus)) {
        triggerToastRef.current(
          '지원하지 않는 회원 상태입니다.',
          'error'
        );
        return;
      }

      if (
        nextStatus === USER_PROFILE_STATUS.ACTIVE &&
        account.rejoinedAccount
      ) {
        let historySummary;

        try {
          historySummary = await loadMemberAccountHistorySummary(account);
        } catch (error) {
          console.error('Rejoined member history check error:', error);
          triggerToastRef.current(
            '이전 계정의 진행 중 신청 여부를 확인하지 못해 가입 승인을 중단했습니다. 잠시 후 다시 시도해 주세요.',
            'error'
          );
          return;
        }

        if (historySummary.activeRequests > 0) {
          triggerToastRef.current(
            `이전 계정에 진행 중인 신청 또는 대여 ${historySummary.activeRequests}건이 남아 있어 가입을 승인할 수 없습니다. 기존 신청을 먼저 정리해 주세요.`,
            'error'
          );
          return;
        }
      }

      setAdminUserAccountSavingUid(userUid);

      try {
        const batch = writeBatch(db);
        batch.set(
          doc(db, USER_ACCOUNTS_COLLECTION_NAME, userUid),
          {
            status: nextStatus,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (account.recoveryKey) {
          batch.set(
            doc(
              ACCOUNT_RECOVERY_KEYS_COLLECTION_REF,
              account.recoveryKey
            ),
            {
              accountStatus: nextStatus,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        const inheritedRestriction = account.inheritedRestriction || {};
        const inheritedRestrictionStillActive = Boolean(
          nextStatus === USER_PROFILE_STATUS.ACTIVE &&
            account.rejoinedAccount &&
            (inheritedRestriction.manualBlock === true ||
              inheritedRestriction.indefinite === true ||
              inheritedRestriction.restrictionStatus === 'active' ||
              (inheritedRestriction.activePenalty === true &&
                String(inheritedRestriction.eligibleFromDate || '') > today()))
        );

        if (inheritedRestrictionStillActive) {
          batch.set(
            doc(RENTAL_RESTRICTIONS_COLLECTION_REF, userUid),
            {
              ...inheritedRestriction,
              uid: userUid,
              inheritedFromPreviousAccount: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        await batch.commit();

        await syncMemberProfileWriteThroughBestEffort({
          firebaseUser: firebaseAuth.currentUser,
          firebaseUid: userUid,
          reason: 'admin-member-status-change',
        });

        if (inheritedRestrictionStillActive) {
          await syncRentalRestrictionWriteThroughBestEffort({
            firebaseUser: firebaseAuth.currentUser,
            firebaseUid: userUid,
            reason: 'admin-member-inherited-restriction',
          });
        }

        triggerToastRef.current(
          `${account.name || account.email || userUid} 회원을 ${getUserAccountStatusLabel(
            nextStatus
          )} 상태로 변경했습니다.`,
          'success'
        );
      } catch (error) {
        console.error('User account status update error:', error);

        triggerToastRef.current(
          `회원 상태 변경에 실패했습니다. 오류 코드: ${
            error?.code || error?.message || 'unknown-error'
          }`,
          'error'
        );
      } finally {
        setAdminUserAccountSavingUid('');
      }
    },
    [isAdminAuthenticated]
  );

  const confirmUserAccountStatusChange = useCallback(
    (account, nextStatus) => {
      const accountLabel =
        account?.name || account?.email || account?.uid || '선택한 회원';

      triggerConfirmRef.current(
        '회원 상태 변경',
        `${accountLabel} 회원을 ${getUserAccountStatusLabel(
          nextStatus
        )} 상태로 변경하시겠습니까?`,
        () => updateUserAccountStatus(account, nextStatus)
      );
    },
    [updateUserAccountStatus]
  );

  return {
    adminUserAccountSavingUid,
    confirmUserAccountStatusChange,
  };
}
