import { useEffect, useMemo, useState } from 'react';
import {
  clearRenderProfiler,
  downloadRenderProfilerReport,
  getRenderProfilerSnapshot,
  isRenderProfilerEnabled,
  subscribeRenderProfiler,
} from './DevRenderProfiler.jsx';

const formatDuration = (value) => `${Number(value || 0).toFixed(1)}ms`;

const isPanelEnabled = () => {
  if (!isRenderProfilerEnabled() || typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('profilePanel') === '1' ||
      window.localStorage.getItem('mk_render_profile_panel') === '1'
    );
  } catch {
    return false;
  }
};

export default function DevPerformancePanel() {
  const enabled = isPanelEnabled();
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState(() => getRenderProfilerSnapshot());

  useEffect(() => {
    if (!enabled) return undefined;

    let frameId = 0;
    const updateSnapshot = () => {
      if (frameId) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setSnapshot(getRenderProfilerSnapshot());
      });
    };

    const unsubscribe = subscribeRenderProfiler(updateSnapshot);
    updateSnapshot();

    return () => {
      unsubscribe();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [enabled]);

  const visibleSummaries = useMemo(
    () => snapshot.summaries.slice(0, 12),
    [snapshot.summaries]
  );

  if (!enabled) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-[100] w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-xs font-black tracking-wide">REACT RENDER PROFILE</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {snapshot.eventCount} commits · {snapshot.summaries.length} scopes
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={downloadRenderProfilerReport}
            className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-bold hover:bg-slate-800"
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => {
              clearRenderProfiler();
              setSnapshot(getRenderProfilerSnapshot());
            }}
            className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-bold hover:bg-slate-800"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-bold hover:bg-slate-800"
          >
            {expanded ? '접기' : '열기'}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="max-h-[55vh] overflow-auto border-t border-slate-800 px-3 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_54px_68px_68px] gap-2 px-2 pb-2 text-[10px] font-bold text-slate-500">
            <span>범위</span>
            <span className="text-right">횟수</span>
            <span className="text-right">평균</span>
            <span className="text-right">최대</span>
          </div>

          <div className="space-y-1">
            {visibleSummaries.length ? (
              visibleSummaries.map((summary) => (
                <div
                  key={summary.id}
                  className="grid grid-cols-[minmax(0,1fr)_54px_68px_68px] gap-2 rounded-lg bg-slate-900 px-2 py-2 text-[11px]"
                >
                  <span className="truncate font-semibold" title={summary.id}>
                    {summary.id}
                  </span>
                  <span className="text-right tabular-nums text-slate-300">
                    {summary.commitCount}
                  </span>
                  <span className="text-right tabular-nums text-slate-300">
                    {formatDuration(summary.averageActualDuration)}
                  </span>
                  <span className="text-right tabular-nums text-slate-300">
                    {formatDuration(summary.maxActualDuration)}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-slate-900 px-3 py-5 text-center text-[11px] text-slate-500">
                측정된 렌더링이 없습니다.
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            총 실제 렌더링 시간이 큰 범위부터 표시합니다. 전체 이벤트와 경로별 수치는 JSON 보고서에서 확인합니다.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
