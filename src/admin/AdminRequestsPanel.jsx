export default function AdminRequestsPanel({ ctx }) {
  const {
    ADMIN_REQUEST_PAGE_SIZE_OPTIONS,
    ADMIN_REQUEST_TAB,
    Badge,
    Button,
    Edit3,
    RENTAL_EXTENSION_APPROVAL_MODE,
    RENTAL_REQUEST_AUDIT_ACTION,
    STATUS,
    Search,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    adminRequestPageSize,
    adminRequestQuery,
    adminRequestTab,
    adminRequestTabCounts,
    adminRequestTotalPages,
    adminUserActionSavingRequestId,
    filteredAdminRequests,
    formatFirestoreTimestamp,
    getAdminRequestRestoreTargets,
    getDisplayRentalStatus,
    getRequestDisplayStatus,
    getExtensionRequestAvailableDate,
    getRequestExtensionCount,
    getSafeRentalExtensionMaxCount,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    mergedRentalRequests,
    data,
    openAdminRequestEditDialog,
    openAdminRequestRestoreDialog,
    orphanedRentalAvailabilityRequests,
    paginatedAdminRequests,
    renderRequestActionButtons,
    rentalRequestIdSet,
    rentalRequestLogsByRequestId,
    rentalRequestLogsLoadErrorMessage,
    rentalRequestLogsReady,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    reviewUserActionRequest,
    safeAdminRequestPage,
    saveRequestMemo,
    selectedAdminRequest,
    setAdminRequestPage,
    setAdminRequestPageSize,
    setAdminRequestQuery,
    setAdminRequestTab,
    setSelectedAdminRequestId,
    today,
    updateRequestMemo,
  } = ctx;

  const getAdminRequestReferenceDate = (request, requestLogs) => {
    if (request.status === STATUS.RETURNED) {
      if (request.returnedAt) {
        return formatFirestoreTimestamp(request.returnedAt);
      }

      if (request.actualReturnDate) {
        return request.actualReturnDate;
      }
    }

    const latestStatusLog = requestLogs.find(
      (log) =>
        [
          RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED,
          RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED,
        ].includes(log.action) && log.nextStatus === request.status
    );

    if (latestStatusLog?.createdAt) {
      return formatFirestoreTimestamp(latestStatusLog.createdAt);
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

  const getAdminRequestRemark = (request) => {
    const extensionCount = getRequestExtensionCount(request);

    if (adminRequestTab === ADMIN_REQUEST_TAB.RETURNED) {
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

  return (
                    <div className="space-y-5">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">
                          기기 대여 신청 관리
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          신청·보류중, 대여승인, 대여불허, 반납완료 기록을 목록과 상세 화면으로 관리합니다.
                        </p>
                      </div>

                      {rentalRequestsLoadErrorMessage && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                          {rentalRequestsLoadErrorMessage}
                        </div>
                      )}

                      {orphanedRentalAvailabilityRequests.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">
                          정식 rentalRequests 문서 없이 예약 요약만 남은 항목이{' '}
                          {orphanedRentalAvailabilityRequests.length}건 있습니다.
                          해당 항목은 상태 변경, 정보 수정과 메모 저장을 차단합니다.
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            id: ADMIN_REQUEST_TAB.PENDING,
                            label: '신청·보류중',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.RENTAL,
                            label: '대여승인',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.CLOSED,
                            label: '대여불허',
                          },
                          {
                            id: ADMIN_REQUEST_TAB.RETURNED,
                            label: '반납완료',
                          },
                        ].map((tab) => {
                          const isActive =
                            adminRequestTab ===
                            tab.id;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setAdminRequestTab(
                                  tab.id
                                );
                                setAdminRequestQuery('');
                                setAdminRequestPage(1);
                                setSelectedAdminRequestId('');
                              }}
                              className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
                                isActive
                                  ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600'
                              }`}
                            >
                              {tab.label}{' '}
                              <span
                                className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${
                                  isActive
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {adminRequestTabCounts[
                                  tab.id
                                ] || 0}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {!selectedAdminRequest && (
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
                                value={adminRequestQuery}
                                onChange={(event) => {
                                  setAdminRequestQuery(
                                    event.target.value
                                  );
                                  setAdminRequestPage(1);
                                }}
                                placeholder="자산번호, 신청자, 대여자, 부서, 이메일, 목적"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none mk-form-border-focus"
                              />
                            </div>
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                              페이지당 표시
                            </span>
                            <select
                              value={adminRequestPageSize}
                              onChange={(event) => {
                                setAdminRequestPageSize(
                                  Number(
                                    event.target.value
                                  )
                                );
                                setAdminRequestPage(1);
                              }}
                              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                            >
                              {ADMIN_REQUEST_PAGE_SIZE_OPTIONS.map(
                                (option) => (
                                  <option
                                    key={option}
                                    value={option}
                                  >
                                    {option}개
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                        </div>
                      )}

                      {!rentalRequestsReady ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          전체 대여신청 정보를 불러오는 중입니다.
                        </div>
                      ) : rentalRequestsLoadErrorMessage ? null : mergedRentalRequests.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          현재 접수되거나 처리된 대여 신청 목록이 없습니다.
                        </div>
                      ) : selectedAdminRequest ? (
                        (() => {
                          const r =
                            selectedAdminRequest;

                          const isOverdue =
                            r.status ===
                              STATUS.APPROVED &&
                            r.dueDate &&
                            r.dueDate < today();

                          const hasRentalRequestDocument =
                            rentalRequestIdSet.has(
                              r.id
                            );

                          const requestAuditLogs =
                            rentalRequestLogsByRequestId.get(
                              r.id
                            ) || [];

                          const userActionRequest =
                            r.userActionRequest ||
                            null;

                          const hasPendingUserAction =
                            userActionRequest?.status ===
                            USER_REQUEST_REVIEW_STATUS.PENDING;

                          const isUserActionSaving =
                            adminUserActionSavingRequestId ===
                            r.id;

                          const restoreTargets =
                            getAdminRequestRestoreTargets(
                              r
                            );

                          return (
                            <div className="space-y-4">
                              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="shrink-0 px-4 py-2 text-xs"
                                  onClick={() =>
                                    setSelectedAdminRequestId(
                                      ''
                                    )
                                  }
                                >
                                  목록으로
                                </Button>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="px-3 py-2 text-xs"
                                    disabled={
                                      !hasRentalRequestDocument
                                    }
                                    onClick={() =>
                                      openAdminRequestEditDialog(
                                        r
                                      )
                                    }
                                  >
                                    <Edit3 size={14} />
                                    신청정보 수정
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="px-3 py-2 text-xs"
                                    disabled={
                                      !hasRentalRequestDocument ||
                                      restoreTargets.length ===
                                        0
                                    }
                                    onClick={() =>
                                      openAdminRequestRestoreDialog(
                                        r
                                      )
                                    }
                                  >
                                    상태 되돌리기
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                        {r.assetCategory}
                                      </span>

                                      <span className="text-sm font-bold text-slate-950">
                                        {r.assetNo}
                                      </span>

                                      <Badge>
                                        {getRequestDisplayStatus(r)}
                                      </Badge>

                                      {isOverdue && (
                                        <span className="inline-flex animate-pulse items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                                          반납 기한 지연중
                                        </span>
                                      )}
                                    </div>

                                    <div className="text-xs font-medium text-slate-600">
                                      신청자:{' '}
                                      <span className="text-slate-900">
                                        {r.requesterName ||
                                          r.requesterEmail ||
                                          '-'}
                                      </span>
                                      {' · '}
                                      소속:{' '}
                                      <span className="text-slate-900">
                                        {r.team || '-'}
                                      </span>
                                      {' · '}
                                      대여자명:{' '}
                                      <span className="text-slate-900">
                                        {r.borrower || '-'}
                                      </span>
                                    </div>

                                    <div className="text-[11px] text-slate-500">
                                      대여 일정: {r.startDate || '-'} ~{' '}
                                      {r.dueDate || '-'}
                                    </div>

                                    {r.status === STATUS.APPROVED && (
                                      <div className="text-[11px] text-slate-500">
                                        연장 사용: {getRequestExtensionCount(r)} /{' '}
                                        {getSafeRentalExtensionMaxCount(data.settings)}회
                                        {' · '}다음 신청 가능일:{' '}
                                        {getExtensionRequestAvailableDate(
                                          r,
                                          data.settings
                                        ) || '-'}
                                      </div>
                                    )}

                                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-600">
                                      목적:{' '}
                                      <span className="font-medium text-slate-700">
                                        {r.purpose ||
                                          '서술 목적 없음'}
                                      </span>
                                    </div>

                                    <div className="text-[10px] text-slate-400">
                                      등록 접수 일시:{' '}
                                      {r.requestedAt ||
                                        formatFirestoreTimestamp(
                                          r.createdAt
                                        )}
                                    </div>
                                  </div>

                                  {hasRentalRequestDocument ? (
                                    hasPendingUserAction ? (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                        사용자 요청 검토를 먼저 완료해 주세요.
                                      </div>
                                    ) : (
                                      renderRequestActionButtons(
                                        r
                                      )
                                    )
                                  ) : (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                      정식 신청 문서가 없어 상태 변경을 차단했습니다.
                                    </div>
                                  )}
                                </div>

                                {userActionRequest && (
                                  <div
                                    className={`rounded-xl border px-4 py-3 text-xs ${
                                      hasPendingUserAction
                                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                                        : userActionRequest.status ===
                                            USER_REQUEST_REVIEW_STATUS.APPROVED
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                          : 'border-rose-200 bg-rose-50 text-rose-800'
                                    }`}
                                  >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="min-w-0 space-y-1">
                                        <div className="font-bold">
                                          {getUserRequestActionLabel(
                                            userActionRequest.type
                                          )}{' '}
                                          ·{' '}
                                          {getUserRequestReviewStatusLabel(
                                            userActionRequest.status
                                          )}
                                        </div>

                                        {userActionRequest.type !==
                                          USER_REQUEST_ACTION.EXTEND && (
                                          <div className="leading-5">
                                            요청 사유:{' '}
                                            {userActionRequest.reason ||
                                              '-'}
                                          </div>
                                        )}

                                        {userActionRequest.type ===
                                          USER_REQUEST_ACTION.CHANGE && (
                                          <div className="leading-5">
                                            변경 요청:{' '}
                                            {userActionRequest.team ||
                                              '-'}
                                            {' · '}
                                            {userActionRequest.borrower ||
                                              '-'}
                                            {' · '}
                                            {userActionRequest.startDate ||
                                              '-'}
                                            {' ~ '}
                                            {userActionRequest.dueDate ||
                                              '-'}
                                          </div>
                                        )}

                                        {userActionRequest.type ===
                                          USER_REQUEST_ACTION.EXTEND && (
                                          <div className="space-y-0.5 leading-5">
                                            <div>
                                              연장 기간:{' '}
                                              {userActionRequest.extensionStartDate || '-'}
                                              {' ~ '}
                                              {userActionRequest.dueDate || '-'}
                                            </div>
                                            <div>
                                              연장 차수:{' '}
                                              {userActionRequest.extensionNumber || '-'}회차
                                              {' · '}처리 방식:{' '}
                                              {userActionRequest.approvalMode ===
                                              RENTAL_EXTENSION_APPROVAL_MODE.AUTO
                                                ? '자동 승인'
                                                : '관리자 승인'}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      {hasPendingUserAction && (
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            variant="primary"
                                            disabled={
                                              isUserActionSaving
                                            }
                                            onClick={() =>
                                              reviewUserActionRequest(
                                                r.id,
                                                true
                                              )
                                            }
                                            className="px-3 py-2 text-xs"
                                          >
                                            승인
                                          </Button>

                                          <Button
                                            type="button"
                                            variant="dangerOutline"
                                            disabled={
                                              isUserActionSaving
                                            }
                                            onClick={() =>
                                              reviewUserActionRequest(
                                                r.id,
                                                false
                                              )
                                            }
                                            className="px-3 py-2 text-xs"
                                          >
                                            불허
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="border-t border-slate-100 pt-2">
                                  <label className="block">
                                    <span className="block text-[10px] font-semibold uppercase text-slate-500">
                                      승인 관리자 심사 및 인수인계 코멘트
                                    </span>

                                    <input
                                      type="text"
                                      value={r.adminMemo || ''}
                                      onChange={(event) =>
                                        updateRequestMemo(
                                          r.id,
                                          event.target.value
                                        )
                                      }
                                      onBlur={(event) => {
                                        if (
                                          hasRentalRequestDocument
                                        ) {
                                          saveRequestMemo(
                                            r.id,
                                            event.target.value
                                          );
                                        }
                                      }}
                                      disabled={
                                        !hasRentalRequestDocument
                                      }
                                      placeholder="전달 혹은 상태 변경 사유 등을 남겨 공유하세요."
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus disabled:cursor-not-allowed disabled:bg-slate-100"
                                    />
                                  </label>
                                </div>

                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] font-semibold uppercase text-slate-500">
                                    관리자 처리 이력
                                  </div>

                                  {!rentalRequestLogsReady ? (
                                    <div className="mt-2 text-[11px] text-slate-400">
                                      처리 이력을 불러오는 중입니다.
                                    </div>
                                  ) : rentalRequestLogsLoadErrorMessage ? (
                                    <div className="mt-2 text-[11px] text-rose-600">
                                      {rentalRequestLogsLoadErrorMessage}
                                    </div>
                                  ) : requestAuditLogs.length === 0 ? (
                                    <div className="mt-2 text-[11px] text-slate-400">
                                      기록된 관리자 처리 이력이 없습니다.
                                    </div>
                                  ) : (
                                    <div className="mt-2 space-y-2">
                                      {requestAuditLogs
                                        .slice(0, 10)
                                        .map((log) => (
                                          <div
                                            key={log.id}
                                            className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <span className="font-semibold text-slate-800">
                                                {log.action ===
                                                RENTAL_REQUEST_AUDIT_ACTION.STATUS_CHANGED
                                                  ? `${log.previousStatus || '-'} → ${log.nextStatus || '-'}`
                                                  : log.action ===
                                                      RENTAL_REQUEST_AUDIT_ACTION.STATUS_RESTORED
                                                    ? `상태 복구: ${log.previousStatus || '-'} → ${log.nextStatus || '-'}`
                                                    : log.action ===
                                                        RENTAL_REQUEST_AUDIT_ACTION.REQUEST_EDITED
                                                      ? '신청정보 수정'
                                                      : log.action ===
                                                          RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED
                                                        ? '관리자 메모 변경'
                                                        : '사용자 요청 검토'}
                                              </span>

                                              <span className="text-[10px] text-slate-400">
                                                {formatFirestoreTimestamp(
                                                  log.createdAt
                                                )}
                                              </span>
                                            </div>

                                            <div className="mt-1 text-[10px] text-slate-500">
                                              처리 관리자:{' '}
                                              {log.actorName ||
                                                log.actorAdminId ||
                                                log.actorUid ||
                                                '-'}
                                            </div>

                                            {log.action ===
                                              RENTAL_REQUEST_AUDIT_ACTION.MEMO_CHANGED && (
                                              <div className="mt-1 break-words text-[10px] text-slate-500">
                                                변경 메모:{' '}
                                                {log.nextMemo ||
                                                  '(빈 메모)'}
                                              </div>
                                            )}

                                            {log.detail && (
                                              <div className="mt-1 break-words text-[10px] text-slate-500">
                                                {log.detail}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : filteredAdminRequests.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                          선택한 탭과 검색 조건에 해당하는 신청이 없습니다.
                        </div>
                      ) : (
                        <>
                          <div className="hidden w-full max-w-full overflow-hidden rounded-xl border border-slate-200 xl:block">
                            <table className="w-full table-fixed border-collapse text-left">
                              <colgroup>
                                <col className="w-[5%]" />
                                <col className="w-[17%]" />
                                <col className="w-[11%]" />
                                <col className="w-[14%]" />
                                <col className="w-[19%]" />
                                <col className="w-[9%]" />
                                <col className="w-[15%]" />
                                <col className="w-[10%]" />
                              </colgroup>

                              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <tr>
                                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">
                                    순번
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5">
                                    기기명
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5">
                                    신청자
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5">
                                    부서명
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5">
                                    대여기간
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">
                                    상태
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5">
                                    접수·처리일
                                  </th>
                                  <th className="border-b border-slate-200 px-2 py-2.5 text-center">
                                    비고
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {paginatedAdminRequests.map((request, index) => {
                                  const requestLogs =
                                    rentalRequestLogsByRequestId.get(request.id) || [];
                                  const sequence =
                                    (safeAdminRequestPage - 1) * adminRequestPageSize +
                                    index +
                                    1;
                                  const referenceDate = getAdminRequestReferenceDate(
                                    request,
                                    requestLogs
                                  );
                                  const remark = getAdminRequestRemark(request);

                                  return (
                                    <tr
                                      key={request.id}
                                      className="cursor-pointer border-b border-slate-100 align-middle last:border-b-0 hover:bg-slate-50"
                                      onClick={() =>
                                        setSelectedAdminRequestId(request.id)
                                      }
                                    >
                                      <td className="px-2 py-2.5 text-center text-[11px] font-semibold text-slate-400">
                                        {sequence}
                                      </td>

                                      <td className="px-2 py-2.5">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                            {request.assetCategory || '기기'}
                                          </span>
                                          <button
                                            type="button"
                                            className="min-w-0 truncate text-left text-xs font-bold text-slate-900 hover:text-orange-600 hover:underline"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedAdminRequestId(request.id);
                                            }}
                                          >
                                            {request.assetNo || '-'}
                                          </button>
                                        </div>
                                      </td>

                                      <td className="truncate px-2 py-2.5 text-xs font-semibold text-slate-800">
                                        {request.requesterName ||
                                          request.borrower ||
                                          request.requesterEmail ||
                                          '-'}
                                      </td>

                                      <td className="truncate px-2 py-2.5 text-xs text-slate-600">
                                        {request.requesterTeam || request.team || '-'}
                                      </td>

                                      <td className="whitespace-nowrap px-2 py-2.5 text-[11px] leading-5 text-slate-600">
                                        {request.startDate || '-'} ~ {request.dueDate || '-'}
                                      </td>

                                      <td className="px-2 py-2.5 text-center">
                                        <Badge>{getRequestDisplayStatus(request)}</Badge>
                                      </td>

                                      <td className="break-words px-2 py-2.5 text-[10px] leading-4 text-slate-500">
                                        {referenceDate}
                                      </td>

                                      <td className="px-2 py-2.5 text-center text-[10px] text-slate-500">
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

                          <div className="space-y-3 xl:hidden">
                            {paginatedAdminRequests.map((request, index) => {
                              const requestLogs =
                                rentalRequestLogsByRequestId.get(request.id) || [];
                              const sequence =
                                (safeAdminRequestPage - 1) * adminRequestPageSize +
                                index +
                                1;
                              const referenceDate = getAdminRequestReferenceDate(
                                request,
                                requestLogs
                              );
                              const remark = getAdminRequestRemark(request);

                              return (
                                <button
                                  key={request.id}
                                  type="button"
                                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30"
                                  onClick={() =>
                                    setSelectedAdminRequestId(request.id)
                                  }
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

                                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
                                    <div>
                                      <div className="font-semibold text-slate-400">신청자</div>
                                      <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">
                                        {request.requesterName ||
                                          request.borrower ||
                                          request.requesterEmail ||
                                          '-'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-semibold text-slate-400">부서명</div>
                                      <div className="mt-0.5 truncate text-xs text-slate-700">
                                        {request.requesterTeam || request.team || '-'}
                                      </div>
                                    </div>
                                    <div className="col-span-2">
                                      <div className="font-semibold text-slate-400">대여기간</div>
                                      <div className="mt-0.5 text-xs text-slate-700">
                                        {request.startDate || '-'} ~ {request.dueDate || '-'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-semibold text-slate-400">접수·처리일</div>
                                      <div className="mt-0.5 text-xs text-slate-700">
                                        {referenceDate}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="font-semibold text-slate-400">비고</div>
                                      <div className="mt-0.5 text-xs font-semibold text-slate-700">
                                        {remark}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-[11px] text-slate-500">
                              검색 결과{' '}
                              {filteredAdminRequests.length}건 ·{' '}
                              {safeAdminRequestPage} /{' '}
                              {adminRequestTotalPages}페이지
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminRequestPage <= 1
                                }
                                onClick={() =>
                                  setAdminRequestPage(
                                    (prev) =>
                                      Math.max(
                                        1,
                                        prev - 1
                                      )
                                  )
                                }
                              >
                                이전
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                className="px-3 py-2 text-xs"
                                disabled={
                                  safeAdminRequestPage >=
                                  adminRequestTotalPages
                                }
                                onClick={() =>
                                  setAdminRequestPage(
                                    (prev) =>
                                      Math.min(
                                        adminRequestTotalPages,
                                        prev + 1
                                      )
                                  )
                                }
                              >
                                다음
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
  );
}
