import { useState } from 'react';
import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import {
  PUBLIC_CONFIG_DOC_REF,
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_REQUEST_LOGS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  RENTAL_BLOCKING_REQUEST_STATUSES,
  RENTAL_EXTENSION_APPROVAL_MODE,
  RENTAL_REQUEST_AUDIT_ACTION,
  STATUS,
  USER_REQUEST_ACTION,
  USER_REQUEST_REVIEW_STATUS,
} from '../../constants/appConstants.js';
import {
  findExtensionPeriodConflict,
  getExtensionRequestAvailableDate,
  getLaptopRentalAvailability,
  getLaptopRepresentativeRequest,
  getRentalExtensionErrorMessage,
  getRentalExtensionPeriod,
  getRequestExtensionCount,
  getSafeRentalExtensionMaxCount,
  getSafeRentalExtensionRequestWaitDays,
  normalizeRentalPolicySettings,
} from '../../domain/rentalPolicy.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from '../../services/publicAssetCatalog.js';
import {
  addDaysFrom,
  today,
} from '../../utils/appUtils.js';
import { buildOverdueReturnResult } from '../../utils/overduePolicy.js';
import { hasOtherCurrentOverdueRequest } from './useAdminRequestMutationController.js';
import { syncRentalRestrictionWriteThroughBestEffort } from './rentalRestrictionReadCutover.js';

export const useAdminUserActionReviewState = () => {
  const [
    adminUserActionSavingRequestId,
    setAdminUserActionSavingRequestId,
  ] = useState('');

  return {
    adminUserActionSavingRequestId,
    setAdminUserActionSavingRequestId,
  };
};

const getOverdueReturnResult = ({
  latestRequest,
  latestSettings,
  restrictionData,
  actualReturnDate,
  batchId,
  hasOtherCurrentOverdueRequests = false,
}) =>
  buildOverdueReturnResult({
    request: latestRequest,
    actualReturnDate,
    settings: latestSettings,
    restriction: restrictionData,
    hasOtherCurrentOverdueRequests,
    batchId,
  });

const writeOverdueReturnSideEffects = ({
  transaction,
  requestId,
  requesterUid,
  returnResult,
}) => {
  if (!returnResult?.restrictionData || !requesterUid) {
    return;
  }

  const restrictionDocRef = doc(
    RENTAL_RESTRICTIONS_COLLECTION_REF,
    requesterUid
  );

  transaction.set(
    restrictionDocRef,
    {
      ...returnResult.restrictionData,
      calculatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  (returnResult.finalizedRequestIds || [])
    .filter((pendingRequestId) => pendingRequestId !== requestId)
    .forEach((pendingRequestId) => {
      transaction.update(
        doc(
          RENTAL_REQUESTS_COLLECTION_REF,
          pendingRequestId
        ),
        {
          overduePenaltyPending: false,
          overduePenaltyBatchId:
            returnResult.requestFields.overduePenaltyBatchId || '',
          updatedAt: serverTimestamp(),
          syncedAt: serverTimestamp(),
        }
      );
    });
};

export default function useAdminUserActionReviewController({
  dataSettings,
  getAdminRequestById,
  getCurrentAdminAuditActor,
  getUserRequestActionLabel,
  isSplitStorageReady,
  notifyAdminRequestMutation,
  setAdminUserActionSavingRequestId,
  setData,
  triggerToast,
  updateAdminRequestPanelRequests,
}) {
  const reviewUserActionRequest = async (
    id,
    approved
  ) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 사용자 요청을 처리할 수 없습니다.',
        'error'
      );
      return;
    }

    const currentRequest =
      getAdminRequestById(id);

    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }

    const auditActor =
      getCurrentAdminAuditActor();

    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 사용자 요청 처리를 중단했습니다.',
        'error'
      );
      return;
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );

    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      id
    );

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      currentRequest.laptopId
    );

    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );

    const restrictionDocRef = currentRequest.requesterUid
      ? doc(
          RENTAL_RESTRICTIONS_COLLECTION_REF,
          currentRequest.requesterUid
        )
      : null;

    const overdueBatchId =
      `OVERDUE-${doc(RENTAL_RESTRICTIONS_COLLECTION_REF).id}`;

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;
    let shouldKeepAvailability = false;
    let processedActionType = '';

    setAdminUserActionSavingRequestId(id);

    try {
      const hasOtherCurrentOverdueRequests =
        approved &&
        currentRequest.userActionRequest?.type === USER_REQUEST_ACTION.RETURN
          ? await hasOtherCurrentOverdueRequest({
              requesterUid: currentRequest.requesterUid,
              excludedRequestId: currentRequest.id,
              referenceDate: today(),
            })
          : false;

      await runTransaction(
        db,
        async (transaction) => {
          const [
            requestSnapshot,
            assetSnapshot,
            publicConfigSnapshot,
            restrictionSnapshot,
          ] = await Promise.all([
            transaction.get(
              requestDocRef
            ),
            transaction.get(
              assetDocRef
            ),
            transaction.get(
              PUBLIC_CONFIG_DOC_REF
            ),
            restrictionDocRef
              ? transaction.get(restrictionDocRef)
              : Promise.resolve(null),
          ]);

          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }

          if (!assetSnapshot.exists()) {
            throw new Error(
              'rental-asset-not-found'
            );
          }

          const latestRequest = {
            ...requestSnapshot.data(),
            id: requestSnapshot.id,
          };

          const latestSettings = normalizeRentalPolicySettings({
            ...dataSettings,
            ...(publicConfigSnapshot.exists()
              ? publicConfigSnapshot.data()?.settings || {}
              : {}),
          });

          const latestRestriction =
            restrictionSnapshot?.exists()
              ? {
                  ...restrictionSnapshot.data(),
                  uid: restrictionSnapshot.id,
                }
              : null;

          const userActionRequest =
            latestRequest.userActionRequest;

          if (
            !userActionRequest ||
            userActionRequest.status !==
              USER_REQUEST_REVIEW_STATUS.PENDING
          ) {
            throw new Error(
              'user-action-request-not-pending'
            );
          }

          processedActionType =
            userActionRequest.type || '';

          if (
            !Object.values(
              USER_REQUEST_ACTION
            ).includes(
              processedActionType
            )
          ) {
            throw new Error(
              'invalid-user-action-request-type'
            );
          }

          const latestAsset = {
            ...assetSnapshot.data(),
            id: assetSnapshot.id,
          };

          const latestReservations =
            normalizeAssetReservations(
              latestAsset.reservations || []
            ).filter(
              (request) =>
                request.id !== id
            );

          const nextReviewStatus =
            approved
              ? USER_REQUEST_REVIEW_STATUS.APPROVED
              : USER_REQUEST_REVIEW_STATUS.DENIED;

          let nextUserActionRequest = {
            ...userActionRequest,
            status: nextReviewStatus,
            reviewedAt:
              serverTimestamp(),
            reviewedByUid:
              auditActor.uid,
            reviewedByName:
              auditActor.name,
            reviewMemo:
              latestRequest.adminMemo || '',
          };

          const previousStatus =
            latestRequest.status || '';

          let nextStatus =
            previousStatus;

          let nextRequestFields = {
            userActionRequest:
              nextUserActionRequest,
            updatedAt:
              serverTimestamp(),
            syncedAt:
              serverTimestamp(),
          };

          let nextCommittedRequest = {
            ...latestRequest,
            userActionRequest:
              nextUserActionRequest,
          };

          let overdueReturnResult = null;

          if (approved) {
            if (
              processedActionType ===
              USER_REQUEST_ACTION.CHANGE
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              const nextStartDate =
                userActionRequest.startDate || '';

              const nextDueDate =
                userActionRequest.dueDate || '';

              const latestAvailability =
                getLaptopRentalAvailability(
                  latestAsset,
                  latestReservations,
                  dataSettings,
                  nextStartDate,
                  nextDueDate
                );

              if (
                latestAvailability.blocked
              ) {
                throw new Error(
                  'user-action-period-conflict'
                );
              }

              nextRequestFields = {
                ...nextRequestFields,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                team:
                  userActionRequest.team || '',
                borrower:
                  userActionRequest.borrower || '',
                startDate:
                  nextStartDate,
                dueDate:
                  nextDueDate,
                purpose:
                  userActionRequest.purpose || '',
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.EXTEND
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              if (!latestSettings.rentalExtensionEnabled) {
                throw new Error(
                  'rental-extension-disabled'
                );
              }

              const currentExtensionCount =
                getRequestExtensionCount(latestRequest);

              const maxExtensionCount =
                getSafeRentalExtensionMaxCount(
                  latestSettings
                );

              if (
                currentExtensionCount >=
                maxExtensionCount
              ) {
                throw new Error(
                  'rental-extension-count-exceeded'
                );
              }

              const availableDate =
                getExtensionRequestAvailableDate(
                  latestRequest,
                  latestSettings
                );

              if (
                availableDate &&
                today() < availableDate
              ) {
                const earlyError = new Error(
                  'rental-extension-too-early'
                );
                earlyError.availableDate =
                  availableDate;
                throw earlyError;
              }

              const extensionPeriod =
                getRentalExtensionPeriod(
                  latestRequest,
                  latestSettings,
                  userActionRequest.extensionDays ??
                    userActionRequest.extensionBusinessDays
                );

              const blockingRequest =
                findExtensionPeriodConflict(
                  latestReservations,
                  latestRequest.laptopId,
                  latestRequest.id,
                  extensionPeriod.extensionStartDate,
                  extensionPeriod.extensionDueDate
                );

              if (blockingRequest) {
                throw new Error(
                  'rental-extension-period-conflict'
                );
              }

              const approvalDate = today();
              const approvedAt = new Date();
              const extensionNumber =
                currentExtensionCount + 1;
              const nextExtensionRequestDate =
                addDaysFrom(
                  approvalDate,
                  getSafeRentalExtensionRequestWaitDays(
                    latestSettings
                  )
                );

              nextUserActionRequest = {
                ...nextUserActionRequest,
                approvalMode:
                  userActionRequest.approvalMode ||
                  RENTAL_EXTENSION_APPROVAL_MODE.MANUAL,
                extensionNumber,
                previousDueDate:
                  latestRequest.dueDate || '',
                extensionStartDate:
                  extensionPeriod.extensionStartDate,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionDays:
                  extensionPeriod.extensionDays,
                approvalDate,
                nextExtensionRequestDate,
              };

              const nextExtensionHistory = [
                ...(Array.isArray(latestRequest.extensionHistory)
                  ? latestRequest.extensionHistory
                  : []),
                {
                  extensionNumber,
                  approvalMode:
                    nextUserActionRequest.approvalMode,
                  previousDueDate:
                    latestRequest.dueDate || '',
                  extensionStartDate:
                    extensionPeriod.extensionStartDate,
                  newDueDate:
                    extensionPeriod.extensionDueDate,
                  extensionDays:
                    extensionPeriod.extensionDays,
                  requestedAt:
                    userActionRequest.requestedAt ||
                    approvedAt,
                  approvedAt,
                  approvedDate:
                    approvalDate,
                  approvedByUid:
                    auditActor.uid,
                  approvedByName:
                    auditActor.name,
                  status:
                    USER_REQUEST_REVIEW_STATUS.APPROVED,
                },
              ];

              nextRequestFields = {
                ...nextRequestFields,
                userActionRequest:
                  nextUserActionRequest,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionCount:
                  extensionNumber,
                lastExtensionApprovedDate:
                  approvalDate,
                nextExtensionRequestDate,
                extensionHistory:
                  nextExtensionHistory,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                userActionRequest:
                  nextUserActionRequest,
                dueDate:
                  extensionPeriod.extensionDueDate,
                extensionCount:
                  extensionNumber,
                lastExtensionApprovedDate:
                  approvalDate,
                nextExtensionRequestDate,
                extensionHistory:
                  nextExtensionHistory,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.CANCEL
            ) {
              if (
                ![
                  STATUS.REQUESTED,
                  STATUS.ON_HOLD,
                ].includes(
                  previousStatus
                )
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.USER_CANCELLED;

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
              };
            }

            if (
              processedActionType ===
              USER_REQUEST_ACTION.RETURN
            ) {
              if (
                previousStatus !==
                STATUS.APPROVED
              ) {
                throw new Error(
                  'invalid-user-action-request-status'
                );
              }

              nextStatus =
                STATUS.RETURNED;

              overdueReturnResult =
                getOverdueReturnResult({
                  latestRequest,
                  latestSettings,
                  restrictionData: latestRestriction,
                  actualReturnDate: today(),
                  batchId: overdueBatchId,
                  hasOtherCurrentOverdueRequests,
                });

              nextRequestFields = {
                ...nextRequestFields,
                status:
                  nextStatus,
                ...overdueReturnResult.requestFields,
                returnedAt:
                  serverTimestamp(),
              };

              nextCommittedRequest = {
                ...nextCommittedRequest,
                status:
                  nextStatus,
                ...overdueReturnResult.requestFields,
                returnedAt:
                  new Date(),
              };
            }
          }

          const nextAvailabilityRequest =
            toRentalAvailabilityRequest(
              nextCommittedRequest
            );

          shouldKeepAvailability =
            approved
              ? RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  nextStatus
                )
              : RENTAL_BLOCKING_REQUEST_STATUSES.includes(
                  previousStatus
                );

          const updatedReservations =
            approved
              ? shouldKeepAvailability
                ? [
                    ...latestReservations,
                    nextAvailabilityRequest,
                  ]
                : latestReservations
              : normalizeAssetReservations(
                  latestAsset.reservations || []
                );

          const representativeRequest =
            getLaptopRepresentativeRequest(
              updatedReservations,
              latestAsset.id
            );

          const nextAsset = {
            ...latestAsset,
            reservations:
              updatedReservations,
            status:
              latestAsset.status ===
              STATUS.UNAVAILABLE
                ? STATUS.UNAVAILABLE
                : representativeRequest
                  ? representativeRequest.status
                  : STATUS.AVAILABLE,
            currentRequestId:
              representativeRequest?.id ||
              null,
          };

          transaction.update(
            requestDocRef,
            nextRequestFields
          );

          if (overdueReturnResult) {
            writeOverdueReturnSideEffects({
              transaction,
              requestId: id,
              requesterUid: latestRequest.requesterUid,
              returnResult: overdueReturnResult,
            });
          }

          if (approved) {
            if (shouldKeepAvailability) {
              transaction.set(
                availabilityDocRef,
                {
                  ...nextAvailabilityRequest,
                  updatedAt:
                    serverTimestamp(),
                }
              );
            } else {
              transaction.delete(
                availabilityDocRef
              );
            }

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

            committedAsset =
              nextAsset;

            committedAvailabilityRequest =
              shouldKeepAvailability
                ? nextAvailabilityRequest
                : null;
          }

          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.USER_ACTION_REVIEWED,
              previousStatus,
              nextStatus,
              previousMemo:
                latestRequest.adminMemo || '',
              nextMemo:
                latestRequest.adminMemo || '',
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              detail:
                processedActionType ===
                USER_REQUEST_ACTION.EXTEND
                  ? `${getUserRequestActionLabel(
                      processedActionType
                    )} ${
                      approved
                        ? '승인'
                        : '불허'
                    } · ${
                      userActionRequest.extensionStartDate ||
                      '-'
                    } ~ ${
                      userActionRequest.dueDate ||
                      '-'
                    }`
                  : `${getUserRequestActionLabel(
                      processedActionType
                    )} ${
                      approved
                        ? '승인'
                        : '불허'
                    } · 요청 사유: ${
                      userActionRequest.reason ||
                      '-'
                    }`,
              createdAt:
                serverTimestamp(),
            }
          );

          committedRequest =
            nextCommittedRequest;
        }
      );

      if (!committedRequest) {
        throw new Error(
          'user-action-review-result-missing'
        );
      }

      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...committedRequest,
                userActionRequest: {
                  ...committedRequest.userActionRequest,
                  reviewedAt:
                    new Date(),
                },
              }
            : request
        )
      );

      if (
        approved &&
        committedAsset
      ) {
        setData((prev) => ({
          ...prev,
          requests:
            shouldKeepAvailability
              ? [
                  committedAvailabilityRequest,
                  ...(prev.requests || []).filter(
                    (request) =>
                      request.id !== id
                  ),
                ]
              : (prev.requests || []).filter(
                  (request) =>
                    request.id !== id
                ),
          laptops:
            (prev.laptops || []).map(
              (asset) =>
                asset.id ===
                committedAsset.id
                  ? committedAsset
                  : asset
            ),
        }));
      }

      notifyAdminRequestMutation();

      if (
        approved &&
        processedActionType === USER_REQUEST_ACTION.RETURN &&
        currentRequest.requesterUid
      ) {
        await syncRentalRestrictionWriteThroughBestEffort({
          firebaseUser: firebaseAuth.currentUser,
          firebaseUid: currentRequest.requesterUid,
          reason: `admin-user-action-${processedActionType || 'review'}-restriction`,
        });
      }

      triggerToast(
        `${getUserRequestActionLabel(
          processedActionType
        )}을 ${
          approved
            ? '승인'
            : '불허'
        }했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'User rental action review error:',
        error
      );

      const extensionErrorCodes = [
        'rental-extension-disabled',
        'rental-extension-count-exceeded',
        'rental-extension-too-early',
        'rental-extension-period-conflict',
      ];

      const errorMessage =
        error?.message ===
        'user-action-request-not-pending'
          ? '검토 대기 중인 사용자 요청이 없습니다.'
          : error?.message ===
              'invalid-user-action-request-status'
            ? '현재 신청 상태에서는 해당 사용자 요청을 승인할 수 없습니다.'
            : extensionErrorCodes.includes(
                error?.message
              )
              ? getRentalExtensionErrorMessage(
                  error.message,
                  error?.availableDate || ''
                )
              : error?.message ===
                  'user-action-period-conflict'
                ? '변경 요청 기간이 다른 예약과 겹쳐 승인할 수 없습니다.'
                : error?.message ===
                    'rental-request-not-found'
                  ? '정식 대여 신청 문서를 찾을 수 없습니다.'
                  : error?.message ===
                      'rental-asset-not-found'
                    ? '신청과 연결된 자산 문서를 찾을 수 없습니다.'
                    : `사용자 요청 처리에 실패했습니다. 오류 코드: ${
                        error?.code ||
                        error?.message ||
                        'unknown-error'
                      }`;

      triggerToast(
        errorMessage,
        'error'
      );
    } finally {
      setAdminUserActionSavingRequestId('');
    }
  };

  return {
    reviewUserActionRequest,
  };
}
