import { useEffect, useMemo, useState } from 'react';

export default function UserRequestHistoryPanel({ ctx }) {
  const {
    ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
    ADMIN_REQUEST_TAB,
    Badge,
    Button,
    Card,
    CardContent,
    ClipboardList,
    RENTAL_EXTENSION_APPROVAL_MODE,
    STATUS,
    Search,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    currentUserRequests,
    currentUserRentalRestrictionStatus,
    data,
    firebaseAuthReady,
    firebaseAuthUser,
    formatDateWithKoreanWeekday,
    formatFirestoreTimestamp,
    getExtensionRequestAvailableDate,
    getRequestDisplayStatus,
    getRequestExtensionCount,
    getSafeRentalExtensionBusinessDays,
    getSafeRentalExtensionMaxCount,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    goToProtectedUserTab,
    isAdminAuthenticated,
    openUserActionDialog,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    userActionSaving,
    userProfile,
  } = ctx;

  const [requestTab, setRequestTab] = useState(ADMIN_REQUEST_TAB.PENDING);
  const [requestQuery, setRequestQuery] = useState('');
  const [requestPageSize, setRequestPageSize] = useState(10);
  const [requestPage, setRequestPage] = useState(1);
  const [selectedRequestId, setSelectedRequestId] = useState('');

  const tabCounts = useMemo(() => {
    const counts = {
      [ADMIN_REQUEST_TAB.PENDING]: 0,
      [ADMIN_REQUEST_TAB.RENTAL]: 0,
      [ADMIN_REQUEST_TAB.CLOSED]: 0,
      [ADMIN_REQUEST_TAB.RETURNED]: 0,
    };

    currentUserRequests.forEach((request) => {
      if ([STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status)) {
        counts[ADMIN_REQUEST_TAB.PENDING] += 1;
      } else if (request.status === STATUS.APPROVED) {
        counts[ADMIN_REQUEST_TAB.RENTAL] += 1;
      } else if (request.status === STATUS.DENIED) {
        counts[ADMIN_REQUEST_TAB.CLOSED] += 1;
      } else if (request.status === STATUS.RETURNED) {
        counts[ADMIN_REQUEST_TAB.RETURNED] += 1;
      }
    });

    return counts;
  }, [currentUserRequests]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = requestQuery.trim().toLowerCase();

    const tabFiltered = currentUserRequests.filter((request) => {
      if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
        return [STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status);
      }

      if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
        return request.status === STATUS.APPROVED;
      }

      if (requestTab === ADMIN_REQUEST_TAB.CLOSED) {
        return request.status === STATUS.DENIED;
      }

      return request.status === STATUS.RETURNED;
    });

    const queryFiltered = normalizedQuery
      ? tabFiltered.filter((request) =>
          [
            request.assetNo,
            request.assetCategory,
            request.startDate,
            request.dueDate,
            request.purpose,
            getRequestDisplayStatus(request),
          ]
            .map((value) => String(value || '').toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        )
      : tabFiltered;

    return [...queryFiltered].sort((first, second) => {
      if (requestTab === ADMIN_REQUEST_TAB.PENDING) {
        return String(first.requestedAt || '').localeCompare(
          String(second.requestedAt || '')
        );
      }

      if (requestTab === ADMIN_REQUEST_TAB.RENTAL) {
        return String(first.dueDate || '').localeCompare(
          String(second.dueDate || '')
        );
      }

      return String(second.updatedAt || second.requestedAt || '').localeCompare(
        String(first.updatedAt || first.requestedAt || '')
      );
    });
  }, [currentUserRequests, requestQuery, requestTab, getRequestDisplayStatus]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRequests.length / requestPageSize)
  );
  const safePage = Math.min(requestPage, totalPages);
  const paginatedRequests = filteredRequests.slice(
    (safePage - 1) * requestPageSize,
    safePage * requestPageSize
  );
  const selectedRequest = selectedRequestId
    ? currentUserRequests.find((request) => request.id === selectedRequestId) || null
    : null;

  useEffect(() => {
    if (selectedRequestId && !selectedRequest) {
      setSelectedRequestId('');
    }
  }, [selectedRequest, selectedRequestId]);

  useEffect(() => {
    if (requestPage > totalPages) {
      setRequestPage(totalPages);
    }
  }, [requestPage, totalPages]);


  const getRequestReferenceDate = (request) => {
    if (request.status === STATUS.RETURNED) {
      if (request.returnedAt) {
        return formatFirestoreTimestamp(request.returnedAt);
      }

      if (request.actualReturnDate) {
        return request.actualReturnDate;
      }
    }

    if (request.status !== STATUS.REQUESTED && request.updatedAt) {
      return formatFirestoreTimestamp(request.updatedAt);
    }

    return (
      request.requestedAt ||
      formatFirestoreTimestamp(request.createdAt || request.updatedAt) ||
      '-'
    );
  };

  const getRequestRemark = (request) => {
    const extensionCount = getRequestExtensionCount(request);

    if (requestTab === ADMIN_REQUEST_TAB.RETURNED) {
      return extensionCount > 0 ? `연장 ${extensionCount}회` : '-';
    }

    const extensionAction = request.userActionRequest;
    const hasPendingExtension =
      extensionAction?.type === USER_REQUEST_ACTION.EXTEND &&
      extensionAction?.status === USER_REQUEST_REVIEW_STATUS.PENDING;

    if (hasPendingExtension) {
      return '연장 신청중';
    }

    const hasApprovedExtension =
      extensionAction?.type === USER_REQUEST_ACTION.EXTEND &&
      extensionAction?.status === USER_REQUEST_REVIEW_STATUS.APPROVED;

    return extensionCount > 0 || hasApprovedExtension ? '연장 승인' : '-';
  };

  const renderUserAction = (request) => {
    const action = request.userActionRequest;
    if (!action) return null;

    return (
      <div
        className={`rounded-xl border px-4 py-3 text-xs leading-5 ${
          action.status === USER_REQUEST_REVIEW_STATUS.PENDING
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : action.status === USER_REQUEST_REVIEW_STATUS.APPROVED
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}
      >
        <div className="font-bold">
          {getUserRequestActionLabel(action.type)} ·{' '}
          {getUserRequestReviewStatusLabel(action.status)}
        </div>

        {action.type === USER_REQUEST_ACTION.EXTEND && (
          <div className="mt-1 space-y-0.5">
            <div>
              연장 기간: {action.extensionStartDate || '-'} ~ {action.dueDate || '-'}
            </div>
            <div>
              연장 차수: {action.extensionNumber || '-'}회차 · 처리 방식:{' '}
              {action.approvalMode === RENTAL_EXTENSION_APPROVAL_MODE.AUTO
                ? '자동 승인'
                : '관리자 승인'}
            </div>
          </div>
        )}

        {action.type !== USER_REQUEST_ACTION.EXTEND && action.reason && (
          <div className="mt-1">요청 사유: {action.reason}</div>
        )}
      </div>
    );
  };

  const renderActionButtons = (request) => {
    const pendingExtension =
      request.userActionRequest?.status === USER_REQUEST_REVIEW_STATUS.PENDING &&
      request.userActionRequest?.type === USER_REQUEST_ACTION.EXTEND;

    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {[STATUS.REQUESTED, STATUS.ON_HOLD].includes(request.status) && (
          <Button
            type="button"
            variant="outline"
            disabled={userActionSaving}
            onClick={() =>
              openUserActionDialog(request, USER_REQUEST_ACTION.CHANGE)
            }
            className="px-3 py-2 text-xs"
          >
            신청정보 수정
          </Button>
        )}

        {request.status === STATUS.REQUESTED && (
          <Button
            type="button"
            variant="dangerOutline"
            disabled={userActionSaving}
            onClick={() =>
              openUserActionDialog(request, USER_REQUEST_ACTION.CANCEL)
            }
            className="px-3 py-2 text-xs"
          >
            신청 취소
          </Button>
        )}

        {request.status === STATUS.APPROVED &&
          !currentUserRentalRestrictionStatus?.blocked &&
          !pendingExtension && (
            <Button
              type="button"
              variant="outline"
              disabled={userActionSaving}
              onClick={() =>
                openUserActionDialog(request, USER_REQUEST_ACTION.EXTEND)
              }
              className="px-3 py-2 text-xs"
            >
              대여 연장 신청
            </Button>
          )}
      </div>
    );
  };

  const requestOwnerName = String(
    userProfile?.name ||
      firebaseAuthUser?.displayName ||
      ''
  ).trim();

  const requestHistoryDescription =
    requestOwnerName
      ? `${requestOwnerName} 님의 기기 대여 신청과 처리 상태를 확인할 수 있습니다.`
      : '회원님의 기기 대여 신청과 처리 상태를 확인할 수 있습니다.';

  return (
    <div className="w-full space-y-6">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />
          <div className="relative mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-black tracking-tight">
              나의 대여 신청내역
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
              {requestHistoryDescription}
            </p>
          </div>
        </div>

        <CardContent className="space-y-5 p-6">
          {!firebaseAuthReady || !currentAuthRoleReady || !rentalRequestsReady ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
              로그인 계정과 신청내역을 확인하는 중입니다.
            </div>
          ) : rentalRequestsLoadErrorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
              {rentalRequestsLoadErrorMessage}
            </div>
          ) : currentAuthAdminAccount || isAdminAuthenticated ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
              관리자 계정의 전체 대여신청은 관리자 모드의 대여 신청 관리에서 확인해 주세요.
            </div>
          ) : currentUserRequests.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                <ClipboardList size={28} className="mx-auto mb-3 text-slate-300" />
                <h3 className="text-sm font-bold text-slate-700">
                  등록된 신청내역이 없습니다
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  로그인한 계정으로 기기 대여신청을 제출하면 이 화면에서 처리 상태를 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    goToProtectedUserTab('rental')
                  }
                >
                  대여신청으로 이동
                </Button>
              </div>
            </div>
          ) : (
            <>
              {currentUserRentalRestrictionStatus?.blocked && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold leading-5 text-rose-800">
                  {currentUserRentalRestrictionStatus.message}
                  <div className="mt-1 font-medium">
                    제한 기간에는 현재 보유 중인 모든 기기의 대여 연장도 신청할 수 없습니다.
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {[
                  { id: ADMIN_REQUEST_TAB.PENDING, label: '신청·보류중' },
                  { id: ADMIN_REQUEST_TAB.RENTAL, label: '대여승인' },
                  { id: ADMIN_REQUEST_TAB.CLOSED, label: '대여불허' },
                  { id: ADMIN_REQUEST_TAB.RETURNED, label: '반납완료' },
                ].map((tab) => {
                  const active = requestTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setRequestTab(tab.id);
                        setRequestQuery('');
                        setRequestPage(1);
                        setSelectedRequestId('');
                      }}
                      className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                        active
                          ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {tab.label}{' '}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {tabCounts[tab.id] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!selectedRequest && (
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      신청 검색
                    </span>
                    <div className="relative">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={requestQuery}
                        onChange={(event) => {
                          setRequestQuery(event.target.value);
                          setRequestPage(1);
                        }}
                        placeholder="자산번호, 기기 분류, 기간, 상태, 목적"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      페이지당 표시
                    </span>
                    <select
                      value={requestPageSize}
                      onChange={(event) => {
                        setRequestPageSize(Number(event.target.value));
                        setRequestPage(1);
                      }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                    >
                      {ADMIN_REQUEST_PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}개
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {selectedRequest ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 px-4 py-2 text-xs"
                      onClick={() => setSelectedRequestId('')}
                    >
                      목록으로
                    </Button>
                    {renderActionButtons(selectedRequest)}
                  </div>

                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            {selectedRequest.assetCategory || '기기'}
                          </span>
                          <span className="text-sm font-bold text-slate-950">
                            {selectedRequest.assetNo || '-'}
                          </span>
                          <Badge>{getRequestDisplayStatus(selectedRequest)}</Badge>
                        </div>

                        <div className="text-xs font-medium text-slate-600">
                          신청자:{' '}
                          <span className="text-slate-900">
                            {selectedRequest.requesterName || selectedRequest.borrower || '-'}
                          </span>{' '}
                          · 소속:{' '}
                          <span className="text-slate-900">
                            {selectedRequest.requesterTeam || selectedRequest.team || '-'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500">
                          대여 일정: {selectedRequest.startDate || '-'} ~{' '}
                          {selectedRequest.dueDate || '-'}
                        </div>

                        {selectedRequest.actualReturnDate && (
                          <div className="text-[11px] font-semibold text-slate-600">
                            실제 반납일: {selectedRequest.actualReturnDate}
                            {Number(selectedRequest.overdueDaysAtReturn || 0) > 0
                              ? ` · 연체 ${selectedRequest.overdueDaysAtReturn}일`
                              : ''}
                          </div>
                        )}

                        <div className="text-xs text-slate-600">
                          대여 목적:{' '}
                          <span className="font-medium text-slate-700">
                            {selectedRequest.purpose || '서술 목적 없음'}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400">
                          등록 접수 일시:{' '}
                          {selectedRequest.requestedAt ||
                            formatFirestoreTimestamp(selectedRequest.createdAt)}
                        </div>
                      </div>
                    </div>

                    {selectedRequest.adminMemo && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
                        관리자 안내: {selectedRequest.adminMemo}
                      </div>
                    )}

                    {selectedRequest.status === STATUS.APPROVED && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
                        <div className="font-semibold text-slate-800">
                          연장 사용 {getRequestExtensionCount(selectedRequest)} /{' '}
                          {getSafeRentalExtensionMaxCount(data.settings)}회 · 1회{' '}
                          {getSafeRentalExtensionBusinessDays(data.settings)}영업일
                        </div>
                        <div className="mt-0.5">
                          {currentUserRentalRestrictionStatus?.blocked
                            ? '연체자 대여 제한 적용 중에는 보유 중인 모든 기기의 대여 연장을 신청할 수 없습니다.'
                            : data.settings.rentalExtensionEnabled
                              ? `다음 연장 신청 가능일: ${formatDateWithKoreanWeekday(
                                  getExtensionRequestAvailableDate(
                                    selectedRequest,
                                    data.settings
                                  )
                                )}`
                              : '현재 대여 연장 신청이 허용되지 않습니다.'}
                        </div>
                      </div>
                    )}

                    {renderUserAction(selectedRequest)}
                  </div>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                  선택한 탭과 검색 조건에 해당하는 신청이 없습니다.
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                    <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
                      <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                        <tr>
                          <th className="w-14 border-b border-slate-200 px-2.5 py-2.5 text-center">
                            순번
                          </th>
                          <th className="w-48 border-b border-slate-200 px-2.5 py-2.5">
                            기기명
                          </th>
                          <th className="border-b border-slate-200 px-2.5 py-2.5">
                            대여기간
                          </th>
                          <th className="w-24 border-b border-slate-200 px-2.5 py-2.5 text-center">
                            상태
                          </th>
                          <th className="w-40 border-b border-slate-200 px-2.5 py-2.5">
                            접수·처리일
                          </th>
                          <th className="w-28 border-b border-slate-200 px-2.5 py-2.5 text-center">
                            비고
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRequests.map((request, index) => {
                          const sequence =
                            (safePage - 1) * requestPageSize + index + 1;
                          const remark = getRequestRemark(request);

                          return (
                            <tr
                              key={request.id}
                              className="cursor-pointer border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                              onClick={() => setSelectedRequestId(request.id)}
                            >
                              <td className="px-2.5 py-2.5 text-center text-[11px] font-semibold text-slate-400">
                                {sequence}
                              </td>
                              <td className="px-2.5 py-2.5">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                    {request.assetCategory || '기기'}
                                  </span>
                                  <button
                                    type="button"
                                    className="min-w-0 truncate text-left text-xs font-bold text-slate-900 hover:text-orange-600 hover:underline"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedRequestId(request.id);
                                    }}
                                  >
                                    {request.assetNo || '-'}
                                  </button>
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 text-xs leading-5 text-slate-600">
                                {request.startDate || '-'} ~ {request.dueDate || '-'}
                              </td>
                              <td className="px-2.5 py-2.5 text-center">
                                <Badge>{getRequestDisplayStatus(request)}</Badge>
                              </td>
                              <td className="px-2.5 py-2.5 text-[11px] leading-4 text-slate-500">
                                {getRequestReferenceDate(request)}
                              </td>
                              <td className="px-2.5 py-2.5 text-center text-[10px] text-slate-500">
                                {remark === '-' ? (
                                  '-'
                                ) : (
                                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600">
                                    {remark}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {paginatedRequests.map((request, index) => {
                      const sequence =
                        (safePage - 1) * requestPageSize + index + 1;
                      const remark = getRequestRemark(request);

                      return (
                        <button
                          key={request.id}
                          type="button"
                          className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30"
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                                {sequence}
                              </span>
                              <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {request.assetCategory || '기기'}
                              </span>
                              <span className="min-w-0 truncate text-sm font-bold text-slate-900">
                                {request.assetNo || '-'}
                              </span>
                            </div>
                            <Badge>{getRequestDisplayStatus(request)}</Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] text-slate-500 min-[420px]:grid-cols-2">
                            <div>
                              <div className="font-semibold text-slate-400">대여기간</div>
                              <div className="mt-0.5 text-xs text-slate-700">
                                {request.startDate || '-'} ~ {request.dueDate || '-'}
                              </div>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-400">접수·처리일</div>
                              <div className="mt-0.5 text-xs text-slate-700">
                                {getRequestReferenceDate(request)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]">
                            <span className="font-semibold text-slate-400">비고</span>
                            <span className="font-semibold text-slate-600">{remark}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-slate-500">
                      총 {filteredRequests.length}건 · {safePage}/{totalPages}페이지
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={safePage <= 1}
                        onClick={() => setRequestPage((page) => Math.max(1, page - 1))}
                      >
                        이전
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={safePage >= totalPages}
                        onClick={() =>
                          setRequestPage((page) => Math.min(totalPages, page + 1))
                        }
                      >
                        다음
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
