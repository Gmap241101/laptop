const SHEETJS_SCRIPT_ID = 'mk-sheetjs-runtime';
const SHEETJS_SCRIPT_URL =
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const SHEETJS_LOAD_TIMEOUT_MS = 20_000;

let sheetJsLoadPromise = null;

const hasRequiredSheetJsApi = (candidate) =>
  Boolean(
    candidate &&
      typeof candidate.read === 'function' &&
      candidate.utils &&
      typeof candidate.utils.sheet_to_json === 'function'
  );

const getLoadedSheetJs = () => {
  if (typeof window === 'undefined') return null;
  return hasRequiredSheetJsApi(window.XLSX) ? window.XLSX : null;
};

const removeScriptIfFailed = (script) => {
  if (
    script &&
    script.parentNode &&
    !getLoadedSheetJs()
  ) {
    script.parentNode.removeChild(script);
  }
};

export const loadSheetJs = () => {
  const loadedSheetJs = getLoadedSheetJs();
  if (loadedSheetJs) {
    return Promise.resolve(loadedSheetJs);
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('sheetjs-browser-environment-required')
    );
  }

  if (sheetJsLoadPromise) {
    return sheetJsLoadPromise;
  }

  sheetJsLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;

    const existingScript =
      document.getElementById(SHEETJS_SCRIPT_ID) ||
      document.querySelector(`script[src="${SHEETJS_SCRIPT_URL}"]`);

    const script = existingScript || document.createElement('script');

    const cleanupListeners = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };

    const settleWithError = (error) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      removeScriptIfFailed(script);
      sheetJsLoadPromise = null;
      reject(error);
    };

    function handleLoad() {
      const nextSheetJs = getLoadedSheetJs();

      if (!nextSheetJs) {
        settleWithError(
          new Error('sheetjs-api-unavailable-after-load')
        );
        return;
      }

      if (settled) return;
      settled = true;
      cleanupListeners();
      resolve(nextSheetJs);
    }

    function handleError() {
      settleWithError(new Error('sheetjs-script-load-failed'));
    }

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    timeoutId = window.setTimeout(() => {
      settleWithError(new Error('sheetjs-script-load-timeout'));
    }, SHEETJS_LOAD_TIMEOUT_MS);

    if (!existingScript) {
      script.id = SHEETJS_SCRIPT_ID;
      script.src = SHEETJS_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      document.head.appendChild(script);
      return;
    }

    const sheetJsLoadedAfterListenerRegistration = getLoadedSheetJs();
    if (sheetJsLoadedAfterListenerRegistration) {
      handleLoad();
    }
  });

  return sheetJsLoadPromise;
};

export const isSheetJsLoaded = () => Boolean(getLoadedSheetJs());

export const getSheetJsLoadErrorMessage = (error) => {
  const errorCode = String(error?.message || '');

  if (errorCode === 'sheetjs-script-load-timeout') {
    return '엑셀 처리 도구를 불러오는 시간이 초과되었습니다. 네트워크 연결을 확인한 후 다시 시도해 주세요.';
  }

  return '엑셀 처리 도구를 불러오지 못했습니다. 네트워크 연결 또는 외부 스크립트 차단 설정을 확인해 주세요.';
};

export const SHEETJS_RUNTIME_URL = SHEETJS_SCRIPT_URL;
