import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { RichTextEditor } from '../components/RichTextEditor.jsx';

const isSafeHttpImageUrl = (value = '') => {
  try {
    const parsedUrl = new URL(String(value || '').trim());
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function AdminFooterPanel({ ctx }) {
  const {
    AdminPageHeader,
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

  const [titleImagePreviewFailed, setTitleImagePreviewFailed] = useState(false);
  const isImageTitle = footerPageForm.titleDisplayType === 'image';

  useEffect(() => {
    setTitleImagePreviewFailed(false);
  }, [footerPageForm.titleImageUrl, footerPageForm.titleDisplayType]);

  const footerPageDirty = Boolean(
    footerPageDialog && JSON.stringify(footerPageForm) !== footerPageDialog.initialForm
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    window.__mkFooterPageUnsaved = footerPageDirty;
    const beforeUnload = (event) => {
      if (!footerPageDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      if (window.__mkFooterPageUnsaved === footerPageDirty) {
        window.__mkFooterPageUnsaved = false;
      }
    };
  }, [footerPageDirty]);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="푸터 관리"
        description="사용자 화면 하단의 공통 정보와 푸터 메뉴 상세 페이지를 관리합니다. 관리자 화면에는 푸터가 표시되지 않습니다."
      />

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

      {footerPageDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={footerPageDialog.mode === 'edit' ? '푸터 메뉴 페이지 수정' : '푸터 메뉴 페이지 등록'}
        >
          <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto mk-modal-scroll-shell rounded-2xl border border-orange-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-orange-100 bg-orange-50 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {footerPageDialog.mode === 'edit' ? '푸터 메뉴 페이지 수정' : '푸터 메뉴 페이지 등록'}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  배너 관리와 같은 입력 체계로 제목 표시, 연결 방식, 탭 열기와 상세 본문을 등록합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFooterPageDialog}
                disabled={footerPageSaving}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
          </div>

          <div className="space-y-5 p-5">
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

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">제목 표시 방식</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      !isImageTitle
                        ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="footer-title-display-type"
                      value="text"
                      checked={!isImageTitle}
                      disabled={footerPageSaving}
                      onChange={() =>
                        setFooterPageForm((prev) => ({ ...prev, titleDisplayType: 'text' }))
                      }
                      className="sr-only"
                    />
                    <span className="block text-sm font-bold text-slate-800">텍스트 제목</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                      입력한 제목을 푸터 메뉴에 텍스트로 표시합니다.
                    </span>
                  </label>

                  <label
                    className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                      isImageTitle
                        ? 'border-orange-300 bg-orange-50 ring-1 ring-orange-200'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="footer-title-display-type"
                      value="image"
                      checked={isImageTitle}
                      disabled={footerPageSaving}
                      onChange={() =>
                        setFooterPageForm((prev) => ({ ...prev, titleDisplayType: 'image' }))
                      }
                      className="sr-only"
                    />
                    <span className="block text-sm font-bold text-slate-800">이미지 제목</span>
                    <span className="mt-1 block text-[11px] leading-5 text-slate-500">
                      외부 이미지 URL의 이미지를 텍스트 제목 대신 표시합니다.
                    </span>
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  {isImageTitle ? '대체 텍스트·상세 페이지 제목' : '제목'}
                </span>
                <input
                  type="text"
                  value={footerPageForm.title}
                  onChange={(event) =>
                    setFooterPageForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder={isImageTitle ? '예: 개인정보처리방침 로고' : '예: 개인정보처리방침'}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus"
                />
              </label>

              <label className={`flex items-center gap-2 text-xs font-semibold ${isImageTitle ? 'text-slate-400' : 'text-slate-700'}`}>
                <input
                  type="checkbox"
                  checked={Boolean(footerPageForm.isTitleBold)}
                  disabled={isImageTitle || footerPageSaving}
                  onChange={(event) =>
                    setFooterPageForm((prev) => ({ ...prev, isTitleBold: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                제목 항상 굵게
                {isImageTitle && (
                  <span className="font-normal text-slate-400">(이미지 제목에는 적용되지 않음)</span>
                )}
              </label>

              {isImageTitle && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">제목 이미지 URL</span>
                    <input
                      type="url"
                      value={footerPageForm.titleImageUrl || ''}
                      onChange={(event) =>
                        setFooterPageForm((prev) => ({ ...prev, titleImageUrl: event.target.value }))
                      }
                      placeholder="https://www.example.com/footer-menu.png"
                      disabled={footerPageSaving}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none mk-form-focus disabled:bg-slate-100"
                    />
                  </label>
                  <div className="text-[11px] leading-5 text-slate-500">
                    권장 원본 크기: 세로 40px 이상, 가로 60~240px, 투명 배경 PNG·WebP·SVG. 실제 푸터에서는 현재 글자 크기에 비례해 자동 축소되며, 권장 크기가 아닌 이미지도 사용할 수 있습니다.
                  </div>
                  {isSafeHttpImageUrl(footerPageForm.titleImageUrl) && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
                      <div className="mb-2 text-[10px] font-semibold text-slate-500">푸터 표시 예상 크기</div>
                      {!titleImagePreviewFailed ? (
                        <img
                          src={footerPageForm.titleImageUrl}
                          alt={footerPageForm.title || '푸터 메뉴 이미지 미리보기'}
                          onError={() => setTitleImagePreviewFailed(true)}
                          className="h-[1.4em] max-w-[180px] object-contain"
                        />
                      ) : (
                        <div className="text-[11px] font-semibold text-rose-600">
                          이미지를 불러올 수 없습니다. URL과 외부 접근 권한을 확인해 주세요.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-5">
                <label className="block text-[11px] font-semibold text-slate-600 sm:col-span-1">
                  연결 방식
                  <select
                    value={footerPageForm.pageType}
                    disabled={footerPageSaving}
                    onChange={(event) =>
                      setFooterPageForm((prev) => ({
                        ...prev,
                        pageType: event.target.value,
                        linkUrl: event.target.value === 'link' ? prev.linkUrl : '',
                        openInNewTab: event.target.value === 'link' ? prev.openInNewTab : false,
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 mk-form-focus"
                  >
                    <option value="content">본문 직접 입력</option>
                    <option value="link">외부 링크</option>
                    <option value="none">링크 없음</option>
                  </select>
                </label>

                <label className="block text-[11px] font-semibold text-slate-600 sm:col-span-1">
                  탭 열기
                  <select
                    value={footerPageForm.openInNewTab ? 'new' : 'current'}
                    disabled={footerPageSaving || footerPageForm.pageType !== 'link'}
                    onChange={(event) =>
                      setFooterPageForm((prev) => ({
                        ...prev,
                        openInNewTab: event.target.value === 'new',
                      }))
                    }
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 mk-form-focus"
                  >
                    <option value="current">현재 탭</option>
                    <option value="new">새 탭</option>
                  </select>
                </label>

                <div className="sm:col-span-3">
                  {footerPageForm.pageType === 'link' ? (
                    <label className="block text-[11px] font-semibold text-slate-600">
                      외부 링크 주소
                      <input
                        type="url"
                        value={footerPageForm.linkUrl || ''}
                        onChange={(event) =>
                          setFooterPageForm((prev) => ({ ...prev, linkUrl: event.target.value }))
                        }
                        placeholder="https://www.example.com"
                        disabled={footerPageSaving}
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100 mk-form-focus"
                      />
                    </label>
                  ) : footerPageForm.pageType === 'content' ? (
                    <label className="block text-[11px] font-semibold text-slate-400">
                      연결 대상
                      <input
                        value=""
                        disabled
                        placeholder="아래 본문 편집기에 상세 내용을 입력합니다."
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs outline-none"
                      />
                    </label>
                  ) : (
                    <label className="block text-[11px] font-semibold text-slate-400">
                      연결 대상
                      <input
                        value=""
                        disabled
                        placeholder="클릭 동작 없이 푸터 제목만 표시합니다."
                        className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs outline-none"
                      />
                    </label>
                  )}
                </div>
              </div>

              {footerPageForm.pageType === 'content' && (
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

              {footerPageForm.pageType === 'none' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                  사용자 푸터에는 제목 또는 제목 이미지만 표시되며 클릭 동작은 발생하지 않습니다.
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
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
                <Save size={14} />
                {footerPageSaving ? '저장 중...' : footerPageDialog.mode === 'edit' ? '수정 저장' : '등록'}
              </Button>
            </div>
          </section>
        </div>
      )}

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
            disabled={Boolean(footerPageDialog)}
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
                              page.pageType === 'none' || (page.pageType === 'link' && String(page.linkUrl || '').trim() === '#')
                                ? 'border-slate-300 bg-slate-100 text-slate-700'
                                : page.pageType === 'link'
                                  ? 'border-orange-200 bg-orange-50 text-orange-700'
                                  : 'border-sky-200 bg-sky-50 text-sky-700'
                            }`}
                          >
                            {page.pageType === 'none' || (page.pageType === 'link' && String(page.linkUrl || '').trim() === '#')
                              ? '링크 없음'
                              : page.pageType === 'link'
                                ? `외부 링크 · ${page.openInNewTab === false ? '현재 탭' : '새 탭'}`
                                : '본문'}
                          </span>
                          {page.titleDisplayType === 'image' && isSafeHttpImageUrl(page.titleImageUrl) ? (
                            <img
                              src={page.titleImageUrl}
                              alt=""
                              className="h-5 max-w-24 shrink-0 object-contain"
                            />
                          ) : null}
                          <div className="min-w-0 truncate text-sm font-semibold text-slate-800">
                            {page.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-semibold text-slate-600">
                        {page.titleDisplayType === 'image' ? '해당 없음' : page.isTitleBold ? '사용' : '-'}
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

    </div>
  );
}
