import { useMemo, useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  db,
} from '../../firebase.js';
import {
  RENTAL_EXTENSION_APPROVAL_MODE,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from '../../constants/appConstants.js';
import {
  findExtensionPeriodConflict,
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getLaptopRepresentativeRequest,
  getMaxRentalDueDate,
  getRentalExtensionApprovalMode,
  getRentalExtensionEligibility,
  getRentalExtensionErrorMessage,
  getRentalExtensionPeriod,
  getRequestExtensionCount,
  getSafeMaxRentalDays,
  getSafeRentalExtensionRequestWaitDays,
  isRentalDueBusinessDay,
  normalizeRentalPolicySettings,
} from '../../domain/rentalPolicy.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from '../../services/publicAssetCatalog.js';
import {
  addDaysFrom,
  formatDateWithKoreanWeekday,
  today,
} from '../../utils/appUtils.js';
import { getServiceBlockReason } from '../../utils/systemSettings.js';

const createDefaultUserActionForm = () => ({
  type: '',
  reason: '',
  team: '',
  borrower: '',
  startDate: '',
  dueDate: '',
  purpose: '',
});

export const useUserRequestHistoryActionState = () => {
  const [userActionDialog, setUserActionDialog] = useState(null);
  const [userActionForm, setUserActionForm] = useState(
    createDefaultUserActionForm
  );
  const [userActionSaving, setUserActionSaving] = useState(false);

  return {
    setUserActionDialog,
    setUserActionForm,
    setUserActionSaving,
    userActionDialog,
    userActionForm,
    userActionSaving,
  };
};

export default function useUserRequestHistoryActionController({
  currentUserRentalRestrictionStatus,
  currentUserRequests,
  dataBorrowers,
  dataSettings,
  firebaseAuthUser,
  loadFreshRentalRestrictionStatus,
  setData,
  setRentalRequests,
  setUserActionDialog,
  setUserActionForm,
  setUserActionSaving,
  siteSettings,
  triggerToast,
  userActionDialog,
  userActionForm,
  userActionSaving,
}) {
  const activeUserActionRentalRequest = useMemo(
    () =>
      userActionDialog?.requestId
        ? currentUserRequests.find(
            (request) => request.id === userActionDialog.requestId
          ) || null
        : null,
    [currentUserRequests, userActionDialog?.requestId]
  );

  const userActionBorrowers = useMemo(
    () =>
      (dataBorrowers || []).filter(
        (borrower) => borrower.team === userActionForm.team
      ),
    [dataBorrowers, userActionForm.team]
  );

  const submitRentalExtensionRequest = async (request) => {
    if (userActionSaving) return;

    if (
      !firebaseAuthUser?.uid ||
      !request?.id ||
      request.requesterUid !== firebaseAuthUser.uid
    ) {
      triggerToast(
        '본인 신청 정보를 확인할 수 없습니다.',
        'error'
      );
      return;
    }

    if (currentUserRentalRestrictionStatus?.blocked) {
      triggerToast(
        '연체자 대여 제한 적용 중에는 현재 보유 중인 모든 기기의 대여 연장을 신청할 수 없습니다.',
        'error'
      );
      return;
    }

    const initialEligibility = getRentalExtensionEligibility(
      request,
      dataSettings
    );

    if (!initialEligibility.allowed) {
      triggerToast(
        getRentalExtensionErrorMessage(
          initialEligibility.code,
          initialEligibility.availableDate
        ),
        'error'
      );
      return;
    }

    let latestRestrictionStatus = null;

    try {
      latestRestrictionStatus =
        await loadFreshRentalRestrictionStatus(
          firebaseAuthUser.uid
        );
    } catch (error) {
      console.error(
        'Rental extension restriction preflight error:',
        error
      );

      triggerToast(
        '대여 제한 상태를 확인하지 못해 연장 신청을 중단했습니다. 잠시 후 다시 시도해 주세요.',
        'error'
      );
      return;
    }

    if (latestRestrictionStatus?.blocked) {
      triggerToast(
        '연체자 대여 제한 적용 중에는 현재 보유 중인 모든 기기의 대여 연장을 신청할 수 없습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      request.id
    );

    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      request.id
    );

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      request.laptopId
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let committedApprovalMode = '';

    setUserActionSaving(true);

    try {
      await runTransaction(
        db,
        async (transaction) => {
          const [
            requestSnapshot,
            assetSnapshot,
            publicConfigSnapshot,
          ] = await Promise.all([
            transaction.get(requestDocRef),
            transaction.get(assetDocRef),
            transaction.get(PUBLIC_CONFIG_DOC_REF),
          ]);

          if (!requestSnapshot.exists()) {
            throw new Error('rental-request-not-found');
          }

          if (!assetSnapshot.exists()) {
            throw new Error('rental-asset-not-found');
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          if (
            latestRequest.requesterUid !==
            firebaseAuthUser.uid
          ) {
            throw new Error('rental-request-owner-mismatch');
          }

          const latestSettings = normalizeRentalPolicySettings({
            ...dataSettings,
            ...(publicConfigSnapshot.exists()
              ? publicConfigSnapshot.data()?.settings || {}
              : {}),
          });

          const eligibility = getRentalExtensionEligibility(
            latestRequest,
            latestSettings
          );

          if (!eligibility.allowed) {
            const eligibilityError = new Error(eligibility.code);
            eligibilityError.availableDate = eligibility.availableDate;
            throw eligibilityError;
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const latestReservations = normalizeAssetReservations(
            latestAsset.reservations || []
          );

          const extensionPeriod = getRentalExtensionPeriod(
            latestRequest,
            latestSettings
          );

          const blockingRequest = findExtensionPeriodConflict(
            latestReservations,
            latestRequest.laptopId,
            latestRequest.id,
            extensionPeriod.extensionStartDate,
            extensionPeriod.extensionDueDate
          );

          if (blockingRequest) {
            throw new Error('rental-extension-period-conflict');
          }

          const approvalMode = getRentalExtensionApprovalMode(
            latestSettings
          );

          const extensionNumber =
            getRequestExtensionCount(latestRequest) + 1;

          const requestActionBase = {
            type: USER_REQUEST_ACTION.EXTEND,
            reason: '',
            team: latestRequest.team || '',
            borrower: latestRequest.borrower || '',
            startDate: latestRequest.startDate || '',
            previousDueDate: latestRequest.dueDate || '',
            extensionStartDate:
              extensionPeriod.extensionStartDate,
            dueDate: extensionPeriod.extensionDueDate,
            purpose: latestRequest.purpose || '',
            approvalMode,
            extensionNumber,
            extensionDays:
              extensionPeriod.extensionDays,
            requestedAt: serverTimestamp(),
            reviewedAt: null,
            reviewedByUid: '',
            reviewedByName: '',
            reviewMemo: '',
          };

          if (
            approvalMode ===
            RENTAL_EXTENSION_APPROVAL_MODE.MANUAL
          ) {
            const pendingActionRequest = {
              ...requestActionBase,
              status:
                USER_REQUEST_REVIEW_STATUS.PENDING,
            };

            transaction.update(
              requestDocRef,
              {
                userActionRequest:
                  pendingActionRequest,
                updatedAt:
                  serverTimestamp(),
              }
            );

            committedRequest = {
              ...latestRequest,
              userActionRequest: {
                ...pendingActionRequest,
                requestedAt: new Date(),
              },
            };

            committedApprovalMode = approvalMode;
            return;
          }

          const approvalDate = today();
          const approvedAt = new Date();
          const nextExtensionRequestDate = addDaysFrom(
            approvalDate,
            getSafeRentalExtensionRequestWaitDays(
              latestSettings
            )
          );

          const approvedActionRequest = {
            ...requestActionBase,
            status:
              USER_REQUEST_REVIEW_STATUS.APPROVED,
            reviewedAt:
              serverTimestamp(),
            reviewedByUid: 'system',
            reviewedByName:
              '시스템 자동 승인',
            approvalDate,
            nextExtensionRequestDate,
          };

          const extensionHistory = [
            ...(Array.isArray(latestRequest.extensionHistory)
              ? latestRequest.extensionHistory
              : []),
            {
              extensionNumber,
              approvalMode,
              previousDueDate:
                latestRequest.dueDate || '',
              extensionStartDate:
                extensionPeriod.extensionStartDate,
              newDueDate:
                extensionPeriod.extensionDueDate,
              extensionDays:
                extensionPeriod.extensionDays,
              requestedAt: approvedAt,
              approvedAt,
              approvedDate: approvalDate,
              approvedByUid: 'system',
              approvedByName:
                '시스템 자동 승인',
              status:
                USER_REQUEST_REVIEW_STATUS.APPROVED,
            },
          ];

          const nextRequest = {
            ...latestRequest,
            dueDate:
              extensionPeriod.extensionDueDate,
            extensionCount:
              extensionNumber,
            lastExtensionApprovedDate:
              approvalDate,
            nextExtensionRequestDate,
            extensionHistory,
            userActionRequest:
              approvedActionRequest,
          };

          const nextAvailabilityRequest =
            toRentalAvailabilityRequest(nextRequest);

          const nextReservations = [
            ...latestReservations.filter(
              (reservation) =>
                reservation.id !== latestRequest.id
            ),
            nextAvailabilityRequest,
          ];

          const representativeRequest =
            getLaptopRepresentativeRequest(
              nextReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations: nextReservations,
            status:
              latestAsset.status === STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id || null,
          };

          transaction.update(
            requestDocRef,
            {
              dueDate:
                nextRequest.dueDate,
              extensionCount:
                nextRequest.extensionCount,
              lastExtensionApprovedDate:
                nextRequest.lastExtensionApprovedDate,
              nextExtensionRequestDate:
                nextRequest.nextExtensionRequestDate,
              extensionHistory:
                nextRequest.extensionHistory,
              userActionRequest:
                approvedActionRequest,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );

          transaction.set(
            availabilityDocRef,
            {
              ...nextAvailabilityRequest,
              updatedAt:
                serverTimestamp(),
            }
          );

          transaction.update(
            assetDocRef,
            {
              reservations:
                nextAsset.reservations,
              status:
                nextAsset.status,
              currentRequestId:
                nextAsset.currentRequestId,
              updatedAt:
                serverTimestamp(),
            }
          );

          committedRequest = {
            ...nextRequest,
            userActionRequest: {
              ...approvedActionRequest,
              requestedAt: approvedAt,
              reviewedAt: approvedAt,
            },
          };
          committedAsset = nextAsset;
          committedAvailabilityRequest =
            nextAvailabilityRequest;
          committedApprovalMode = approvalMode;
        }
      );

      if (!committedRequest) {
        throw new Error(
          'rental-extension-result-missing'
        );
      }

      setRentalRequests((prev) =>
        (prev || []).map((current) =>
          current.id === request.id
            ? committedRequest
            : current
        )
      );

      if (
        committedApprovalMode ===
          RENTAL_EXTENSION_APPROVAL_MODE.AUTO &&
        committedAsset &&
        committedAvailabilityRequest
      ) {
        setData((prev) => ({
          ...prev,
          requests: [
            committedAvailabilityRequest,
            ...(prev.requests || []).filter(
              (current) =>
                current.id !== request.id
            ),
          ],
          laptops: (prev.laptops || []).map(
            (asset) =>
              asset.id === committedAsset.id
                ? committedAsset
                : asset
          ),
        }));
      }

      triggerToast(
        committedApprovalMode ===
        RENTAL_EXTENSION_APPROVAL_MODE.AUTO
          ? '대여 기간이 연장되었습니다.'
          : '대여 연장 요청이 접수되었습니다.',
        'success'
      );
    } catch (error) {
      console.error(
        'Rental extension request error:',
        error
      );

      const availableDate =
        error?.availableDate || '';

      const knownErrorCodes = [
        'rental-extension-disabled',
        'invalid-rental-extension-status',
        'user-action-request-already-pending',
        'rental-extension-count-exceeded',
        'rental-extension-too-early',
        'rental-extension-period-conflict',
      ];

      const errorMessage =
        knownErrorCodes.includes(error?.message)
          ? getRentalExtensionErrorMessage(
              error.message,
              availableDate
            )
          : error?.message ===
              'rental-request-owner-mismatch'
            ? '본인 신청이 아닌 항목은 연장할 수 없습니다.'
            : error?.message ===
                'rental-request-not-found'
              ? '대여 신청 문서를 찾을 수 없습니다.'
              : error?.message ===
                  'rental-asset-not-found'
                ? '대여 기기 정보를 찾을 수 없습니다.'
                : `대여 연장 요청 처리에 실패했습니다. 오류 코드: ${
                    error?.code ||
                    error?.message ||
                    'unknown-error'
                  }`;

      triggerToast(errorMessage, 'error');
    } finally {
      setUserActionSaving(false);
    }
  };

  const openUserActionDialog = (request, type) => {
    const serviceAction =
      type === USER_REQUEST_ACTION.EXTEND
        ? 'extend'
        : type === USER_REQUEST_ACTION.RETURN
          ? 'return'
          : type === USER_REQUEST_ACTION.CANCEL
            ? 'cancel'
            : 'change';
    const actionBlockReason = getServiceBlockReason(siteSettings, serviceAction);
    if (actionBlockReason) {
      triggerToast(actionBlockReason, 'error');
      return;
    }

    if (type === USER_REQUEST_ACTION.RETURN) {
      triggerToast(
        '조기 반납 요청 기능은 제공하지 않습니다.',
        'error'
      );
      return;
    }

    if (
      !request?.id ||
      !firebaseAuthUser?.uid ||
      request.requesterUid !== firebaseAuthUser.uid
    ) {
      triggerToast(
        '본인 신청 정보를 확인할 수 없습니다.',
        'error'
      );
      return;
    }

    const pendingActionType =
      request.userActionRequest?.status ===
      USER_REQUEST_REVIEW_STATUS.PENDING
        ? request.userActionRequest.type
        : '';

    if (
      pendingActionType === USER_REQUEST_ACTION.EXTEND &&
      type !== USER_REQUEST_ACTION.CANCEL
    ) {
      triggerToast(
        '이미 검토 중인 대여 연장 신청이 있습니다.',
        'error'
      );
      return;
    }

    if (type === USER_REQUEST_ACTION.EXTEND) {
      if (currentUserRentalRestrictionStatus?.blocked) {
        triggerToast(
          '연체자 대여 제한 적용 중에는 현재 보유 중인 모든 기기의 대여 연장을 신청할 수 없습니다.',
          'error'
        );
        return;
      }

      const eligibility = getRentalExtensionEligibility(
        request,
        dataSettings
      );

      if (!eligibility.allowed) {
        triggerToast(
          getRentalExtensionErrorMessage(
            eligibility.code,
            eligibility.availableDate
          ),
          'error'
        );
        return;
      }
    }

    if (
      type === USER_REQUEST_ACTION.CHANGE &&
      ![STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status)
    ) {
      triggerToast(
        '신청정보 수정은 신청중 또는 보류 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    if (
      type === USER_REQUEST_ACTION.CANCEL &&
      request.status !== STATUS.REQUESTED
    ) {
      triggerToast(
        '대여 신청 취소는 관리자 처리 전 신청중 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    setUserActionDialog({
      requestId: request.id,
      type,
    });

    setUserActionForm({
      type,
      reason: '',
      team: request.team || '',
      borrower: request.borrower || '',
      startDate: request.startDate || '',
      dueDate: request.dueDate || '',
      purpose: request.purpose || '',
    });
  };

  const closeUserActionDialog = () => {
    if (userActionSaving) return;

    setUserActionDialog(null);
    setUserActionForm(
      createDefaultUserActionForm()
    );
  };

  const submitUserActionRequest = async () => {
    const requestId = userActionDialog?.requestId || '';
    const actionType = userActionDialog?.type || '';
    const serviceAction =
      actionType === USER_REQUEST_ACTION.EXTEND
        ? 'extend'
        : actionType === USER_REQUEST_ACTION.RETURN
          ? 'return'
          : actionType === USER_REQUEST_ACTION.CANCEL
            ? 'cancel'
            : 'change';
    const actionBlockReason = getServiceBlockReason(siteSettings, serviceAction);
    if (actionBlockReason) {
      triggerToast(actionBlockReason, 'error');
      return;
    }

    if (actionType === USER_REQUEST_ACTION.RETURN) {
      triggerToast(
        '조기 반납 요청 기능은 제공하지 않습니다.',
        'error'
      );
      return;
    }

    const currentRequest = currentUserRequests.find(
      (request) => request.id === requestId
    );

    if (
      !firebaseAuthUser?.uid ||
      !currentRequest ||
      currentRequest.requesterUid !== firebaseAuthUser.uid
    ) {
      triggerToast(
        '본인 신청 정보를 확인할 수 없습니다.',
        'error'
      );
      return;
    }

    if (actionType === USER_REQUEST_ACTION.EXTEND) {
      setUserActionDialog(null);
      setUserActionForm(createDefaultUserActionForm());
      await submitRentalExtensionRequest(currentRequest);
      return;
    }

    if (
      actionType === USER_REQUEST_ACTION.CHANGE &&
      ![STATUS.REQUESTED, STATUS.ON_HOLD].includes(currentRequest.status)
    ) {
      triggerToast(
        '신청정보 수정은 신청중 또는 보류 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    if (
      actionType === USER_REQUEST_ACTION.CANCEL &&
      currentRequest.status !== STATUS.REQUESTED
    ) {
      triggerToast(
        '대여 신청 취소는 관리자 처리 전 신청중 상태에서만 가능합니다.',
        'error'
      );
      return;
    }

    const nextStartDate = String(userActionForm.startDate || '');
    const nextDueDate = String(userActionForm.dueDate || '');
    const nextPurpose = String(userActionForm.purpose || '').trim();

    if (actionType === USER_REQUEST_ACTION.CHANGE) {
      if (!nextStartDate || !nextDueDate) {
        triggerToast(
          '변경할 대여 시작일과 반납 예정일을 입력해 주세요.',
          'error'
        );
        return;
      }

      if (nextStartDate < today()) {
        triggerToast(
          '변경할 대여 시작일은 오늘 이전으로 선택할 수 없습니다.',
          'error'
        );
        return;
      }

      if (
        getAdjustedRentalStartDate(nextStartDate, dataSettings) !==
        nextStartDate
      ) {
        triggerToast(
          '변경할 대여 시작일은 현재 설정에서 허용되는 영업일이어야 합니다.',
          'error'
        );
        return;
      }

      if (nextDueDate < nextStartDate) {
        triggerToast(
          '변경할 반납 예정일은 대여 시작일 이후여야 합니다.',
          'error'
        );
        return;
      }

      if (!isRentalDueBusinessDay(nextDueDate, dataSettings)) {
        const adjustedDueDate = getAdjustedRentalDueDate(
          nextDueDate,
          dataSettings
        );

        triggerToast(
          `선택한 반납 예정일이 휴무일이므로 다음 영업일인 ${formatDateWithKoreanWeekday(adjustedDueDate)}로 자동 조정되었습니다.`,
          'success'
        );
        setUserActionForm((prev) => ({
          ...prev,
          dueDate: adjustedDueDate,
        }));
        return;
      }

      const maxAllowedDate = getMaxRentalDueDate(
        nextStartDate,
        dataSettings
      );

      if (nextDueDate > maxAllowedDate) {
        triggerToast(
          `최장 허용 대여 기간은 대여 시작일 다음 날부터 ${getSafeMaxRentalDays(dataSettings)}일(달력 기준)입니다.`,
          'error'
        );
        return;
      }
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      requestId
    );
    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      requestId
    );
    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      currentRequest.laptopId
    );

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailability = null;

    setUserActionSaving(true);

    try {
      await runTransaction(db, async (transaction) => {
        const [requestSnapshot, assetSnapshot, publicConfigSnapshot] =
          await Promise.all([
            transaction.get(requestDocRef),
            transaction.get(assetDocRef),
            transaction.get(PUBLIC_CONFIG_DOC_REF),
          ]);

        if (!requestSnapshot.exists()) {
          throw new Error('rental-request-not-found');
        }

        if (!assetSnapshot.exists()) {
          throw new Error('rental-asset-not-found');
        }

        const latestRequest = {
          ...requestSnapshot.data(),
          id: requestSnapshot.id,
        };

        if (latestRequest.requesterUid !== firebaseAuthUser.uid) {
          throw new Error('rental-request-owner-mismatch');
        }

        const latestAsset = {
          ...assetSnapshot.data(),
          id: assetSnapshot.id,
        };
        const storedReservations = Array.isArray(latestAsset.reservations)
          ? latestAsset.reservations
          : [];
        const latestReservations = normalizeAssetReservations(
          storedReservations
        );
        const reservationIndex = storedReservations.findIndex(
          (reservation) => reservation?.id === requestId
        );

        if (reservationIndex < 0) {
          throw new Error('asset-reservation-not-found');
        }

        if (actionType === USER_REQUEST_ACTION.CANCEL) {
          if (latestRequest.status !== STATUS.REQUESTED) {
            throw new Error('invalid-direct-cancel-status');
          }

          const nextReservations = storedReservations.filter(
            (reservation) => reservation?.id !== requestId
          );

          transaction.delete(requestDocRef);
          transaction.delete(availabilityDocRef);
          transaction.update(assetDocRef, {
            reservations: nextReservations,
            reservationMutation: {
              type: 'user-cancel',
              requestId,
              requesterUid: firebaseAuthUser.uid,
              updatedAt: serverTimestamp(),
            },
            updatedAt: serverTimestamp(),
          });

          committedAsset = {
            ...latestAsset,
            reservations: nextReservations,
          };
          return;
        }

        if (
          ![STATUS.REQUESTED, STATUS.ON_HOLD].includes(
            latestRequest.status
          )
        ) {
          throw new Error('invalid-direct-edit-status');
        }

        const latestSettings = normalizeRentalPolicySettings({
          ...dataSettings,
          ...(publicConfigSnapshot.exists()
            ? publicConfigSnapshot.data()?.settings || {}
            : {}),
        });

        if (nextStartDate < today()) {
          throw new Error('invalid-direct-edit-start-date');
        }

        if (
          getAdjustedRentalStartDate(nextStartDate, latestSettings) !==
          nextStartDate
        ) {
          throw new Error('invalid-direct-edit-start-business-day');
        }

        if (nextDueDate < nextStartDate) {
          throw new Error('invalid-direct-edit-date-order');
        }

        if (!isRentalDueBusinessDay(nextDueDate, latestSettings)) {
          throw new Error('invalid-direct-edit-due-business-day');
        }

        if (
          nextDueDate >
          getMaxRentalDueDate(nextStartDate, latestSettings)
        ) {
          throw new Error('invalid-direct-edit-max-days');
        }

        const blockingRequest = findExtensionPeriodConflict(
          latestReservations,
          latestRequest.laptopId,
          latestRequest.id,
          nextStartDate,
          nextDueDate
        );

        if (blockingRequest) {
          throw new Error('direct-edit-period-conflict');
        }

        const nextRequest = {
          ...latestRequest,
          startDate: nextStartDate,
          dueDate: nextDueDate,
          purpose: nextPurpose,
          userActionRequest: null,
        };
        const nextAvailability = toRentalAvailabilityRequest(nextRequest);
        const nextReservations = storedReservations.map((reservation) =>
          reservation?.id === requestId
            ? nextAvailability
            : reservation
        );

        transaction.update(requestDocRef, {
          startDate: nextStartDate,
          dueDate: nextDueDate,
          purpose: nextPurpose,
          userActionRequest: null,
          updatedAt: serverTimestamp(),
        });
        transaction.set(availabilityDocRef, {
          ...nextAvailability,
          updatedAt: serverTimestamp(),
        });
        transaction.update(assetDocRef, {
          reservations: nextReservations,
          reservationMutation: {
            type: 'user-edit',
            requestId,
            requesterUid: firebaseAuthUser.uid,
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });

        committedRequest = nextRequest;
        committedAvailability = nextAvailability;
        committedAsset = {
          ...latestAsset,
          reservations: nextReservations,
        };
      });

      if (actionType === USER_REQUEST_ACTION.CANCEL) {
        setRentalRequests((prev) =>
          (prev || []).filter((request) => request.id !== requestId)
        );
        setData((prev) => ({
          ...prev,
          requests: (prev.requests || []).filter(
            (request) => request.id !== requestId
          ),
          laptops: (prev.laptops || []).map((asset) =>
            asset.id === committedAsset?.id ? committedAsset : asset
          ),
        }));

        triggerToast(
          '대여 신청이 취소되어 신청내역에서 삭제되었습니다.',
          'success'
        );
      } else {
        setRentalRequests((prev) =>
          (prev || []).map((request) =>
            request.id === requestId ? committedRequest : request
          )
        );
        setData((prev) => ({
          ...prev,
          requests: [
            committedAvailability,
            ...(prev.requests || []).filter(
              (request) => request.id !== requestId
            ),
          ],
          laptops: (prev.laptops || []).map((asset) =>
            asset.id === committedAsset?.id ? committedAsset : asset
          ),
        }));

        triggerToast(
          '대여 신청정보가 수정되었습니다.',
          'success'
        );
      }

      setUserActionDialog(null);
      setUserActionForm(createDefaultUserActionForm());
    } catch (error) {
      console.error('Direct user rental action error:', error);

      const errorMessages = {
        'invalid-direct-cancel-status':
          '대여 신청 취소는 관리자 처리 전 신청중 상태에서만 가능합니다.',
        'invalid-direct-edit-status':
          '신청정보 수정은 신청중 또는 보류 상태에서만 가능합니다.',
        'invalid-direct-edit-start-date':
          '변경할 대여 시작일은 오늘 이전으로 선택할 수 없습니다.',
        'invalid-direct-edit-start-business-day':
          '변경할 대여 시작일은 현재 설정에서 허용되는 영업일이어야 합니다.',
        'invalid-direct-edit-date-order':
          '변경할 반납 예정일은 대여 시작일 이후여야 합니다.',
        'invalid-direct-edit-due-business-day':
          '변경할 반납 예정일은 설정된 휴무 요일과 등록 휴일을 제외한 영업일이어야 합니다.',
        'invalid-direct-edit-max-days':
          '변경한 대여 기간이 달력 기준 최대 허용 기간을 초과했습니다.',
        'direct-edit-period-conflict':
          '같은 기기의 기존 신청·예약·대여 일정과 겹쳐 수정할 수 없습니다.',
        'rental-request-owner-mismatch':
          '본인 신청이 아닌 항목은 변경할 수 없습니다.',
        'rental-request-not-found':
          '정식 대여 신청 문서를 찾을 수 없습니다.',
        'rental-asset-not-found':
          '대여 기기 정보를 찾을 수 없습니다.',
        'asset-reservation-not-found':
          '대여 기기의 예약 정보를 찾을 수 없어 처리할 수 없습니다.',
      };

      triggerToast(
        errorMessages[error?.message] ||
          `사용자 신청 처리에 실패했습니다. 오류 코드: ${
            error?.code || error?.message || 'unknown-error'
          }`,
        'error'
      );
    } finally {
      setUserActionSaving(false);
    }
  };

  return {
    activeUserActionRentalRequest,
    closeUserActionDialog,
    openUserActionDialog,
    submitUserActionRequest,
    userActionBorrowers,
  };
}
