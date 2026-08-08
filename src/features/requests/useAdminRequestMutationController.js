import {
  doc,
  getDocs,
  limit as firestoreLimit,
  query as firestoreQuery,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import {
  RENTAL_REQUEST_LOGS_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  RENTAL_RESTRICTIONS_COLLECTION_REF,
  db,
  firebaseAuth,
} from '../../firebase.js';
import {
  RENTAL_REQUEST_AUDIT_ACTION,
  STATUS,
} from '../../constants/appConstants.js';
import {
  formatDateWithKoreanWeekday,
  getDisplayRentalStatus,
  today,
} from '../../utils/appUtils.js';
import { syncRentalRestrictionWriteThroughBestEffort } from './rentalRestrictionReadCutover.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import {
  publishAdminRentalRequestCutoverObservation,
  readAdminRentalRequestCutoverConfig,
} from './adminRentalRequestCutover.js';

let adminRequestMutationServicePromise = null;
const loadAdminRequestMutationService = () => {
  if (!adminRequestMutationServicePromise) {
    adminRequestMutationServicePromise = import(
      './adminRequestMutationService.js'
    ).catch((error) => {
      adminRequestMutationServicePromise = null;
      throw error;
    });
  }

  return adminRequestMutationServicePromise;
};

export const hasOtherCurrentOverdueRequest = async ({
  requesterUid,
  excludedRequestId,
  referenceDate,
}) => {
  if (!requesterUid || !referenceDate) {
    return false;
  }

  const snapshot = await getDocs(
    firestoreQuery(
      RENTAL_REQUESTS_COLLECTION_REF,
      where('requesterUid', '==', requesterUid),
      where('status', '==', STATUS.APPROVED),
      where('dueDate', '<', referenceDate),
      firestoreLimit(2)
    )
  );

  return snapshot.docs.some(
    (requestDocument) => requestDocument.id !== excludedRequestId
  );
};

export default function useAdminRequestMutationController({
  clearAdminRequestPanelSelection,
  dataSettings,
  getAdminRequestById,
  getCurrentAdminAuditActor,
  isSplitStorageReady,
  notifyAdminRequestMutation,
  resetAdminRequestPanelPage,
  setData,
  triggerToast,
  updateAdminRequestPanelRequests,
}) {
  const commitAdminRequestEdit = async ({ requestId = '', form = {} } = {}) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 정보를 수정할 수 없습니다.',
        'error'
      );
      return false;
    }
  
    const currentRequest =
      getAdminRequestById(requestId);
  
    if (!currentRequest) {
      triggerToast(
        '수정할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return false;
    }
  
    const auditActor =
      getCurrentAdminAuditActor();
  
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 신청 정보 수정을 중단했습니다.',
        'error'
      );
      return false;
    }
  
    try {
      const adminCutoverConfig = readAdminRentalRequestCutoverConfig();
      let adminDueDateAdjusted = false;
      let committedAsset = null;
      let committedAvailabilityRequest = null;
      let committedRequest = null;
      let nextDueDate = String(form?.dueDate || '');
      let shouldKeepAvailability = false;

      if (adminCutoverConfig.writeRequested) {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const authError = new Error('admin-firebase-sign-in-required');
          authError.code = 'admin_firebase_sign_in_required';
          throw authError;
        }
        const firebaseIdToken = await firebaseUser.getIdToken();
        const payload = await clerkStagingClient.editAdminRentalRequest(
          firebaseIdToken,
          requestId,
          form
        );
        const mutation = payload?.adminRentalRequestMutation || {};
        committedRequest = mutation.request || null;
        committedAvailabilityRequest = mutation.availability || null;
        committedAsset = mutation.asset || null;
        shouldKeepAvailability = Boolean(committedAvailabilityRequest);
        adminDueDateAdjusted = Boolean(mutation.dueDateAdjusted);
        nextDueDate = committedRequest?.dueDate || nextDueDate;
        publishAdminRentalRequestCutoverObservation({
          readRequested: adminCutoverConfig.readRequested,
          writeRequested: true,
          writeSource: 'postgresql-authoritative',
          requestId,
          operation: 'edit',
          firestoreMirror: mutation.firestoreMirror || '-',
          error: '',
        });
      } else {
        const {
          executeAdminRequestEditMutation,
        } = await loadAdminRequestMutationService();
        ({
          adminDueDateAdjusted,
          committedAsset,
          committedAvailabilityRequest,
          committedRequest,
          nextDueDate,
          shouldKeepAvailability,
        } = await executeAdminRequestEditMutation({
          auditActor,
          currentRequest,
          form,
          requestId,
          settings: dataSettings,
        }));
      }
  
      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );
  
      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !== requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !== requestId
              ),
        laptops:
          committedAsset
            ? (prev.laptops || []).map(
                (asset) =>
                  asset.id === committedAsset.id
                    ? committedAsset
                    : asset
              )
            : prev.laptops,
      }));
  
      notifyAdminRequestMutation();
  
      triggerToast(
        adminDueDateAdjusted
          ? `반납 예정일이 휴무일이어서 ${formatDateWithKoreanWeekday(nextDueDate)}로 자동 조정된 후 신청 정보가 수정되었습니다.`
          : '대여 신청 정보를 수정했습니다. 관리자 수정에는 기본 최대 대여 기간 제한을 적용하지 않았습니다.',
        'success'
      );
  
      return true;
    } catch (error) {
      console.error(
        'Admin rental request edit error:',
        error
      );
  
      if (
        ['required-rental-edit-fields-missing', 'required_rental_edit_fields_missing'].includes(error?.message || error?.code)
      ) {
        triggerToast(
          '부서, 대여자명, 대여 시작일과 반납 예정일을 모두 입력해 주세요.',
          'error'
        );
        return false;
      }
  
      if (
        ['invalid-rental-edit-period', 'invalid_rental_edit_period'].includes(error?.message || error?.code)
      ) {
        triggerToast(
          '반납 예정일은 대여 시작일보다 빠를 수 없습니다.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'admin-audit-actor-missing'
      ) {
        triggerToast(
          '관리자 인증 정보를 확인할 수 없어 신청 정보 수정을 중단했습니다.',
          'error'
        );
        return false;
      }
  
      if (
        ['rental-period-conflict', 'rental_period_conflict'].includes(error?.message || error?.code)
      ) {
        const blockingRequest =
          error.blockingRequest;
  
        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 신청 정보를 수정할 수 없습니다.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }
  
      triggerToast(
        `대여 신청 정보 수정에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }
  
    return false;
  };
  
  const commitAdminRequestStatusRestore = async ({
    nextStatus = '',
    requestId = '',
    restoreReason = '',
  } = {}) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 상태를 복구할 수 없습니다.',
        'error'
      );
      return false;
    }
  
    const currentRequest =
      getAdminRequestById(requestId);
  
    if (!currentRequest) {
      triggerToast(
        '복구할 정식 대여 신청 문서를 찾을 수 없습니다.',
        'error'
      );
      return false;
    }
  
    const auditActor =
      getCurrentAdminAuditActor();
  
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 복구를 중단했습니다.',
        'error'
      );
      return false;
    }
  
    try {
      const adminCutoverConfig = readAdminRentalRequestCutoverConfig();
      let committedAsset = null;
      let committedAvailabilityRequest = null;
      let committedRequest = null;
      let shouldKeepAvailability = false;

      if (adminCutoverConfig.writeRequested) {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const authError = new Error('admin-firebase-sign-in-required');
          authError.code = 'admin_firebase_sign_in_required';
          throw authError;
        }
        const firebaseIdToken = await firebaseUser.getIdToken();
        const payload = await clerkStagingClient.restoreAdminRentalRequestStatus(
          firebaseIdToken,
          requestId,
          nextStatus,
          restoreReason
        );
        const mutation = payload?.adminRentalRequestMutation || {};
        committedRequest = mutation.request || null;
        committedAvailabilityRequest = mutation.availability || null;
        committedAsset = mutation.asset || null;
        shouldKeepAvailability = Boolean(committedAvailabilityRequest);
        publishAdminRentalRequestCutoverObservation({
          readRequested: adminCutoverConfig.readRequested,
          writeRequested: true,
          writeSource: 'postgresql-authoritative',
          requestId,
          nextStatus,
          operation: 'restore',
          firestoreMirror: mutation.firestoreMirror || '-',
          error: '',
        });
      } else {
        const {
          executeAdminRequestStatusRestoreMutation,
        } = await loadAdminRequestMutationService();
        ({
          committedAsset,
          committedAvailabilityRequest,
          committedRequest,
          shouldKeepAvailability,
        } = await executeAdminRequestStatusRestoreMutation({
          auditActor,
          currentRequest,
          nextStatus,
          requestId,
          restoreReason,
          settings: dataSettings,
        }));
      }
  
      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map(
          (request) =>
            request.id === requestId
              ? committedRequest
              : request
        )
      );
  
      setData((prev) => ({
        ...prev,
        requests:
          shouldKeepAvailability
            ? [
                committedAvailabilityRequest,
                ...(prev.requests || []).filter(
                  (request) =>
                    request.id !== requestId
                ),
              ]
            : (prev.requests || []).filter(
                (request) =>
                  request.id !== requestId
              ),
        laptops:
          (prev.laptops || []).map(
            (asset) =>
              asset.id === committedAsset.id
                ? committedAsset
                : asset
          ),
      }));
  
      notifyAdminRequestMutation();
  
      triggerToast(
        `상태를 [${nextStatus}]로 복구했습니다.`,
        'success'
      );
  
      return true;
    } catch (error) {
      console.error(
        'Admin rental request restore error:',
        error
      );
  
      if (
        ['restore-reason-missing', 'restore_reason_missing'].includes(error?.message || error?.code)
      ) {
        triggerToast(
          '상태 복구 사유를 입력해 주세요.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'admin-audit-actor-missing'
      ) {
        triggerToast(
          '관리자 인증 정보를 확인할 수 없어 상태 복구를 중단했습니다.',
          'error'
        );
        return false;
      }
  
      if (
        ['rental-period-conflict', 'rental_period_conflict'].includes(error?.message || error?.code)
      ) {
        const blockingRequest =
          error.blockingRequest;
  
        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 복구할 수 없습니다.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'invalid-rental-period'
      ) {
        triggerToast(
          '대여 시작일과 반납 예정일을 먼저 올바르게 수정해 주세요.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'invalid-rental-status-transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 복구입니다. 현재 상태: ${error.previousStatus || '-'}, 복구 대상: ${error.nextStatus || '-'}`,
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }
  
      if (
        error?.message ===
        'rental-asset-not-found'
      ) {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없습니다.',
          'error'
        );
        return false;
      }
  
      triggerToast(
        `상태 복구에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }
  
    return false;
  };
  
  const updateRequest = async (id, status) => {
    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 신청 상태를 변경할 수 없습니다.',
        'error'
      );
      return;
    }
  
    const currentRequest = getAdminRequestById(id);
  
    if (!currentRequest) {
      triggerToast(
        '신청 정보를 찾을 수 없습니다.',
        'error'
      );
      return;
    }
  
    const auditActor = getCurrentAdminAuditActor();
  
    if (!auditActor.uid) {
      triggerToast(
        '관리자 인증 정보를 확인할 수 없어 상태 변경을 중단했습니다.',
        'error'
      );
      return;
    }
  
    const actualReturnDate =
      status === STATUS.RETURNED ? today() : '';
    const overdueBatchId =
      status === STATUS.RETURNED
        ? `OVERDUE-${doc(RENTAL_RESTRICTIONS_COLLECTION_REF).id}`
        : '';
    const nextDisplayStatus = getDisplayRentalStatus(
      status,
      currentRequest.startDate,
      currentRequest.dueDate
    );
  
    try {
      const adminCutoverConfig = readAdminRentalRequestCutoverConfig();
      let committedAsset;
      let committedAvailabilityRequest;
      let committedRequest;
      let shouldKeepAvailability;

      if (adminCutoverConfig.writeRequested) {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) {
          const authError = new Error('admin-firebase-sign-in-required');
          authError.code = 'admin_firebase_sign_in_required';
          throw authError;
        }
        const firebaseIdToken = await firebaseUser.getIdToken();
        const payload = await clerkStagingClient.changeAdminRentalRequestStatus(
          firebaseIdToken,
          id,
          status
        );
        const mutation = payload?.adminRentalRequestMutation || {};
        committedRequest = mutation.request;
        committedAvailabilityRequest = mutation.availability || null;
        committedAsset = mutation.asset;
        shouldKeepAvailability = Boolean(committedAvailabilityRequest);
        publishAdminRentalRequestCutoverObservation({
          readRequested: adminCutoverConfig.readRequested,
          writeRequested: true,
          writeSource: 'postgresql-authoritative',
          requestId: id,
          nextStatus: status,
          firestoreMirror: mutation.firestoreMirror || '-',
          error: '',
        });
      } else {
        const hasOtherCurrentOverdueRequests =
          status === STATUS.RETURNED
            ? await hasOtherCurrentOverdueRequest({
                requesterUid: currentRequest.requesterUid,
                excludedRequestId: currentRequest.id,
                referenceDate: actualReturnDate,
              })
            : false;
        const {
          executeAdminRequestStatusChangeMutation,
        } = await loadAdminRequestMutationService();
        ({
          committedAsset,
          committedAvailabilityRequest,
          committedRequest,
          shouldKeepAvailability,
        } = await executeAdminRequestStatusChangeMutation({
          actualReturnDate,
          auditActor,
          currentRequest,
          hasOtherCurrentOverdueRequests,
          nextStatus: status,
          overdueBatchId,
          requestId: id,
          settings: dataSettings,
        }));
      }

      if (!committedRequest || !committedAsset) {
        throw new Error('admin-rental-status-result-missing');
      }
  
      updateAdminRequestPanelRequests((prev) => {
        const requestExists = (prev || []).some(
          (request) => request.id === id
        );
  
        if (!requestExists) {
          return [committedRequest, ...(prev || [])];
        }
  
        return (prev || []).map((request) =>
          request.id === id ? committedRequest : request
        );
      });
  
      setData((prev) => ({
        ...prev,
        requests: shouldKeepAvailability
          ? [
              committedAvailabilityRequest,
              ...(prev.requests || []).filter(
                (request) => request.id !== id
              ),
            ]
          : (prev.requests || []).filter(
              (request) => request.id !== id
            ),
        laptops: (prev.laptops || []).map((asset) =>
          asset.id === committedAsset.id
            ? committedAsset
            : asset
        ),
      }));
  
      clearAdminRequestPanelSelection();
      resetAdminRequestPanelPage();
      notifyAdminRequestMutation();

      if (status === STATUS.RETURNED && currentRequest.requesterUid) {
        await syncRentalRestrictionWriteThroughBestEffort({
          firebaseUser: firebaseAuth.currentUser,
          firebaseUid: currentRequest.requesterUid,
          reason: 'admin-request-return-restriction',
        });
      }
  
      triggerToast(
        `상태가 [${nextDisplayStatus}]로 업데이트 되었습니다.`,
        'success'
      );
    } catch (error) {
      console.error(
        'Rental request status update error:',
        error
      );
  
      if (error?.message === 'rental-request-not-found' || error?.code === 'rental_request_not_found') {
        triggerToast(
          '정식 대여 신청 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }
  
      if (error?.message === 'rental-asset-not-found' || error?.code === 'rental_asset_not_found') {
        triggerToast(
          '신청과 연결된 자산 문서를 찾을 수 없어 상태 변경을 중단했습니다.',
          'error'
        );
        return;
      }
  
      if (
        error?.message === 'invalid-rental-status-transition' ||
        error?.code === 'invalid_rental_status_transition'
      ) {
        triggerToast(
          `허용되지 않은 상태 변경입니다. 현재 상태: ${
            error.previousStatus || '-'
          }, 변경 요청: ${error.nextStatus || '-'}`,
          'error'
        );
        return;
      }
  
      if (error?.message === 'rental-period-conflict' || error?.code === 'rental_period_conflict') {
        const blockingRequest = error.blockingRequest;
  
        triggerToast(
          blockingRequest
            ? `동일 기기의 다른 예약과 기간이 겹칩니다. 충돌 기간: ${blockingRequest.startDate || '-'} ~ ${blockingRequest.dueDate || '-'}`
            : '동일 기기의 다른 활성 예약과 충돌하여 상태를 변경할 수 없습니다.',
          'error'
        );
        return;
      }
  
      const firebaseErrorCode =
        error?.code || error?.message || 'unknown-error';

      const adminCutoverConfig = readAdminRentalRequestCutoverConfig();
      if (adminCutoverConfig.writeRequested) {
        publishAdminRentalRequestCutoverObservation({
          readRequested: adminCutoverConfig.readRequested,
          writeRequested: true,
          writeSource: 'postgresql-authoritative',
          requestId: id,
          nextStatus: status,
          firestoreMirror: '-',
          error: firebaseErrorCode,
        });
      }
  
      triggerToast(
        `신청 상태와 기기 상태 저장에 실패했습니다. 오류 코드: ${firebaseErrorCode}`,
        'error'
      );
    }
  };
  
  const updateRequestMemo = (id, memo) => {
    const currentRequest = getAdminRequestById(id);
  
    if (!currentRequest) return;
  
    const nextRequest = {
      ...currentRequest,
      adminMemo: memo,
    };
  
    updateAdminRequestPanelRequests((prev) => {
      const requestExists = (prev || []).some(
        (request) => request.id === id
      );
  
      if (!requestExists) {
        return [nextRequest, ...(prev || [])];
      }
  
      return (prev || []).map((request) =>
        request.id === id ? nextRequest : request
      );
    });
  };
  
  const saveRequestMemo = async (id, memo) => {
    const currentRequest = getAdminRequestById(id);
  
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
        '관리자 인증 정보를 확인할 수 없어 메모 저장을 중단했습니다.',
        'error'
      );
      return;
    }
  
    const adminCutoverConfig = readAdminRentalRequestCutoverConfig();
    if (adminCutoverConfig.writeRequested) {
      try {
        const firebaseUser = firebaseAuth.currentUser;
        if (!firebaseUser) throw new Error('admin-firebase-sign-in-required');
        const firebaseIdToken = await firebaseUser.getIdToken();
        const payload = await clerkStagingClient.saveAdminRentalRequestMemo(
          firebaseIdToken,
          id,
          memo
        );
        const mutation = payload?.adminRentalRequestMutation || {};
        if (mutation.changed === false) return;
        const committedRequest = mutation.request;
        if (!committedRequest?.id) throw new Error('admin-rental-memo-result-missing');
        updateAdminRequestPanelRequests((prev) =>
          (prev || []).map((request) =>
            request.id === id ? committedRequest : request
          )
        );
        notifyAdminRequestMutation();
        publishAdminRentalRequestCutoverObservation({
          readRequested: adminCutoverConfig.readRequested,
          writeRequested: true,
          writeSource: 'postgresql-authoritative',
          requestId: id,
          operation: 'memo',
          firestoreMirror: mutation.firestoreMirror || '-',
          error: '',
        });
        return;
      } catch (error) {
        console.error('PostgreSQL rental request memo save error:', error);
        triggerToast(
          `관리자 메모 저장에 실패했습니다. 오류 코드: ${error?.code || error?.message || 'unknown-error'}`,
          'error'
        );
        return;
      }
    }

    const requestDocRef = doc(
      RENTAL_REQUESTS_COLLECTION_REF,
      id
    );
  
    const requestLogDocRef = doc(
      RENTAL_REQUEST_LOGS_COLLECTION_REF
    );
  
    let memoWasChanged = false;
  
    try {
      await runTransaction(
        db,
        async (transaction) => {
          const requestSnapshot =
            await transaction.get(
              requestDocRef
            );
  
          if (!requestSnapshot.exists()) {
            throw new Error(
              'rental-request-not-found'
            );
          }
  
          const latestRequest =
            requestSnapshot.data();
  
          const previousMemo = String(
            latestRequest.adminMemo || ''
          );
  
          const nextMemo = String(
            memo || ''
          );
  
          if (
            previousMemo === nextMemo
          ) {
            return;
          }
  
          transaction.update(
            requestDocRef,
            {
              adminMemo: nextMemo,
              updatedAt:
                serverTimestamp(),
              syncedAt:
                serverTimestamp(),
            }
          );
  
          transaction.set(
            requestLogDocRef,
            {
              id: requestLogDocRef.id,
              requestId: id,
              action:
                RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED,
              previousStatus:
                latestRequest.status || '',
              nextStatus:
                latestRequest.status || '',
              previousMemo,
              nextMemo,
              actorUid:
                auditActor.uid,
              actorAdminId:
                auditActor.adminId,
              actorName:
                auditActor.name,
              createdAt:
                serverTimestamp(),
            }
          );
  
          memoWasChanged = true;
        }
      );
  
      if (!memoWasChanged) {
        return;
      }
  
      updateAdminRequestPanelRequests((prev) =>
        (prev || []).map((request) =>
          request.id === id
            ? {
                ...request,
                adminMemo: memo,
              }
            : request
        )
      );
    } catch (error) {
      console.error(
        'Rental request memo save error:',
        error
      );
  
      if (
        error?.message ===
        'rental-request-not-found'
      ) {
        triggerToast(
          '정식 대여 신청 문서가 없어 관리자 메모를 저장하지 않았습니다.',
          'error'
        );
        return;
      }
  
      triggerToast(
        `관리자 메모 저장에 실패했습니다. 오류 코드: ${
          error?.code ||
          error?.message ||
          'unknown-error'
        }`,
        'error'
      );
    }
  };

  return {
    commitAdminRequestEdit,
    commitAdminRequestStatusRestore,
    saveRequestMemo,
    updateRequest,
    updateRequestMemo,
  };
}
