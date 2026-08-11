const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readFirestoreWriteMirrorRetirementConfig = ({ env = import.meta.env } = {}) => Object.freeze({
  enabled: bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED),
  apiBaseUrl: trim(env?.VITE_API_URL).replace(/\/+$/, ''),
  retiredDomains: Object.freeze(['assets', 'notice', 'faq']),
});

export const requestFirestoreWriteMirrorRetirementStatus = async ({
  config = readFirestoreWriteMirrorRetirementConfig(),
  fetchImpl = fetch,
} = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.enabled, backendApplied: false, retiredDomains: [], error: 'api-url-missing' });
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return Object.freeze({ requested: config.enabled, backendApplied: false, retiredDomains: [], error: payload?.error || `http-${response.status}` });
    return Object.freeze({
      requested: config.enabled,
      backendApplied: Boolean(payload?.compatibility?.assetBoardWriteMirrorDisabled),
      retiredDomains: Array.isArray(payload?.compatibility?.retiredWriteMirrorDomains) ? payload.compatibility.retiredWriteMirrorDomains : [],
      error: null,
    });
  } catch (error) {
    return Object.freeze({ requested: config.enabled, backendApplied: false, retiredDomains: [], error: error?.code || error?.message || 'status-unavailable' });
  }
};
