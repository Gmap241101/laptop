import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import {
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_REQUEST_LOGS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  db,
} from '../../firebase.js';
import {
  RENTAL_BLOCKING_REQUEST_STATUSES,
  RENTAL_REQUEST_AUDIT_ACTION,
  RENTAL_REQUEST_STATUS_TRANSITIONS,
  STATUS,
} from '../../constants/appConstants.js';
import {
  getAdjustedRentalDueDate,
  getLaptopRentalAvailability,
  getLaptopRepresentativeRequest,
} from '../../domain/rentalPolicy.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from '../../services/publicAssetCatalog.js';

const createMutationError = (code, details = {}) => {
  const error = new Error(code);
  Object.assign(error, details);
  return error;
};

const requireAuditActor = (auditActor = {}) => {
  if (!auditActor.uid) {
    throw createMutationError('admin-audit-actor-missing');
  }

  return {
    uid: String(auditActor.uid || ''),
    adminId: String(auditActor.adminId || ''),
    name: String(auditActor.name || ''),
  };
};

export const executeAdminRequestEditMutation = async ({
  auditActor,
  currentRequest,
  form = {},
  requestId = '',
  settings = {},
} = {}) => {
  if (!currentRequest || !requestId) {
    throw createMutationError('rental-request-not-found');
  }

  const normalizedAuditActor = requireAuditActor(auditActor);

  const nextTeam = String(
    currentRequest.requesterTeam ||
      currentRequest.team ||
      ''
  ).trim();

  const nextBorrower = String(
    currentRequest.requesterName ||
      currentRequest.borrower ||
      ''
  ).trim();

  const nextStartDate = String(form.startDate || '');
  const requestedDueDate = String(form.dueDate || '');
  const nextDueDate = getAdjustedRentalDueDate(
    requestedDueDate,
    settings
  );
  const adminDueDateAdjusted = Boolean(
    requestedDueDate && nextDueDate !== requestedDueDate
  );
  const nextPurpose = String(form.purpose || '').trim();
  const nextAdminMemo = String(form.adminMemo || '').trim();

  if (
    !nextTeam ||
    !nextBorrower ||
    !nextStartDate ||
    !requestedDueDate
  ) {
    throw createMutationError('required-rental-edit-fields-missing');
  }

  if (requestedDueDate < nextStartDate) {
    throw createMutationError('invalid-rental-edit-period');
  }

  const requestLogDocRef = doc(
    RENTAL_REQUEST_LOGS_COLLECTION_REF
  );

  let committedRequest = null;
  let committedAsset = null;
  let committedAvailabilityRequest = null;
  let shouldKeepAvailability = false;

  await runTransaction(db, async (transaction) => {
    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      requestId
    );
    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      requestId
    );
    const requestSnapshot = await transaction.get(
      requestDocRef
    );

    if (!requestSnapshot.exists()) {
      throw createMutationError('rental-request-not-found');
    }

    const latestRequest = {
      ...requestSnapshot.data(),
      id: requestSnapshot.id,
    };

    shouldKeepAvailability =
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(
        latestRequest.status
      );

    const nextRequest = {
      ...latestRequest,
      team: nextTeam,
      borrower: nextBorrower,
      startDate: nextStartDate,
      dueDate: nextDueDate,
      purpose: nextPurpose,
      adminMemo: nextAdminMemo,
    };

    if (shouldKeepAvailability) {
      const assetDocRef = doc(
        RENTAL_ASSETS_COLLECTION_REF,
        latestRequest.laptopId
      );
      const assetSnapshot = await transaction.get(
        assetDocRef
      );

      if (!assetSnapshot.exists()) {
        throw createMutationError('rental-asset-not-found');
      }

      const latestAsset = {
        ...assetSnapshot.data(),
        id: assetSnapshot.id,
      };
      const latestReservations = normalizeAssetReservations(
        latestAsset.reservations || []
      ).filter((request) => request.id !== requestId);
      const nextAvailability = getLaptopRentalAvailability(
        latestAsset,
        latestReservations,
        settings,
        nextStartDate,
        nextDueDate
      );

      if (nextAvailability.blocked) {
        throw createMutationError('rental-period-conflict', {
          blockingRequest:
            nextAvailability.blockingRequest || null,
        });
      }

      const availabilityRequest =
        toRentalAvailabilityRequest(nextRequest);
      const updatedReservations = [
        ...latestReservations,
        availabilityRequest,
      ];
      const representativeRequest =
        getLaptopRepresentativeRequest(
          updatedReservations,
          latestAsset.id
        );
      const nextAsset = {
        ...latestAsset,
        reservations: updatedReservations,
        status:
          latestAsset.status === STATUS.UNAVAILABLE
            ? STATUS.UNAVAILABLE
            : representativeRequest
              ? representativeRequest.status
              : STATUS.AVAILABLE,
        currentRequestId: representativeRequest?.id || null,
      };

      transaction.set(availabilityDocRef, {
        ...availabilityRequest,
        updatedAt: serverTimestamp(),
      });
      transaction.update(assetDocRef, {
        reservations: nextAsset.reservations,
        status: nextAsset.status,
        currentRequestId: nextAsset.currentRequestId,
        updatedAt: serverTimestamp(),
      });

      committedAsset = nextAsset;
      committedAvailabilityRequest = availabilityRequest;
    }

    const detailParts = [];

    if (latestRequest.team !== nextTeam) {
      detailParts.push(
        `부서: ${latestRequest.team || '-'} → ${nextTeam}`
      );
    }

    if (latestRequest.borrower !== nextBorrower) {
      detailParts.push(
        `대여자: ${latestRequest.borrower || '-'} → ${nextBorrower}`
      );
    }

    if (latestRequest.startDate !== nextStartDate) {
      detailParts.push(
        `대여 시작일: ${latestRequest.startDate || '-'} → ${nextStartDate}`
      );
    }

    if (latestRequest.dueDate !== nextDueDate) {
      detailParts.push(
        `반납 예정일: ${latestRequest.dueDate || '-'} → ${nextDueDate}`
      );
    }

    if (String(latestRequest.purpose || '') !== nextPurpose) {
      detailParts.push('대여 목적 변경');
    }

    if (
      String(latestRequest.adminMemo || '') !==
      nextAdminMemo
    ) {
      detailParts.push('관리자 메모 변경');
    }

    transaction.update(requestDocRef, {
      team: nextTeam,
      borrower: nextBorrower,
      startDate: nextStartDate,
      dueDate: nextDueDate,
      purpose: nextPurpose,
      adminMemo: nextAdminMemo,
      updatedAt: serverTimestamp(),
      syncedAt: serverTimestamp(),
    });

    transaction.set(requestLogDocRef, {
      id: requestLogDocRef.id,
      requestId,
      action: RENTAL_REQUEST_AUDIT_ACTION.REQUEST_EDITED,
      previousStatus: latestRequest.status || '',
      nextStatus: latestRequest.status || '',
      previousMemo: latestRequest.adminMemo || '',
      nextMemo: nextAdminMemo,
      actorUid: normalizedAuditActor.uid,
      actorAdminId: normalizedAuditActor.adminId,
      actorName: normalizedAuditActor.name,
      detail:
        detailParts.length > 0
          ? detailParts.join(' / ')
          : '신청 정보를 다시 저장했습니다.',
      createdAt: serverTimestamp(),
    });

    committedRequest = nextRequest;
  });

  if (!committedRequest) {
    throw createMutationError(
      'rental-request-edit-result-missing'
    );
  }

  return {
    adminDueDateAdjusted,
    committedAsset,
    committedAvailabilityRequest,
    committedRequest,
    nextDueDate,
    shouldKeepAvailability,
  };
};

export const executeAdminRequestStatusRestoreMutation = async ({
  auditActor,
  currentRequest,
  nextStatus = '',
  requestId = '',
  restoreReason = '',
  settings = {},
} = {}) => {
  if (!currentRequest || !requestId) {
    throw createMutationError('rental-request-not-found');
  }

  const normalizedRestoreReason = String(
    restoreReason || ''
  ).trim();

  if (!normalizedRestoreReason) {
    throw createMutationError('restore-reason-missing');
  }

  if (
    !(
      RENTAL_REQUEST_STATUS_TRANSITIONS[
        currentRequest.status
      ] || []
    ).includes(nextStatus)
  ) {
    throw createMutationError(
      'invalid-rental-status-transition',
      {
        previousStatus: currentRequest.status || '',
        nextStatus,
      }
    );
  }

  const normalizedAuditActor = requireAuditActor(auditActor);
  const requestLogDocRef = doc(
    RENTAL_REQUEST_LOGS_COLLECTION_REF
  );

  let committedRequest = null;
  let committedAsset = null;
  let committedAvailabilityRequest = null;
  let shouldKeepAvailability = false;

  await runTransaction(db, async (transaction) => {
    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      requestId
    );
    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      requestId
    );
    const requestSnapshot = await transaction.get(
      requestDocRef
    );

    if (!requestSnapshot.exists()) {
      throw createMutationError('rental-request-not-found');
    }

    const latestRequest = {
      ...requestSnapshot.data(),
      id: requestSnapshot.id,
    };

    if (
      !(
        RENTAL_REQUEST_STATUS_TRANSITIONS[
          latestRequest.status
        ] || []
      ).includes(nextStatus)
    ) {
      throw createMutationError(
        'invalid-rental-status-transition',
        {
          previousStatus: latestRequest.status || '',
          nextStatus,
        }
      );
    }

    if (
      !latestRequest.startDate ||
      !latestRequest.dueDate ||
      latestRequest.dueDate < latestRequest.startDate
    ) {
      throw createMutationError('invalid-rental-period');
    }

    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      latestRequest.laptopId
    );
    const assetSnapshot = await transaction.get(assetDocRef);

    if (!assetSnapshot.exists()) {
      throw createMutationError('rental-asset-not-found');
    }

    const latestAsset = {
      ...assetSnapshot.data(),
      id: assetSnapshot.id,
    };
    const latestReservations = normalizeAssetReservations(
      latestAsset.reservations || []
    ).filter((request) => request.id !== requestId);
    const nextRequest = {
      ...latestRequest,
      status: nextStatus,
      userActionRequest: null,
    };
    const availabilityRequest =
      toRentalAvailabilityRequest(nextRequest);

    shouldKeepAvailability =
      RENTAL_BLOCKING_REQUEST_STATUSES.includes(nextStatus);

    if (shouldKeepAvailability) {
      const nextAvailability = getLaptopRentalAvailability(
        latestAsset,
        latestReservations,
        settings,
        latestRequest.startDate,
        latestRequest.dueDate
      );

      if (nextAvailability.blocked) {
        throw createMutationError('rental-period-conflict', {
          blockingRequest:
            nextAvailability.blockingRequest || null,
        });
      }
    }

    const updatedReservations = shouldKeepAvailability
      ? [...latestReservations, availabilityRequest]
      : latestReservations;
    const representativeRequest =
      getLaptopRepresentativeRequest(
        updatedReservations,
        latestAsset.id
      );
    const nextAsset = {
      ...latestAsset,
      reservations: updatedReservations,
      status:
        latestAsset.status === STATUS.UNAVAILABLE
          ? STATUS.UNAVAILABLE
          : representativeRequest
            ? representativeRequest.status
            : STATUS.AVAILABLE,
      currentRequestId: representativeRequest?.id || null,
    };

    transaction.update(requestDocRef, {
      status: nextStatus,
      userActionRequest: null,
      updatedAt: serverTimestamp(),
      syncedAt: serverTimestamp(),
    });

    if (shouldKeepAvailability) {
      transaction.set(availabilityDocRef, {
        ...availabilityRequest,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.delete(availabilityDocRef);
    }

    transaction.update(assetDocRef, {
      reservations: nextAsset.reservations,
      status: nextAsset.status,
      currentRequestId: nextAsset.currentRequestId,
      updatedAt: serverTimestamp(),
    });

    transaction.set(requestLogDocRef, {
      id: requestLogDocRef.id,
      requestId,
      action: RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
      previousStatus: latestRequest.status || '',
      nextStatus,
      previousMemo: latestRequest.adminMemo || '',
      nextMemo: latestRequest.adminMemo || '',
      actorUid: normalizedAuditActor.uid,
      actorAdminId: normalizedAuditActor.adminId,
      actorName: normalizedAuditActor.name,
      detail: `상태 복구 사유: ${normalizedRestoreReason}`,
      createdAt: serverTimestamp(),
    });

    committedRequest = nextRequest;
    committedAsset = nextAsset;
    committedAvailabilityRequest = shouldKeepAvailability
      ? availabilityRequest
      : null;
  });

  if (!committedRequest || !committedAsset) {
    throw createMutationError(
      'rental-status-restore-result-missing'
    );
  }

  return {
    committedAsset,
    committedAvailabilityRequest,
    committedRequest,
    shouldKeepAvailability,
  };
};
