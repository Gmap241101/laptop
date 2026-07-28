import { Profiler } from 'react';

const isProfilerEnabled = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('profile') === '1' ||
      window.localStorage.getItem('mk_render_profile') === '1'
    );
  } catch {
    return false;
  }
};

const handleRender = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  console.info('[render-profile]', {
    id,
    phase,
    actualDuration: Number(actualDuration.toFixed(2)),
    baseDuration: Number(baseDuration.toFixed(2)),
    startTime: Number(startTime.toFixed(2)),
    commitTime: Number(commitTime.toFixed(2)),
  });
};

export default function DevRenderProfiler({ id, children }) {
  if (!isProfilerEnabled()) return children;

  return (
    <Profiler id={id} onRender={handleRender}>
      {children}
    </Profiler>
  );
}
