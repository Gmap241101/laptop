export default function UserRequestHistoryPanel({ ctx }) {
  const {
    Badge,
    Button,
    Card,
    CardContent,
    ClipboardList,
    STATUS,
    RENTAL_EXTENSION_APPROVAL_MODE,
    USER_REQUEST_ACTION,
    USER_REQUEST_REVIEW_STATUS,
    currentAuthAdminAccount,
    currentAuthRoleReady,
    currentUserRequests,
    data,
    firebaseAuthReady,
    firebaseAuthUser,
    formatDateWithKoreanWeekday,
    getDisplayRentalStatus,
    getExtensionRequestAvailableDate,
    getRequestExtensionCount,
    getSafeRentalExtensionBusinessDays,
    getSafeRentalExtensionMaxCount,
    getUserRequestActionLabel,
    getUserRequestReviewStatusLabel,
    goToUserLogin,
    isAdminAuthenticated,
    openUserActionDialog,
    pushAppPath,
    rentalRequestsLoadErrorMessage,
    rentalRequestsReady,
    setIsCommunityMenuOpen,
    setUserTab,
    setView,
    userActionSaving,
  } = ctx;

  return (
            <div className="mx-auto max-w-5xl space-y-6">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white">
                  <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                  <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />

                  <div className="relative">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                      <ClipboardList size={26} />
                    </div>

                    <h2 className="text-xl font-black tracking-tight">
                      나의 대여 신청내역
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      로그인한 계정으로 제출한 기기 대여신청과 처리 상태를 확인합니다.
                    </p>
                  </div>
                </div>

                <CardContent className="p-6">
                  {!firebaseAuthReady ||
                  !currentAuthRoleReady ||
                  !rentalRequestsReady ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center text-xs text-slate-400">
                      로그인 계정과 신청내역을 확인하는 중입니다.
                    </div>
                  ) : rentalRequestsLoadErrorMessage ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs leading-5 text-rose-800">
                      {rentalRequestsLoadErrorMessage}
                    </div>
                  ) : !firebaseAuthUser ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                        신청내역은 일반회원 로그인 후 확인할 수 있습니다.
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={goToUserLogin}
                        >
                          로그인
                        </Button>
                      </div>
                    </div>
                  ) : currentAuthAdminAccount || isAdminAuthenticated ? (
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-xs leading-5 text-orange-800">
                      관리자 계정의 전체 대여신청은 관리자 모드의 대여 신청 관리에서 확인해 주세요.
                    </div>
                  ) : currentUserRequests.length === 0 ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                        <ClipboardList
                          size={28}
                          className="mx-auto mb-3 text-slate-300"
                        />

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
                          onClick={() => {
                            pushAppPath('user', 'rental');
                            setView('user');
                            setUserTab('rental');
                            setIsCommunityMenuOpen(false);
                          }}
                        >
                          대여신청으로 이동
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentUserRequests.map((request) => (
                        <div
                          key={request.id}
                          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {request.assetCategory || '기기'}
                                </span>

                                <span className="text-sm font-bold text-slate-950">
                                  {request.assetNo}
                                </span>

                                <Badge>
                                  {getDisplayRentalStatus(
                                    request.status,
                                    request.startDate
                                  )}
                                </Badge>
                              </div>

                              <div className="text-xs text-slate-600">
                                대여 기간:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.startDate} ~ {request.dueDate}
                                </span>
                              </div>

                              <div className="text-xs text-slate-600">
                                소속:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.team}
                                </span>
                                {' · '}
                                대여자명:{' '}
                                <span className="font-semibold text-slate-900">
                                  {request.borrower}
                                </span>
                              </div>

                              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                목적:{' '}
                                <span className="font-medium text-slate-700">
                                  {request.purpose || '서술 목적 없음'}
                                </span>
                              </div>

                              {request.adminMemo && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                                  관리자 안내: {request.adminMemo}
                                </div>
                              )}

                              {request.status === STATUS.APPROVED && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                                  <div className="font-semibold text-slate-800">
                                    연장 사용 {getRequestExtensionCount(request)} /{' '}
                                    {getSafeRentalExtensionMaxCount(data.settings)}회
                                    {' · '}1회{' '}
                                    {getSafeRentalExtensionBusinessDays(data.settings)}영업일
                                  </div>

                                  <div className="mt-0.5">
                                    {data.settings.rentalExtensionEnabled
                                      ? getRequestExtensionCount(request) >=
                                        getSafeRentalExtensionMaxCount(data.settings)
                                        ? '허용된 연장 횟수를 모두 사용했습니다.'
                                        : `다음 연장 신청 가능일: ${formatDateWithKoreanWeekday(
                                            getExtensionRequestAvailableDate(
                                              request,
                                              data.settings
                                            )
                                          )}`
                                      : '현재 대여 연장 신청이 허용되지 않습니다.'}
                                  </div>
                                </div>
                              )}

                              {request.userActionRequest && (
                                <div
                                  className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
                                    request.userActionRequest.status ===
                                    USER_REQUEST_REVIEW_STATUS.PENDING
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : request.userActionRequest.status ===
                                          USER_REQUEST_REVIEW_STATUS.APPROVED
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-rose-200 bg-rose-50 text-rose-800'
                                  }`}
                                >
                                  <div className="font-bold">
                                    {getUserRequestActionLabel(
                                      request.userActionRequest.type
                                    )}{' '}
                                    ·{' '}
                                    {getUserRequestReviewStatusLabel(
                                      request.userActionRequest.status
                                    )}
                                  </div>

                                  {request.userActionRequest.type !==
                                    USER_REQUEST_ACTION.EXTEND && (
                                    <div className="mt-1">
                                      요청 사유:{' '}
                                      {request.userActionRequest.reason || '-'}
                                    </div>
                                  )}

                                  {request.userActionRequest.type ===
                                    USER_REQUEST_ACTION.CHANGE && (
                                    <div className="mt-1">
                                      변경 요청:{' '}
                                      {request.userActionRequest.team || '-'} ·{' '}
                                      {request.userActionRequest.borrower || '-'} ·{' '}
                                      {request.userActionRequest.startDate || '-'} ~{' '}
                                      {request.userActionRequest.dueDate || '-'}
                                    </div>
                                  )}

                                  {request.userActionRequest.type ===
                                    USER_REQUEST_ACTION.EXTEND && (
                                    <div className="mt-1 space-y-0.5">
                                      <div>
                                        연장 기간:{' '}
                                        {request.userActionRequest.extensionStartDate || '-'}
                                        {' ~ '}
                                        {request.userActionRequest.dueDate || '-'}
                                      </div>
                                      <div>
                                        연장 차수:{' '}
                                        {request.userActionRequest.extensionNumber || '-'}회차
                                        {' · '}처리 방식:{' '}
                                        {request.userActionRequest.approvalMode ===
                                        RENTAL_EXTENSION_APPROVAL_MODE.AUTO
                                          ? '자동 승인'
                                          : '관리자 승인'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                              <div className="text-[10px] text-slate-400">
                                접수 일시: {request.requestedAt}
                              </div>

                              {request.userActionRequest?.status ===
                              USER_REQUEST_REVIEW_STATUS.PENDING ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                                  사용자 요청 검토 대기중
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  {[STATUS.REQUESTED, STATUS.ON_HOLD].includes(
                                    request.status
                                  ) && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.CHANGE
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        신청 변경 요청
                                      </Button>

                                      <Button
                                        type="button"
                                        variant="dangerOutline"
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.CANCEL
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        신청 취소 요청
                                      </Button>
                                    </>
                                  )}

                                  {request.status ===
                                    STATUS.APPROVED && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={userActionSaving}
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.EXTEND
                                          )
                                        }
                                        className="px-3 py-2 text-xs"
                                      >
                                        대여 연장 요청
                                      </Button>


                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={userActionSaving}
                                        onClick={() =>
                                          openUserActionDialog(
                                            request,
                                            USER_REQUEST_ACTION.RETURN
                                          )
                                        }
                                        className="px-3 py-2 text-xs text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                                      >
                                        조기 반납 요청
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
  );
}
