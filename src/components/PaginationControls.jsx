import { useEffect, useRef, useState } from 'react';

import { Button } from './CommonUI.jsx';

const clampPage = (value, totalPages) => {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), Math.max(1, Number(totalPages) || 1));
};

export default function PaginationControls({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  disabled = false,
  previousDisabled = false,
  nextDisabled = false,
  disablePageJump = false,
  className = '',
  buttonClassName = 'px-3 py-2 text-xs',
  indicatorClassName = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600',
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1);
  const safeCurrentPage = clampPage(currentPage, safeTotalPages);
  const [isOpen, setIsOpen] = useState(false);
  const [draftPage, setDraftPage] = useState(String(safeCurrentPage));
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraftPage(String(safeCurrentPage));
  }, [safeCurrentPage]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen]);

  const commitPage = (targetPage) => {
    const nextPage = clampPage(targetPage, safeTotalPages);
    if (typeof onPageChange === 'function' && nextPage !== safeCurrentPage) {
      onPageChange(nextPage);
    }
    setDraftPage(String(nextPage));
    setIsOpen(false);
  };

  const openJumpPanel = () => {
    if (disabled || disablePageJump || safeTotalPages <= 1) return;
    setDraftPage(String(safeCurrentPage));
    setIsOpen((prev) => !prev);
  };

  return (
    <div ref={containerRef} className={`relative flex items-center justify-center gap-2 ${className}`}>
      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        disabled={disabled || previousDisabled || safeCurrentPage <= 1}
        onClick={() => commitPage(safeCurrentPage - 1)}
      >
        이전
      </Button>

      <button
        type="button"
        className={`${indicatorClassName} transition ${disabled || disablePageJump || safeTotalPages <= 1 ? 'cursor-default' : 'hover:border-orange-300 hover:text-orange-600'}`}
        disabled={disabled || disablePageJump || safeTotalPages <= 1}
        onClick={openJumpPanel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`현재 ${safeCurrentPage}페이지, 전체 ${safeTotalPages}페이지. 페이지 이동 열기`}
        title={safeTotalPages > 1 ? '클릭하여 원하는 페이지로 이동' : undefined}
      >
        {safeCurrentPage} / {safeTotalPages}
      </button>

      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        disabled={disabled || nextDisabled || safeCurrentPage >= safeTotalPages}
        onClick={() => commitPage(safeCurrentPage + 1)}
      >
        다음
      </Button>

      {isOpen ? (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="text-sm font-bold text-slate-900">페이지 이동</div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            현재 디자인은 유지하고, 원하는 페이지 번호를 직접 입력해 바로 이동할 수 있도록 개선했습니다.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={safeTotalPages}
              value={draftPage}
              onChange={(event) => setDraftPage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitPage(draftPage);
                }
              }}
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition mk-form-focus"
            />
            <Button type="button" className="px-3 py-2 text-xs" onClick={() => commitPage(draftPage)}>
              이동
            </Button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">1 ~ {safeTotalPages}페이지</div>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="flex-1 px-3 py-2 text-xs" onClick={() => commitPage(1)}>
              처음
            </Button>
            <Button type="button" variant="outline" className="flex-1 px-3 py-2 text-xs" onClick={() => commitPage(safeTotalPages)}>
              마지막
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
