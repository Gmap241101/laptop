import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor.jsx';

export default function AdminFooterPanel({ ctx }) {
  const {
    Button,
    footerConfigDraft,
    footerConfigLoadErrorMessage,
    footerConfigReady,
    footerConfigSaving,
    footerPageDeletingId,
    footerPageDialog,
    footerPageForm,
    footerPageSaving,
    footerPageToggleSavingId,
    footerPages,
    footerPagesLoadErrorMessage,
    footerPagesReady,
    closeFooterPageDialog,
    confirmDeleteFooterPage,
    moveFooterPage,
    openFooterPageDialog,
    saveFooterConfig,
    saveFooterPage,
    setFooterConfigDraft,
    setFooterPageForm,
    toggleFooterPageEnabled,
  } = ctx;

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-900">푸터 관리</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          사용자 화면 하단의 공통 정보와 푸터 메뉴 상세 페이지를 관리합니다. 관리자 화면에는 푸터가 표시되지 않습니다.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">푸터 공통 정보</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              회색 배경 영역의 회사명, 주소, 연락처, 등록번호, 저작권 문구 등을 작성합니다.
            </p>
          </div>

          <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
            <span>사용</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(footerConfigDraft.enabled)}
              disabled={!footerConfigReady || footerConfigSaving}
              onClick={() =>
                setFooterConfigDraft((prev) => ({
                  ...prev,
                  enabled: !Boolean(prev.enabled),
                }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                footerConfigDraft.enabled ? 'bg-emerald-500' : 'bg-slate-300'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                  footerConfigDraft.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>

        <div className="space-y-4 p-5">
          {!footerConfigReady ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              푸터 공통 정보를 불러오는 중입니다.
            </div>
          ) : footerConfigLoadErrorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
              {footerConfigLoadErrorMessage}
            </div>
          ) : (
            <>
              <RichTextEditor
                label="공통 정보 내용"
                value={footerConfigDraft.contentHtml}
                onChange={(contentHtml) =>
                  setFooterConfigDraft((prev) => ({ ...prev, contentHtml }))
                }
                placeholder="회사명, 주소, 연락처, 등록번호, 저작권 문구 등을 입력해 주세요."
                minHeight={220}
                disabled={footerConfigSaving}
                allowVideos={false}
              />

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  onClick={saveFooterConfig}
                  disabled={footerConfigSaving}
                >
                  {footerConfigSaving ? '저장 중...' : '공통 정보 저장'}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">푸터 메뉴 페이지</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              푸터 상단의 메뉴 제목과 클릭했을 때 표시할 상세 본문 또는 외부 링크를 관리합니다.
            </p>
          </div>

          <Button
            type="button"
            variant="primary"
            className="shrink-0 px-4 py-2 text-xs"
            onClick={() => openFooterPageDialog()}
          >
            <Plus size={14} />
            메뉴 페이지 등록
          </Button>
        </div>

        <div className="p-5">
          {!footerPagesReady ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              푸터 메뉴 페이지를 불러오는 중입니다.
            </div>
          ) : footerPagesLoadErrorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-800">
              {footerPagesLoadErrorMessage}
            </div>
          ) : footerPages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-xs text-slate-400">
              등록된 푸터 메뉴 페이지가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[760px] w-full border-collapse text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="w-24 border-b border-slate-200 px-3 py-3 text-center">순서</th>
                    <th className="w-20 border-b border-slate-200 px-3 py-3 text-center">사용</th>
                    <th className="border-b border-slate-200 px-4 py-3">제목</th>
                    <th className="w-28 border-b border-slate-200 px-3 py-3 text-center">항상 굵게</th>
                    <th className="w-32 border-b border-slate-200 px-3 py-3 text-center">수정일</th>
                    <th className="w-40 border-b border-slate-200 px-3 py-3 text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {footerPages.map((page, index) => (
                    <tr key={page.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="위로 이동"
                            aria-label="위로 이동"
                            disabled={index === 0}
                            onClick={() => moveFooterPage(page.id, -1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            title="아래로 이동"
                            aria-label="아래로 이동"
                            disabled={index === footerPages.length - 1}
                            onClick={() => moveFooterPage(page.id, 1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(page.enabled)}
                          disabled={footerPageToggleSavingId === page.id}
                          onClick={() => toggleFooterPageEnabled(page)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                            page.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                          } disabled:cursor-wait disabled:opacity-60`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                              page.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              page.pageType === 'link'
                                ? 'border-orange-200 bg-orange-50 text-orange-700'
                                : 'border-sky-200 bg-sky-50 text-sky-700'
                            }`}
                          >
                            {page.pageType === 'link' ? '링크' : '본문'}
                          </span>
                          <div className="min-w-0 truncate text-sm font-semibold text-slate-800">
                            {page.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-600">
                        {page.isTitleBold ? '사용' : '-'}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">
                        {ctx.formatFirestoreDate(page.updatedAt || page.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openFooterPageDialog(page)}
                            title="수정"
                            aria-label="푸터 페이지 수정"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmDeleteFooterPage(page)}
                            disabled={footerPageDeletingId === page.id}
                            title={footerPageDeletingId === page.id ? '삭제 중' : '삭제'}
                            aria-label="푸터 페이지 삭제"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {footerPageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {footerPageDialog.mode === 'edit' ? '푸터 메뉴 페이지 수정' : '푸터 메뉴 페이지 등록'}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  제목은 푸터 메뉴에 표시되며, 본문형은 상세 페이지 제목에도 동일하게 사용됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFooterPageDialog}
                disabled={footerPageSaving}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700">사용 여부</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    사용함으로 설정한 메뉴만 사용자 푸터에 표시됩니다.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">
                    {footerPageForm.enabled ? '사용함' : '사용안함'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(footerPageForm.enabled)}
                    disabled={footerPageSaving}
                    onClick={() =>
                      setFooterPageForm((prev) => ({
                        ...prev,
                        enabled: !Boolean(prev.enabled),
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                      footerPageForm.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${
                        footerPageForm.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">제목</span>
                <input
                  type="text"
                  value={footerPageForm.title}
                  onChange={(event) =>
                    setFooterPageForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="예: 개인정보처리방침"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none mk-form-focus"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(footerPageForm.isTitleBold)}
                  onChange={(event) =>
                    setFooterPageForm((prev) => ({ ...prev, isTitleBold: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                제목 항상 굵게
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">연결 방식</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      footerPageForm.pageType !== 'link'
                        ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="footer-page-type"
                      value="content"
                      checked={footerPageForm.pageType !== 'link'}
                      disabled={footerPageSaving}
                      onChange={() =>
                        setFooterPageForm((prev) => ({ ...prev, pageType: 'content' }))
                      }
                      className="sr-only"
                    />
                    <span className="block text-sm font-bold text-slate-800">본문 직접 입력</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                      사이트 내부 상세 페이지에 웹에디터 본문을 표시합니다.
                    </span>
                  </label>

                  <label
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      footerPageForm.pageType === 'link'
                        ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="footer-page-type"
                      value="link"
                      checked={footerPageForm.pageType === 'link'}
                      disabled={footerPageSaving}
                      onChange={() =>
                        setFooterPageForm((prev) => ({ ...prev, pageType: 'link' }))
                      }
                      className="sr-only"
                    />
                    <span className="block text-sm font-bold text-slate-800">링크 주소 입력</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                      푸터 제목을 클릭하면 입력한 주소를 새 탭에서 엽니다.
                    </span>
                  </label>
                </div>
              </div>

              {footerPageForm.pageType === 'link' ? (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">링크 주소</span>
                  <input
                    type="url"
                    value={footerPageForm.linkUrl || ''}
                    onChange={(event) =>
                      setFooterPageForm((prev) => ({ ...prev, linkUrl: event.target.value }))
                    }
                    placeholder="https://www.example.com"
                    disabled={footerPageSaving}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none mk-form-focus disabled:bg-slate-100"
                  />
                  <span className="mt-1.5 block text-[11px] leading-5 text-slate-500">
                    http:// 또는 https://로 시작하는 전체 주소를 입력해 주세요. 링크는 항상 새 탭에서 열립니다.
                  </span>
                </label>
              ) : (
                <RichTextEditor
                  label="본문"
                  value={footerPageForm.contentHtml}
                  onChange={(contentHtml) =>
                    setFooterPageForm((prev) => ({ ...prev, contentHtml }))
                  }
                  placeholder="상세 페이지에 표시할 내용을 입력해 주세요."
                  minHeight={320}
                  disabled={footerPageSaving}
                />
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeFooterPageDialog}
                disabled={footerPageSaving}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={saveFooterPage}
                disabled={footerPageSaving}
              >
                {footerPageSaving ? '저장 중...' : footerPageDialog.mode === 'edit' ? '수정 저장' : '등록'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
