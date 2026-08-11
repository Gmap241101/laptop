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


export const requestAccountLifecycleAuthorityStatus = async ({ fetchImpl = fetch, config = readAccountLifecycleAuthorityConfig() } = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.requested, backendApplied: false, signupSource: '', termsConsentSource: '', passwordResetDelivery: '', error: 'api-base-url-missing' });
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    const backendApplied = Boolean(payload?.compatibility?.accountLifecycleCompatibilityDisabled);
    const signupSource = trim(payload?.compatibility?.signupProfileSource);
    const termsConsentSource = trim(payload?.compatibility?.termsConsentSource);
    const passwordResetDelivery = trim(payload?.compatibility?.passwordResetDelivery);
    return Object.freeze({
      requested: config.requested,
      backendApplied,
      signupSource,
      termsConsentSource,
      passwordResetDelivery,
      error: config.requested && (!backendApplied || signupSource !== 'postgresql' || termsConsentSource !== 'postgresql' || passwordResetDelivery !== 'firebase-auth-compatibility-preserved') ? 'backend-account-lifecycle-authority-not-applied' : null,
    });
  } catch (error) {
    return Object.freeze({ requested: config.requested, backendApplied: false, signupSource: '', termsConsentSource: '', passwordResetDelivery: '', error: error?.code || error?.message || 'status-unavailable' });
  }
};
