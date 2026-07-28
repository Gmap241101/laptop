import { Profiler } from 'react';

const PROFILE_STORAGE_KEY = 'mk_render_profile';
const PROFILE_LOG_STORAGE_KEY = 'mk_render_profile_log';
const PROFILE_EVENT_NAME = 'mk-render-profile-update';
const MAX_PROFILE_EVENTS = 5000;

const roundMetric = (value) => Number(Number(value || 0).toFixed(2));

const readSearchFlag = (name) => {
  if (typeof window === 'undefined') return false;

  try {
    return new URLSearchParams(window.location.search).get(name) === '1';
  } catch {
    return false;
  }
};

const readStorageFlag = (name) => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(name) === '1';
  } catch {
    return false;
  }
};

export const isRenderProfilerEnabled = () =>
  Boolean(
    import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      (readSearchFlag('profile') || readStorageFlag(PROFILE_STORAGE_KEY))
  );

const shouldLogEveryCommit = () =>
  readSearchFlag('profileLog') || readStorageFlag(PROFILE_LOG_STORAGE_KEY);

const createEmptyStore = () => ({
  startedAt: new Date().toISOString(),
  nextSequence: 1,
  events: [],
  summaries: {},
});

const getProfilerStore = () => {
  if (typeof window === 'undefined') return createEmptyStore();

  if (!window.__mkRenderProfilerStore) {
    window.__mkRenderProfilerStore = createEmptyStore();
  }

  return window.__mkRenderProfilerStore;
};

const cloneSnapshot = (store = getProfilerStore()) => ({
  generatedAt: new Date().toISOString(),
  startedAt: store.startedAt,
  location:
    typeof window === 'undefined'
      ? ''
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  userAgent:
    typeof navigator === 'undefined' ? '' : navigator.userAgent,
  eventCount: store.events.length,
  summaries: Object.values(store.summaries)
    .map((summary) => ({ ...summary }))
    .sort((first, second) => second.totalActualDuration - first.totalActualDuration),
  events: store.events.map((event) => ({ ...event })),
});

export const getRenderProfilerSnapshot = () => cloneSnapshot();

export const clearRenderProfiler = () => {
  if (typeof window === 'undefined') return;

  window.__mkRenderProfilerStore = createEmptyStore();
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT_NAME));
};

export const downloadRenderProfilerReport = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const snapshot = getRenderProfilerSnapshot();
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replace(/\..+$/, '');
  const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `render-profile-${timestamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const subscribeRenderProfiler = (listener) => {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(PROFILE_EVENT_NAME, listener);
  return () => window.removeEventListener(PROFILE_EVENT_NAME, listener);
};

const exposeProfilerApi = () => {
  if (typeof window === 'undefined' || window.__mkRenderProfiler) return;

  window.__mkRenderProfiler = Object.freeze({
    clear: clearRenderProfiler,
    download: downloadRenderProfilerReport,
    snapshot: getRenderProfilerSnapshot,
  });
};

const recordRender = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  const store = getProfilerStore();
  const event = {
    sequence: store.nextSequence,
    recordedAt: new Date().toISOString(),
    route:
      typeof window === 'undefined'
        ? ''
        : `${window.location.pathname}${window.location.search}${window.location.hash}`,
    id,
    phase,
    actualDuration: roundMetric(actualDuration),
    baseDuration: roundMetric(baseDuration),
    startTime: roundMetric(startTime),
    commitTime: roundMetric(commitTime),
  };

  store.nextSequence += 1;
  store.events.push(event);
  if (store.events.length > MAX_PROFILE_EVENTS) {
    store.events.splice(0, store.events.length - MAX_PROFILE_EVENTS);
  }

  const previous = store.summaries[id] || {
    id,
    commitCount: 0,
    mountCount: 0,
    updateCount: 0,
    totalActualDuration: 0,
    totalBaseDuration: 0,
    maxActualDuration: 0,
    averageActualDuration: 0,
    lastActualDuration: 0,
    lastBaseDuration: 0,
    lastPhase: '',
    lastRoute: '',
    lastRecordedAt: '',
  };
  const commitCount = previous.commitCount + 1;
  const totalActualDuration = previous.totalActualDuration + event.actualDuration;
  const totalBaseDuration = previous.totalBaseDuration + event.baseDuration;

  store.summaries[id] = {
    ...previous,
    commitCount,
    mountCount: previous.mountCount + (phase === 'mount' ? 1 : 0),
    updateCount: previous.updateCount + (phase === 'mount' ? 0 : 1),
    totalActualDuration: roundMetric(totalActualDuration),
    totalBaseDuration: roundMetric(totalBaseDuration),
    maxActualDuration: roundMetric(
      Math.max(previous.maxActualDuration, event.actualDuration)
    ),
    averageActualDuration: roundMetric(totalActualDuration / commitCount),
    lastActualDuration: event.actualDuration,
    lastBaseDuration: event.baseDuration,
    lastPhase: phase,
    lastRoute: event.route,
    lastRecordedAt: event.recordedAt,
  };

  exposeProfilerApi();

  if (shouldLogEveryCommit()) {
    console.info('[render-profile]', event);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PROFILE_EVENT_NAME, {
        detail: {
          id,
          summary: { ...store.summaries[id] },
        },
      })
    );
  }
};

export default function DevRenderProfiler({ id, children }) {
  if (!isRenderProfilerEnabled()) return children;

  exposeProfilerApi();

  return (
    <Profiler id={id} onRender={recordRender}>
      {children}
    </Profiler>
  );
}
