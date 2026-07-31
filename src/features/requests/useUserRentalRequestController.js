import { useRef, useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import {
  RENTAL_ASSETS_COLLECTION_REF,
  RENTAL_AVAILABILITY_COLLECTION_REF,
  RENTAL_REQUESTS_COLLECTION_REF,
  db,
} from '../../firebase.js';
import { STATUS } from '../../constants/appConstants.js';
import { USER_PROFILE_STATUS } from '../../constants/memberConstants.js';
import {
  createDefaultRequestForm,
  getAdjustedRentalDueDate,
  getAdjustedRentalStartDate,
  getLaptopRentalAvailability,
  getMaxRentalDueDate,
  getNonBusinessDayReason,
  getSafeMaxRentalDays,
  isRentalDueBusinessDay,
} from '../../domain/rentalPolicy.js';
import {
  normalizeAssetReservations,
  toRentalAvailabilityRequest,
} from '../../services/publicAssetCatalog.js';
import {
  formatDateWithKoreanWeekday,
  today,
} from '../../utils/appUtils.js';
import { getServiceBlockReason } from '../../utils/systemSettings.js';
import {
  getFirestoreResourceExhaustedMessage,
  isFirestoreCapacityCoolingDown,
  isFirestoreResourceExhaustedError,
  markFirestoreCapacityExhausted,
} from '../../utils/firestoreCapacity.js';

export const useUserRentalRequestState = (dataSettings) => {
  const [requestSubmitLoading, setRequestSubmitLoading] = useState(false);
  const requestSubmitInProgressRef = useRef(false);
  const [selectedLaptopId, setSelectedLaptopId] = useState(null);
  const [form, setForm] = useState(() => createDefaultRequestForm(dataSettings));

  return {
    form,
    requestSubmitInProgressRef,
    requestSubmitLoading,
    selectedLaptopId,
    setForm,
    setRequestSubmitLoading,
    setSelectedLaptopId,
  };
};

export default function useUserRentalRequestController({
  currentAuthAdminAccount,
  currentAuthRoleErrorMessage,
  currentAuthRoleReady,
  dataRequests,
  dataSettings,
  firebaseAuthReady,
  firebaseAuthUser,
  form,
  goToUserLogin,
  goToUserMypage,
  isAdminAuthenticated,
  isSplitStorageReady,
  loadFreshRentalRestrictionStatus,
  requestSubmitInProgressRef,
  requestSubmitLoading,
  selectedLaptop,
  setData,
  setForm,
  setRentalRequests,
  setRequestSubmitLoading,
  setSelectedLaptopId,
  siteSettings,
  triggerToast,
  userProfile,
  userProfileReady,
}) {
  const submitRequest = async () => {
    if (
      requestSubmitInProgressRef.current ||
      requestSubmitLoading
    ) {
      return;
    }

    const rentalBlockReason = getServiceBlockReason(siteSettings, 'rental');
    if (rentalBlockReason) {
      triggerToast(rentalBlockReason, 'error');
      return;
    }

    if (!isSplitStorageReady) {
      triggerToast(
        'Firestore 분리 저장소 최종 전환이 완료되지 않아 대여신청을 제출할 수 없습니다. 관리자에게 문의해 주세요.',
        'error'
      );
      return;
    }

    if (!firebaseAuthReady || !currentAuthRoleReady || !userProfileReady) {
      triggerToast(
        '로그인 계정과 회원 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.',
        'error'
      );
      return;
    }

    if (!firebaseAuthUser) {
      triggerToast('기기 대여신청은 일반회원 로그인 후 이용할 수 있습니다.', 'error');
      goToUserLogin();
      return;
    }

    if (currentAuthRoleErrorMessage) {
      triggerToast(currentAuthRoleErrorMessage, 'error');
      return;
    }

    if (currentAuthAdminAccount || isAdminAuthenticated) {
      triggerToast(
        '관리자 계정은 일반 사용자 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    if (!userProfile) {
      triggerToast(
        '회원 정보가 등록되어 있지 않습니다. 마이페이지에서 이름과 부서 정보를 저장해 주세요.',
        'error'
      );
      goToUserMypage();
      return;
    }

    const currentUserStatus = userProfile.status || '';

    if (currentUserStatus === USER_PROFILE_STATUS.BLOCKED) {
      triggerToast(
        '이용이 중지된 회원 계정은 기기 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    if (currentUserStatus !== USER_PROFILE_STATUS.ACTIVE) {
      triggerToast(
        '현재 회원 상태에서는 기기 대여신청을 제출할 수 없습니다.',
        'error'
      );
      return;
    }

    const requesterEmail = String(firebaseAuthUser.email || '');
    const requesterName = String(userProfile.name || '');
    const requesterTeam = String(userProfile.team || '');

    if (
      !requesterEmail.trim() ||
      !requesterName.trim() ||
      !requesterTeam.trim()
    ) {
      triggerToast(
        '회원 이메일, 이름 또는 부서 정보가 완성되지 않았습니다. 마이페이지에서 회원 정보를 확인해 주세요.',
        'error'
      );
      goToUserMypage();
      return;
    }

    if (isFirestoreCapacityCoolingDown()) {
      triggerToast(
        getFirestoreResourceExhaustedMessage({
          operation: '대여 신청 저장',
        }),
        'error'
      );
      return;
    }

    try {
      const latestRestrictionStatus =
        await loadFreshRentalRestrictionStatus(firebaseAuthUser.uid);

      if (latestRestrictionStatus.blocked) {
        triggerToast(
          latestRestrictionStatus.message ||
            '현재 대여 제한 상태이므로 신규 대여를 신청할 수 없습니다.',
          'error'
        );
        return;
      }
    } catch (error) {
      console.error('Rental restriction preflight error:', error);

      if (isFirestoreResourceExhaustedError(error)) {
        markFirestoreCapacityExhausted(error);
        triggerToast(
          getFirestoreResourceExhaustedMessage({
            operation: '대여 신청 전 제한 상태 확인',
          }),
          'error'
        );
        return;
      }

      triggerToast(
        '최신 연체 및 대여 제한 상태를 확인하지 못해 신청을 중단했습니다. 잠시 후 다시 시도해 주세요.',
        'error'
      );
      return;
    }

    if (!selectedLaptop) {
      triggerToast('신청할 기기를 선택해 주세요.', 'error');
      return;
    }

    const selectedLaptopAvailability = getLaptopRentalAvailability(
      selectedLaptop,
      dataRequests,
      dataSettings,
      form.startDate,
      form.dueDate
    );

    if (selectedLaptopAvailability.blocked) {
      const blockingRequest = selectedLaptopAvailability.blockingRequest;

      if (selectedLaptopAvailability.reason === 'periodOverlap' && blockingRequest) {
        triggerToast(
          `${selectedLaptop.assetNo}은(는) ${formatDateWithKoreanWeekday(blockingRequest.startDate)} ~ ${formatDateWithKoreanWeekday(blockingRequest.dueDate)} 기간에 이미 ${blockingRequest.status} 상태의 신청이 있어 선택한 기간에는 신청할 수 없습니다.`,
          'error'
        );
        return;
      }

      if (selectedLaptopAvailability.reason === 'assetUnavailable') {
        triggerToast('대여불가로 설정된 기기입니다.', 'error');
        return;
      }

      triggerToast('이미 예약 중이거나 이용 불가한 기기입니다.', 'error');
      return;
    }

    if (!form.startDate || !form.dueDate) {
      triggerToast('대여 시작일과 반납 예정일을 모두 작성해 주세요.', 'error');
      return;
    }

    const minStartDate = today();

    if (form.startDate < minStartDate) {
      const nextStartDate = getAdjustedRentalStartDate(minStartDate, dataSettings);

      triggerToast(
        `대여 시작일은 오늘보다 이전일 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(nextStartDate)}입니다.`,
        'error'
      );
      return;
    }

    const adjustedStartDate = getAdjustedRentalStartDate(
      form.startDate,
      dataSettings
    );

    if (adjustedStartDate !== form.startDate) {
      const reason = getNonBusinessDayReason(form.startDate, dataSettings);

      triggerToast(
        `대여 시작일은 ${reason ? `${reason}이라` : '영업일이 아니라'} 선택할 수 없습니다. 선택 가능한 가장 빠른 대여 시작일은 ${formatDateWithKoreanWeekday(adjustedStartDate)}입니다.`,
        'error'
      );
      return;
    }

    if (form.dueDate < form.startDate) {
      triggerToast(
        `반납 예정일은 대여 시작일보다 빠를 수 없습니다. 최소 반납 예정일은 ${formatDateWithKoreanWeekday(form.startDate)}입니다.`,
        'error'
      );
      return;
    }

    if (!isRentalDueBusinessDay(form.dueDate, dataSettings)) {
      const adjustedDueDate = getAdjustedRentalDueDate(
        form.dueDate,
        dataSettings
      );

      triggerToast(
        `선택한 반납 예정일이 휴무일이므로 다음 영업일인 ${formatDateWithKoreanWeekday(adjustedDueDate)}로 자동 조정한 뒤 다시 신청해 주세요.`,
        'error'
      );
      setForm((previousForm) => ({
        ...previousForm,
        dueDate: adjustedDueDate,
      }));
      return;
    }

    const maxAllowedDate = getMaxRentalDueDate(form.startDate, dataSettings);
    const maxRentalDays = getSafeMaxRentalDays(dataSettings);

    if (form.dueDate > maxAllowedDate) {
      triggerToast(
        `대여 가능 기간은 대여 시작일 다음 날부터 최대 ${maxRentalDays}일이며 달력 기준으로 계산됩니다. 반납 예정일은 ${formatDateWithKoreanWeekday(maxAllowedDate)}까지 선택할 수 있습니다.`,
        'error'
      );
      return;
    }

    const requestId = `REQ-${doc(RENTAL_REQUESTS_COLLECTION_REF).id}`;
    const requestDocRef = doc(db, 'rentalRequests', requestId);
    const availabilityDocRef = doc(
      RENTAL_AVAILABILITY_COLLECTION_REF,
      requestId
    );
    const assetDocRef = doc(
      RENTAL_ASSETS_COLLECTION_REF,
      selectedLaptop.id
    );
    const requestedAt = new Date().toLocaleString('ko-KR');

    const nextRequest = {
      id: requestId,
      requesterUid: firebaseAuthUser.uid,
      requesterEmail,
      requesterName,
      requesterTeam,
      laptopId: selectedLaptop.id,
      assetCategory: selectedLaptop.category || '노트북',
      assetNo: selectedLaptop.assetNo,
      team: requesterTeam,
      borrower: requesterName,
      startDate: form.startDate,
      dueDate: form.dueDate,
      purpose: form.purpose,
      status: STATUS.REQUESTED,
      adminMemo: '',
      extensionCount: 0,
      lastExtensionApprovedDate: '',
      nextExtensionRequestDate: '',
      extensionHistory: [],
      requestedAt,
    };

    let committedRequest = null;
    let committedAsset = null;
    let committedAvailabilityRequest = null;

    requestSubmitInProgressRef.current = true;
    setRequestSubmitLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        const assetSnapshot = await transaction.get(assetDocRef);

        if (!assetSnapshot.exists()) {
          throw new Error('selected-laptop-not-found');
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
        const latestAvailability = getLaptopRentalAvailability(
          latestAsset,
          latestReservations,
          dataSettings,
          form.startDate,
          form.dueDate
        );

        if (latestAvailability.blocked) {
          const conflictError = new Error('rental-conflict');
          conflictError.availability = latestAvailability;
          throw conflictError;
        }

        const nextCommittedRequest = {
          ...nextRequest,
          laptopId: latestAsset.id,
          assetCategory: latestAsset.category || '노트북',
          assetNo: latestAsset.assetNo,
        };
        const availabilityRequest = toRentalAvailabilityRequest(
          nextCommittedRequest
        );
        const nextReservations = [
          ...storedReservations,
          availabilityRequest,
        ];

        transaction.set(requestDocRef, {
          ...nextCommittedRequest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        transaction.set(availabilityDocRef, {
          ...availabilityRequest,
          updatedAt: serverTimestamp(),
        });
        transaction.update(assetDocRef, {
          reservations: nextReservations,
          updatedAt: serverTimestamp(),
        });

        committedRequest = nextCommittedRequest;
        committedAvailabilityRequest = availabilityRequest;
        committedAsset = {
          ...latestAsset,
          reservations: nextReservations,
        };
      });

      if (
        !committedRequest ||
        !committedAsset ||
        !committedAvailabilityRequest
      ) {
        throw new Error('rental-transaction-result-missing');
      }

      setRentalRequests((previousRequests) => [
        committedRequest,
        ...(previousRequests || []).filter(
          (request) => request.id !== requestId
        ),
      ]);
      setData((previousData) => ({
        ...previousData,
        requests: [
          committedAvailabilityRequest,
          ...(previousData.requests || []).filter(
            (request) => request.id !== requestId
          ),
        ],
        laptops: (previousData.laptops || []).map((asset) =>
          asset.id === committedAsset.id ? committedAsset : asset
        ),
      }));

      setSelectedLaptopId(null);
      setForm(createDefaultRequestForm(dataSettings));

      triggerToast(
        '대여 신청이 성공적으로 접수되었습니다. 관리자 승인을 대기합니다.',
        'success'
      );
    } catch (error) {
      console.error('Rental request create error:', error);

      if (error?.message === 'rental-conflict') {
        const blockingRequest = error.availability?.blockingRequest;

        triggerToast(
          blockingRequest
            ? `${selectedLaptop.assetNo}은(는) ${formatDateWithKoreanWeekday(blockingRequest.startDate)} ~ ${formatDateWithKoreanWeekday(blockingRequest.dueDate)} 기간에 이미 ${blockingRequest.status} 상태의 신청이 있어 신청할 수 없습니다.`
            : '다른 사용자의 신청이 먼저 접수되어 현재 선택한 기기를 신청할 수 없습니다.',
          'error'
        );
      } else if (error?.message === 'selected-laptop-not-found') {
        triggerToast(
          '선택한 기기 정보를 찾을 수 없습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.',
          'error'
        );
      } else if (isFirestoreResourceExhaustedError(error)) {
        markFirestoreCapacityExhausted(error);
        triggerToast(
          getFirestoreResourceExhaustedMessage({
            operation: '대여 신청 저장',
          }),
          'error'
        );
      } else {
        const firebaseErrorCode = error?.code || 'unknown-error';
        const firebaseErrorMessage = error?.message || '오류 메시지 없음';

        console.error('Rental request create error details:', {
          code: firebaseErrorCode,
          message: firebaseErrorMessage,
          requesterUid: firebaseAuthUser?.uid || '',
          requestId,
          assetId: selectedLaptop?.id || '',
          assetNo: selectedLaptop?.assetNo || '',
        });

        triggerToast(
          `대여 신청 저장에 실패했습니다. 오류 코드: ${firebaseErrorCode}`,
          'error'
        );
      }
    } finally {
      requestSubmitInProgressRef.current = false;
      setRequestSubmitLoading(false);
    }
  };

  return {
    submitRequest,
  };
}
