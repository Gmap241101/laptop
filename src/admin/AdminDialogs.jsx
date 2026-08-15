import { lazy, Suspense } from 'react';
import ModalPortal from '../components/ModalPortal.jsx';

const RichTextEditor = lazy(() =>
  import('../components/RichTextEditor.jsx').then((module) => ({
    default: module.RichTextEditor,
  }))
);

const LazyRichTextEditor = (props) => (
  <Suspense
    fallback={
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-500">
        편집기를 불러오는 중입니다.
      </div>
    }
  >
    <RichTextEditor {...props} />
  </Suspense>
);

export default function AdminDialogs({ ctx }) {
  const {
    AlertCircle,
    AnimatePresence,
    Button,
    CheckCircle2,
    Input,
    Select,
    X,
    closeFaqPostDialog,
    closeNoticePostDialog,
    closePopupPostDialog,
    confirmModal,
    faqCategories,
    faqPostDialog,
    faqPostForm,
    faqPostSaving,
    motion,
    noticePostDialog,
    noticePostForm,
    noticePostSaving,
    popupPostDialog,
    popupPostForm,
    popupPostSaving,
    saveFaqPost,
    saveNoticePost,
    savePopupPost,
    setConfirmModal,
    setFaqPostForm,
    setNoticePostForm,
    setPopupPostForm,
    setToast,
    toast,
  } = ctx;

  return (
    <>
            {popupPostDialog && (
        <ModalPortal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[94vh] w-full max-w-5xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  팝업 {popupPostDialog.mode === 'edit' ? '수정' : '등록'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  사용자 초기화면 또는 대여 신청 페이지에 표시할 내용과 노출 일정을 설정합니다.
                </p>
              </div>

              <button
                type="button"
                onClick={closePopupPostDialog}
                disabled={popupPostSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">사용 여부</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                      사용안함이면 노출 기간과 관계없이 사용자 화면에 표시되지 않습니다.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(popupPostForm.enabled)}
                    disabled={popupPostSaving}
                    onClick={() => setPopupPostForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${popupPostForm.enabled ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-60`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${popupPostForm.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="제목 (선택)"
                  value={popupPostForm.title}
                  onChange={(value) => setPopupPostForm((prev) => ({ ...prev, title: value }))}
                  placeholder="비워두면 제목 영역을 표시하지 않습니다."
                />
                <Input
                  label="부제목 (선택)"
                  value={popupPostForm.subtitle}
                  onChange={(value) => setPopupPostForm((prev) => ({ ...prev, subtitle: value }))}
                  placeholder="비워두면 부제목 영역을 표시하지 않습니다."
                />
              </div>

              <LazyRichTextEditor
                label="내용 (선택)"
                value={popupPostForm.contentHtml}
                onChange={(contentHtml) => setPopupPostForm((prev) => ({ ...prev, contentHtml }))}
                placeholder="팝업 내용을 입력하거나 이미지·유튜브 태그를 붙여넣어 주세요."
                minHeight={300}
                disabled={popupPostSaving}
              />

              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">노출 시작일시</span>
                  <input
                    type="datetime-local"
                    value={popupPostForm.startAt}
                    onChange={(event) => setPopupPostForm((prev) => ({ ...prev, startAt: event.target.value }))}
                    disabled={popupPostSaving}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none mk-form-focus"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">노출 종료일시</span>
                  <input
                    type="datetime-local"
                    value={popupPostForm.endAt}
                    onChange={(event) => setPopupPostForm((prev) => ({ ...prev, endAt: event.target.value }))}
                    disabled={popupPostSaving || popupPostForm.isIndefinite}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 mk-form-focus"
                  />
                </label>

                <label className="md:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(popupPostForm.isIndefinite)}
                    onChange={(event) => setPopupPostForm((prev) => ({ ...prev, isIndefinite: event.target.checked }))}
                    disabled={popupPostSaving}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">종료일 없이 무기한 노출</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">시작일시 이후 사용함 상태인 동안 계속 노출합니다.</div>
                  </div>
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-800">노출 페이지</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    ['home', '사용자 초기화면'],
                    ['rental', '대여 신청 페이지'],
                  ].map(([pageKey, label]) => {
                    const checked = (popupPostForm.targetPages || []).includes(pageKey);
                    return (
                      <label key={pageKey} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={popupPostSaving}
                          onChange={(event) => setPopupPostForm((prev) => ({
                            ...prev,
                            targetPages: event.target.checked
                              ? [...new Set([...(prev.targetPages || []), pageKey])]
                              : (prev.targetPages || []).filter((item) => item !== pageKey),
                          }))}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={popupPostSaving} onClick={closePopupPostDialog}>취소</Button>
              <Button type="button" variant="primary" disabled={popupPostSaving} onClick={savePopupPost}>
                {popupPostSaving ? '저장 중...' : popupPostDialog.mode === 'edit' ? '수정 저장' : '팝업 등록'}
              </Button>
            </div>
          </motion.div>
        </ModalPortal>
      )}

      {faqPostDialog && (
        <ModalPortal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
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

              <LazyRichTextEditor
                label="본문"
                value={faqPostForm.contentHtml}
                onChange={(contentHtml) =>
                  setFaqPostForm((prev) => ({
                    ...prev,
                    contentHtml,
                  }))
                }
                placeholder="FAQ 답변 내용을 입력해 주세요."
                minHeight={280}
                disabled={faqPostSaving}
              />

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
        </ModalPortal>
      )}

      {noticePostDialog && (
        <ModalPortal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
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

              <LazyRichTextEditor
                label="내용"
                value={noticePostForm.contentHtml}
                onChange={(contentHtml) =>
                  setNoticePostForm((prev) => ({
                    ...prev,
                    contentHtml,
                  }))
                }
                placeholder="공지사항 내용을 입력해 주세요."
                minHeight={280}
                disabled={noticePostSaving}
              />

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
        </ModalPortal>
      )}

      {/* --- 모던 Custom Toast (iframe 환경 완벽 최적화) --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[220] flex items-center gap-3 rounded-2xl px-4.5 py-3.5 shadow-xl border text-xs font-semibold ${
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
            <span className="whitespace-pre-line">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모던 Custom Confirm Modal (iframe 차단 방지) --- */}
      {confirmModal && (
        <ModalPortal className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              {confirmModal.title}
            </h3>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {confirmModal.message}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                disabled={confirmModal.isProcessing}
                onClick={() => setConfirmModal(null)}
                className="rounded-xl px-4 py-2"
              >
                {confirmModal.cancelLabel || '취소'}
              </Button>

              {confirmModal.secondaryLabel && confirmModal.onSecondary && (
                <Button
                  variant={confirmModal.secondaryVariant || 'outline'}
                  disabled={confirmModal.isProcessing}
                  onClick={async () => {
                    setConfirmModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            isProcessing: true,
                          }
                        : prev
                    );

                    try {
                      const result = await confirmModal.onSecondary();

                      if (result === false) {
                        setConfirmModal((prev) =>
                          prev
                            ? {
                                ...prev,
                                isProcessing: false,
                              }
                            : prev
                        );
                        return;
                      }

                      setConfirmModal(null);
                    } catch (error) {
                      console.error('Secondary confirm action error:', error);
                      setConfirmModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              isProcessing: false,
                            }
                          : prev
                      );
                    }
                  }}
                  className="rounded-xl px-4 py-2"
                >
                  {confirmModal.secondaryLabel}
                </Button>
              )}

              <Button
                variant={confirmModal.variant || 'danger'}
                disabled={confirmModal.isProcessing}
                onClick={async () => {
                  setConfirmModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          isProcessing: true,
                        }
                      : prev
                  );

                  try {
                    const result = await confirmModal.onConfirm?.();

                    if (result === false) {
                      setConfirmModal((prev) =>
                        prev
                          ? {
                              ...prev,
                              isProcessing: false,
                            }
                          : prev
                      );
                      return;
                    }

                    setConfirmModal(null);
                  } catch (error) {
                    console.error('Confirm action error:', error);
                    setConfirmModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            isProcessing: false,
                          }
                        : prev
                    );
                  }
                }}
                className="rounded-xl px-4 py-2"
              >
                {confirmModal.isProcessing
                  ? confirmModal.confirmLoadingLabel || '처리 중...'
                  : confirmModal.confirmLabel || '확인 및 실행'}
              </Button>
            </div>
          </motion.div>
        </ModalPortal>
      )}
    </>
  );
}
