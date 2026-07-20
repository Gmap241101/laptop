import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { isRichTextEmpty, legacyTextToRichHtml, RichTextContent } from '../components/RichTextEditor.jsx';

export default function UserPopupLayer({ ctx }) {
  const {
    dismissUserPopup,
    visibleUserPopups,
  } = ctx;

  const [activePopupId, setActivePopupId] = useState('');
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [dismissDuration, setDismissDuration] = useState('session');

  useEffect(() => {
    if (!visibleUserPopups.length) {
      setActivePopupId('');
      return;
    }

    if (!visibleUserPopups.some((popup) => popup.id === activePopupId)) {
      setActivePopupId(visibleUserPopups[0].id);
    }
  }, [activePopupId, visibleUserPopups]);

  const activeIndex = useMemo(
    () => Math.max(0, visibleUserPopups.findIndex((popup) => popup.id === activePopupId)),
    [activePopupId, visibleUserPopups]
  );

  const activePopup = visibleUserPopups[activeIndex] || null;

  useEffect(() => {
    setDoNotShowAgain(false);
    setDismissDuration('session');
  }, [activePopup]);

  const handleClose = () => {
    if (!activePopup) return;

    dismissUserPopup(
      activePopup,
      doNotShowAgain ? dismissDuration : 'temporary'
    );
  };

  useEffect(() => {
    if (!activePopup) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePopup, dismissDuration, doNotShowAgain]);

  if (!activePopup) return null;

  const title = String(activePopup.title || '').trim();
  const subtitle = String(activePopup.subtitle || '').trim();
  const hasHeader = Boolean(title || subtitle);
  const hasMultiple = visibleUserPopups.length > 1;
  const popupContentHtml = String(activePopup.contentHtml || '').trim()
    ? activePopup.contentHtml
    : legacyTextToRichHtml(activePopup.contentText || activePopup.content || '');
  const hasContent = !isRichTextEmpty(popupContentHtml);

  const move = (direction) => {
    const nextIndex = (activeIndex + direction + visibleUserPopups.length) % visibleUserPopups.length;
    setActivePopupId(visibleUserPopups[nextIndex].id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-3 py-5 backdrop-blur-sm sm:px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `popup-title-${activePopup.id}` : undefined}
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {hasHeader ? (
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-900 px-5 py-5 sm:px-6">
            <div className="min-w-0">
              {title && (
                <h2 id={`popup-title-${activePopup.id}`} className="break-words text-lg font-bold text-white sm:text-xl">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className={`${title ? 'mt-1.5' : ''} break-words text-sm leading-6 text-slate-300`}>
                  {subtitle}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="팝업 닫기"
            >
              <X size={20} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-3 top-3 z-10 rounded-full bg-slate-950/70 p-2 text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-950"
            aria-label="팝업 닫기"
          >
            <X size={20} />
          </button>
        )}

        {hasContent && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <RichTextContent
              html={popupContentHtml}
              text={activePopup.contentText || activePopup.content}
              className="text-sm leading-7 text-slate-700"
            />
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          {hasMultiple && (
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <button type="button" onClick={() => move(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600" aria-label="이전 팝업"><ChevronLeft size={17} /></button>
              <span className="min-w-16 text-center text-xs font-bold text-slate-600">{activeIndex + 1} / {visibleUserPopups.length}</span>
              <button type="button" onClick={() => move(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600" aria-label="다음 팝업"><ChevronRight size={17} /></button>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={doNotShowAgain}
                  onChange={(event) => setDoNotShowAgain(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                />
                다시 보지 않기
              </label>

              <select
                value={dismissDuration}
                onChange={(event) => setDismissDuration(event.target.value)}
                disabled={!doNotShowAgain}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none transition focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                aria-label="팝업 다시 보지 않기 기간"
              >
                <option value="session">현재 탭 동안</option>
                <option value="sevenDays">7일간</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600"
            >
              닫기
            </button>
          </div>

          <div className="text-[11px] leading-5 text-slate-400">
            체크한 경우에만 선택한 기간 동안 이 팝업이 다시 표시되지 않습니다.
          </div>
        </div>
      </div>
    </div>
  );
}
