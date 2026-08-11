const SESSION_KEY = 'mk_account_lifecycle_postgres_authority';
const EVENT_NAME = 'rental:account-lifecycle-authority';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';
const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname.replace(/\/+$/, '')}` : ''; } catch { return ''; }
};

export const readAccountLifecycleAuthorityConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const enabled = staging && bool(env?.VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const requested = enabled && params.get('accountLifecycle') === 'postgres';
  try {
    if (params.get('accountLifecycle') === 'firebase') storage?.removeItem?.(SESSION_KEY);
    else if (requested) storage?.setItem?.(SESSION_KEY, '1');
    return Object.freeze({ enabled, requested: Boolean(enabled && (requested || storage?.getItem?.(SESSION_KEY) === '1')), apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL) });
  } catch {
    return Object.freeze({ enabled, requested, apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL) });
  }
};

let latestObservation = null;
export const publishAccountLifecycleAuthorityObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestAccountLifecycleAuthorityObservation = () => latestObservation;
export const subscribeAccountLifecycleAuthorityObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

export const readAccountLifecycleAuthorityFromPayload = (payload, { requested = true } = {}) => {
  const compatibility = payload?.compatibility || {};
  return Object.freeze({
    requested: Boolean(requested),
    backendApplied: Boolean(compatibility.accountLifecycleCompatibilityDisabled),
    signupSource: trim(compatibility.signupProfileSource),
    termsConsentSource: trim(compatibility.termsConsentSource),
    passwordResetDelivery: trim(compatibility.passwordResetDelivery),
  });
};


export const requestAccountLifecycleAuthorityStatus = async ({
  fetchImpl = fetch,
  config = readAccountLifecycleAuthorityConfig(),
  sleepImpl = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  attempts = 3,
} = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.requested, backendApplied: false, signupSource: '', termsConsentSource: '', passwordResetDelivery: '', error: 'api-base-url-missing' });

  const maxAttempts = Math.max(1, Number(attempts) || 1);
  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const diagnosticUrl = new URL(`${config.apiBaseUrl}/health`);
      diagnosticUrl.searchParams.set('phase32Diagnostic', '1');
      diagnosticUrl.searchParams.set('attempt', String(attempt));
      diagnosticUrl.searchParams.set('_ts', String(Date.now()));
      const response = await fetchImpl(diagnosticUrl.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      const authority = readAccountLifecycleAuthorityFromPayload(payload, { requested: config.requested });
      const applied = response.ok
        && authority.backendApplied
        && authority.signupSource === 'postgresql'
        && authority.termsConsentSource === 'postgresql'
        && authority.passwordResetDelivery === 'firebase-auth-compatibility-preserved';
      lastResult = Object.freeze({
        ...authority,
        error: config.requested && !applied ? 'backend-account-lifecycle-authority-not-applied' : null,
      });
      if (!config.requested || applied) return lastResult;
    } catch (error) {
      lastError = error;
      lastResult = Object.freeze({ requested: config.requested, backendApplied: false, signupSource: '', termsConsentSource: '', passwordResetDelivery: '', error: error?.code || error?.message || 'status-unavailable' });
    }

    if (attempt < maxAttempts) await sleepImpl(attempt === 1 ? 250 : 750);
  }

  if (lastResult) return lastResult;
  return Object.freeze({ requested: config.requested, backendApplied: false, signupSource: '', termsConsentSource: '', passwordResetDelivery: '', error: lastError?.code || lastError?.message || 'status-unavailable' });
};
