const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';
const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
};

export const readRentalRequestWriteMirrorRetirementConfig = ({ env = import.meta.env } = {}) => Object.freeze({
  enabled: bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED),
  apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
});

export const requestRentalRequestWriteMirrorRetirementStatus = async ({
  fetchImpl = fetch,
  config = readRentalRequestWriteMirrorRetirementConfig(),
} = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.enabled, backendApplied: false, transactionSource: '', retiredDomains: [], error: 'api-base-url-missing' });
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return Object.freeze({ requested: config.enabled, backendApplied: false, transactionSource: '', retiredDomains: [], error: payload?.error || `http-${response.status}` });
    return Object.freeze({
      requested: config.enabled,
      backendApplied: Boolean(payload?.compatibility?.rentalRequestWriteMirrorDisabled),
      transactionSource: trim(payload?.compatibility?.rentalTransactionSource),
      retiredDomains: Array.isArray(payload?.compatibility?.retiredWriteMirrorDomains) ? payload.compatibility.retiredWriteMirrorDomains : [],
      error: null,
    });
  } catch (error) {
    return Object.freeze({ requested: config.enabled, backendApplied: false, transactionSource: '', retiredDomains: [], error: error?.code || error?.message || 'status-unavailable' });
  }
};
