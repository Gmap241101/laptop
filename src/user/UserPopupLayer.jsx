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
          <div className="relative border-b border-slate-800 bg-slate-900 px-12 py-4 text-center sm:px-14 sm:py-5">
            <div className="mx-auto min-w-0 max-w-2xl">
              {title && (
                <h2 id={`popup-title-${activePopup.id}`} className="break-words text-xl font-bold leading-7 text-white sm:text-2xl sm:leading-8">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white sm:right-4"
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

        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden border-t border-slate-100 bg-slate-50 px-2.5 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          {hasMultiple && (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => move(-1)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600" aria-label="이전 팝업"><ChevronLeft size={16} /></button>
              <span className="min-w-9 shrink-0 text-center text-[11px] font-bold text-slate-600 sm:min-w-10 sm:text-xs">{activeIndex + 1} / {visibleUserPopups.length}</span>
              <button type="button" onClick={() => move(1)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600" aria-label="다음 팝업"><ChevronRight size={16} /></button>
            </div>
          )}

          <div className="ml-auto flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-slate-600 sm:gap-1.5 sm:text-xs">
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
              className="min-w-0 max-w-[104px] shrink rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-600 outline-none transition focus:border-orange-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:max-w-none sm:shrink-0 sm:px-2.5 sm:text-xs"
              aria-label="팝업 다시 보지 않기 기간"
            >
              <option value="session">현재 탭 동안</option>
              <option value="sevenDays">7일간</option>
            </select>

            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-lg bg-orange-500 px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-orange-600 sm:px-4 sm:text-xs"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
