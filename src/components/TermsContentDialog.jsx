import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ModalPortal from './ModalPortal.jsx';

import RichTextContent from './RichTextContent.jsx';

const isScrolledToEnd = (element) =>
  !element || element.scrollHeight <= element.clientHeight + 8 ||
  element.scrollTop + element.clientHeight >= element.scrollHeight - 8;

export default function TermsContentDialog({
  open,
  title,
  terms = [],
  loading = false,
  errorMessage = '',
  onClose,
  onConfirm,
  confirmLabel = '내용 확인',
  agreedConfirmLabel = '동의하고 확인',
  showAgreement = false,
  agreementLabel = '위 약관 내용을 확인했으며 이에 동의합니다.',
  initiallyViewed = false,
  initialAgreementChecked = false,
}) {
  const scrollRef = useRef(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const normalizedTerms = useMemo(
    () => (Array.isArray(terms) ? terms.filter(Boolean) : []),
    [terms]
  );
  const termsKey = normalizedTerms
    .map((term, index) => `${term.id || index}:${term.version || 0}`)
    .join('|');

  useEffect(() => {
    if (!open) return undefined;

    setReachedEnd(Boolean(initiallyViewed));
    setAgreementChecked(Boolean(initialAgreementChecked));

    const timer = window.setTimeout(() => {
      if (initiallyViewed) return;
      setReachedEnd((current) => current || isScrolledToEnd(scrollRef.current));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialAgreementChecked, initiallyViewed, open, termsKey]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const activeConfirmLabel =
    showAgreement && agreementChecked ? agreedConfirmLabel : confirmLabel;
  const contentReady = !loading && !errorMessage && normalizedTerms.length > 0;

  return (
    <ModalPortal className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">{title}</h3>
            <p className="mt-1 text-[11px] text-slate-500">내용을 끝까지 확인한 후 확인 버튼을 누를 수 있습니다.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="닫기">
            <X size={17} />
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={(event) => {
            setReachedEnd((current) =>
              current || isScrolledToEnd(event.currentTarget)
            );
          }}
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-5"
        >
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-xs text-slate-500">
              약관 내용을 불러오는 중입니다.
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5 text-xs leading-5 text-rose-700">
              {errorMessage}
            </div>
          ) : (
            <div className="space-y-5">
              {normalizedTerms.map((term, index) => (
                <section key={`${term.id || index}-${term.version || 0}`} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${term.required ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                      {term.required ? '필수' : '선택'}
                    </span>
                    <h4 className="text-sm font-black text-slate-900">{term.title}</h4>
                  </div>
                  <RichTextContent html={term.contentHtml} text={term.contentText} className="text-sm leading-7 text-slate-700" />
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className={`text-[11px] ${contentReady && reachedEnd ? 'text-emerald-600' : 'text-amber-600'}`}>
              {!contentReady
                ? loading
                  ? '약관 내용을 준비하고 있습니다.'
                  : '약관 내용을 확인할 수 없습니다.'
                : reachedEnd
                  ? '약관 내용을 끝까지 확인했습니다.'
                  : '아래로 스크롤하여 전체 내용을 확인해 주세요.'}
            </div>

            {showAgreement ? (
              <label className={`flex items-center gap-2 text-xs font-bold ${contentReady && reachedEnd ? 'cursor-pointer text-slate-800' : 'cursor-not-allowed text-slate-400'}`}>
                <input
                  type="checkbox"
                  checked={agreementChecked}
                  disabled={!contentReady || !reachedEnd}
                  onChange={(event) => setAgreementChecked(event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-slate-950 disabled:cursor-not-allowed"
                />
                <span>{agreementLabel}</span>
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">취소</button>
            <button
              type="button"
              disabled={!contentReady || !reachedEnd}
              onClick={() => onConfirm?.({ agreed: showAgreement ? agreementChecked : false })}
              className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {activeConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
