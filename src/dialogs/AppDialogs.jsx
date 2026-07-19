export default function AppDialogs({ ctx }) {
  const {
    AlertCircle,
    AnimatePresence,
    Button,
    CheckCircle2,
    DateInputWithWeekday,
    Input,
    Select,
    USER_REQUEST_ACTION,
    X,
    activeUserActionRentalRequest,
    addDaysFrom,
    adminRequestEditBorrowers,
    adminRequestEditDialog,
    adminRequestEditForm,
    adminRequestEditSaving,
    adminRequestRestoreDialog,
    adminRequestRestoreReason,
    adminRequestRestoreSaving,
    adminRequestRestoreTarget,
    closeAdminRequestEditDialog,
    closeAdminRequestRestoreDialog,
    closeFaqPostDialog,
    closeNoticePostDialog,
    closeUserActionDialog,
    confirmModal,
    data,
    faqCategories,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    getMaxRentalDueDate,
    getUserRequestActionLabel,
    motion,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    restoreAdminRequestStatus,
    saveAdminRequestEdit,
    saveFaqPost,
    saveNoticePost,
    setAdminRequestEditForm,
    setAdminRequestRestoreReason,
    setAdminRequestRestoreTarget,
    setConfirmModal,
    setFaqPostForm,
    setNoticePostForm,
    setToast,
    setUserActionForm,
    submitUserActionRequest,
    toast,
    today,
    userActionBorrowers,
    userActionDialog,
    userActionForm,
    userActionSaving,
  } = ctx;

  return (
    <>
      {adminRequestEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  대여 신청정보 수정
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  관리자 수정에는 최대 대여 가능일 14일 제한을 적용하지 않습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestEditDialog}
                disabled={adminRequestEditSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {data.settings.teamInputMode === 'dropdown' ? (
                <Select
                  label="부서 / 팀"
                  value={adminRequestEditForm.team}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        team: value,
                        borrower: '',
                      })
                    )
                  }
                >
                  <option value="">
                    팀 선택
                  </option>
                  {(data.teams || []).map(
                    (team) => (
                      <option
                        key={team}
                        value={team}
                      >
                        {team}
                      </option>
                    )
                  )}
                </Select>
              ) : (
                <Input
                  label="부서 / 팀"
                  value={adminRequestEditForm.team}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        team: value,
                      })
                    )
                  }
                />
              )}

              {data.settings.borrowerInputMode === 'dropdown' ? (
                <Select
                  label="대여자명"
                  value={adminRequestEditForm.borrower}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        borrower: value,
                      })
                    )
                  }
                >
                  <option value="">
                    {adminRequestEditForm.team
                      ? '대여자 선택'
                      : '소속 부서를 먼저 선택해 주세요'}
                  </option>

                  {adminRequestEditBorrowers.map(
                    (borrower) => (
                      <option
                        key={`${borrower.id}-${borrower.name}`}
                        value={borrower.name}
                      >
                        {borrower.name}
                      </option>
                    )
                  )}
                </Select>
              ) : (
                <Input
                  label="대여자명"
                  value={adminRequestEditForm.borrower}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        borrower: value,
                      })
                    )
                  }
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DateInputWithWeekday
                  label="대여 시작일"
                  value={adminRequestEditForm.startDate}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        startDate: value,
                        dueDate:
                          prev.dueDate < value
                            ? value
                            : prev.dueDate,
                      })
                    )
                  }
                />

                <DateInputWithWeekday
                  label="반납 예정일"
                  value={adminRequestEditForm.dueDate}
                  min={adminRequestEditForm.startDate}
                  onChange={(value) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        dueDate: value,
                      })
                    )
                  }
                />
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  대여 목적
                </span>
                <textarea
                  value={adminRequestEditForm.purpose}
                  onChange={(event) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        purpose:
                          event.target.value,
                      })
                    )
                  }
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  관리자 메모
                </span>
                <textarea
                  value={adminRequestEditForm.adminMemo}
                  onChange={(event) =>
                    setAdminRequestEditForm(
                      (prev) => ({
                        ...prev,
                        adminMemo:
                          event.target.value,
                      })
                    )
                  }
                  className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestEditSaving}
                onClick={closeAdminRequestEditDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestEditSaving}
                onClick={saveAdminRequestEdit}
              >
                {adminRequestEditSaving
                  ? '저장 중...'
                  : '수정 저장'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {adminRequestRestoreDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  신청 상태 되돌리기
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  활성 상태로 복구할 때 자산 예약 정보를 다시 생성하고 다른 예약과의 충돌을 검사합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAdminRequestRestoreDialog}
                disabled={adminRequestRestoreSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구할 상태
                </span>
                <select
                  value={adminRequestRestoreTarget}
                  onChange={(event) =>
                    setAdminRequestRestoreTarget(
                      event.target.value
                    )
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-border-focus"
                >
                  {(adminRequestRestoreDialog.targetOptions || []).map(
                    (status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  복구 사유
                </span>
                <textarea
                  value={adminRequestRestoreReason}
                  onChange={(event) =>
                    setAdminRequestRestoreReason(
                      event.target.value
                    )
                  }
                  placeholder="잘못 처리한 이유와 복구가 필요한 사유를 입력해 주세요."
                  className="h-28 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                관리자 복구에는 최대 14일 제한을 적용하지 않습니다. 다만 날짜 순서 오류와 동일 기기의 다른 활성 예약 충돌은 차단됩니다.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={adminRequestRestoreSaving}
                onClick={closeAdminRequestRestoreDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={adminRequestRestoreSaving}
                onClick={restoreAdminRequestStatus}
              >
                {adminRequestRestoreSaving
                  ? '복구 중...'
                  : '상태 복구'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

            {userActionDialog && activeUserActionRentalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {getUserRequestActionLabel(
                    userActionDialog.type
                  )}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {activeUserActionRentalRequest.assetNo} ·{' '}
                  {activeUserActionRentalRequest.startDate} ~{' '}
                  {activeUserActionRentalRequest.dueDate}
                </p>
              </div>

              <button
                type="button"
                onClick={closeUserActionDialog}
                disabled={userActionSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {userActionDialog.type ===
                USER_REQUEST_ACTION.CHANGE && (
                <>
                  {data.settings.teamInputMode === 'dropdown' ? (
                    <Select
                      label="변경할 부서 / 팀"
                      value={userActionForm.team}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          team: value,
                          borrower: '',
                        }))
                      }
                    >
                      <option value="">팀 선택</option>
                      {(data.teams || []).map((team) => (
                        <option key={team} value={team}>
                          {team}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="변경할 부서 / 팀"
                      value={userActionForm.team}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          team: value,
                        }))
                      }
                    />
                  )}

                  {data.settings.borrowerInputMode === 'dropdown' ? (
                    <Select
                      label="변경할 대여자명"
                      value={userActionForm.borrower}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          borrower: value,
                        }))
                      }
                    >
                      <option value="">
                        {userActionForm.team
                          ? '대여자 선택'
                          : '소속 부서를 먼저 선택해 주세요'}
                      </option>

                      {userActionBorrowers.map((borrower) => (
                        <option
                          key={`${borrower.id}-${borrower.name}`}
                          value={borrower.name}
                        >
                          {borrower.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="변경할 대여자명"
                      value={userActionForm.borrower}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          borrower: value,
                        }))
                      }
                    />
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DateInputWithWeekday
                      label="변경할 대여 시작일"
                      value={userActionForm.startDate}
                      min={today()}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          startDate: value,
                          dueDate:
                            prev.dueDate < value
                              ? value
                              : prev.dueDate,
                        }))
                      }
                    />

                    <DateInputWithWeekday
                      label="변경할 반납 예정일"
                      value={userActionForm.dueDate}
                      min={userActionForm.startDate}
                      max={getMaxRentalDueDate(
                        userActionForm.startDate,
                        data.settings
                      )}
                      onChange={(value) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          dueDate: value,
                        }))
                      }
                    />
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      변경할 대여 목적
                    </span>

                    <textarea
                      value={userActionForm.purpose}
                      onChange={(event) =>
                        setUserActionForm((prev) => ({
                          ...prev,
                          purpose: event.target.value,
                        }))
                      }
                      className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                    />
                  </label>
                </>
              )}


              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  요청 사유
                </span>

                <textarea
                  value={userActionForm.reason}
                  onChange={(event) =>
                    setUserActionForm((prev) => ({
                      ...prev,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="관리자가 검토할 수 있도록 요청 사유를 입력해 주세요."
                  className="h-24 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={userActionSaving}
                onClick={closeUserActionDialog}
              >
                닫기
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={userActionSaving}
                onClick={submitUserActionRequest}
              >
                {userActionSaving
                  ? '저장 중...'
                  : '요청 제출'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

            {faqPostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  FAQ{' '}
                  {faqPostDialog.mode === 'edit'
                    ? '수정'
                    : '등록'}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  FAQ 작성과 수정은 관리자 모드에서만 가능합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeFaqPostDialog}
                disabled={faqPostSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Select
                label="카테고리"
                value={faqPostForm.categoryId}
                onChange={(value) =>
                  setFaqPostForm(
                    (prev) => ({
                      ...prev,
                      categoryId: value,
                    })
                  )
                }
              >
                <option value="">
                  카테고리 선택
                </option>

                {faqCategories.map(
                  (category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  )
                )}
              </Select>

              <Input
                label="제목"
                value={faqPostForm.title}
                onChange={(value) =>
                  setFaqPostForm(
                    (prev) => ({
                      ...prev,
                      title: value,
                    })
                  )
                }
                placeholder="FAQ 질문 제목을 입력해 주세요."
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  본문
                </span>

                <textarea
                  value={faqPostForm.content}
                  onChange={(event) =>
                    setFaqPostForm(
                      (prev) => ({
                        ...prev,
                        content:
                          event.target.value,
                      })
                    )
                  }
                  placeholder="FAQ 답변 내용을 입력해 주세요."
                  className="h-56 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    faqPostForm.isPinned
                  }
                  onChange={(event) =>
                    setFaqPostForm(
                      (prev) => ({
                        ...prev,
                        isPinned:
                          event.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                <div>
                  <div className="text-xs font-bold text-slate-800">
                    목록 상단에 고정
                  </div>

                  <div className="mt-0.5 text-[10px] text-slate-500">
                    상단 고정 FAQ는 페이지당 일반 FAQ 수에 포함되지 않습니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={faqPostSaving}
                onClick={closeFaqPostDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={faqPostSaving}
                onClick={saveFaqPost}
              >
                {faqPostSaving
                  ? '저장 중...'
                  : faqPostDialog.mode ===
                      'edit'
                    ? '수정 저장'
                    : 'FAQ 등록'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {noticePostDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  공지사항{' '}
                  {noticePostDialog.mode === 'edit'
                    ? '수정'
                    : '등록'}
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  공지사항 작성과 수정은 관리자 모드에서만 가능합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closeNoticePostDialog}
                disabled={noticePostSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Input
                label="제목"
                value={noticePostForm.title}
                onChange={(value) =>
                  setNoticePostForm(
                    (prev) => ({
                      ...prev,
                      title: value,
                    })
                  )
                }
                placeholder="공지사항 제목을 입력해 주세요."
              />

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  내용
                </span>

                <textarea
                  value={noticePostForm.content}
                  onChange={(event) =>
                    setNoticePostForm(
                      (prev) => ({
                        ...prev,
                        content:
                          event.target.value,
                      })
                    )
                  }
                  placeholder="공지사항 내용을 입력해 주세요."
                  className="h-56 w-full rounded-xl border border-slate-200 p-3 text-xs leading-6 outline-none mk-form-ring-focus"
                />
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    noticePostForm.isPinned
                  }
                  onChange={(event) =>
                    setNoticePostForm(
                      (prev) => ({
                        ...prev,
                        isPinned:
                          event.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                <div>
                  <div className="text-xs font-bold text-slate-800">
                    목록 상단에 고정
                  </div>

                  <div className="mt-0.5 text-[10px] text-slate-500">
                    상단 고정 게시글은 페이지당 일반 게시글 수에 포함되지 않습니다.
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={noticePostSaving}
                onClick={closeNoticePostDialog}
              >
                취소
              </Button>

              <Button
                type="button"
                variant="primary"
                disabled={noticePostSaving}
                onClick={saveNoticePost}
              >
                {noticePostSaving
                  ? '저장 중...'
                  : noticePostDialog.mode ===
                      'edit'
                    ? '수정 저장'
                    : '공지사항 등록'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* --- 모던 Custom Toast (iframe 환경 완벽 최적화) --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4.5 py-3.5 shadow-xl border text-xs font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100/40'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/40'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="text-rose-600" size={18} />
            ) : (
              <CheckCircle2 className="text-emerald-600" size={18} />
            )}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모던 Custom Confirm Modal (iframe 차단 방지) --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)} className="rounded-xl px-4 py-2">
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="rounded-xl px-4 py-2"
              >
                확인 및 실행
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
