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

export const readMemberStatusRestrictionWriteMirrorRetirementConfig = ({ env = import.meta.env } = {}) => Object.freeze({
  enabled: bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED),
  apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
});

export const requestMemberStatusRestrictionWriteMirrorRetirementStatus = async ({
  fetchImpl = fetch,
  config = readMemberStatusRestrictionWriteMirrorRetirementConfig(),
} = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.enabled, backendApplied: false, source: '', retiredDomains: [], error: 'api-base-url-missing' });
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return Object.freeze({ requested: config.enabled, backendApplied: false, source: '', retiredDomains: [], error: payload?.error || `http-${response.status}` });
    const backendApplied = Boolean(payload?.compatibility?.memberStatusRestrictionWriteMirrorDisabled);
    const source = trim(payload?.compatibility?.memberStatusSource);
    return Object.freeze({
      requested: config.enabled,
      backendApplied,
      source,
      retiredDomains: Array.isArray(payload?.compatibility?.retiredWriteMirrorDomains) ? payload.compatibility.retiredWriteMirrorDomains : [],
      error: config.enabled && (!backendApplied || source !== 'postgresql') ? 'backend-member-status-retirement-not-applied' : null,
    });
  } catch (error) {
    return Object.freeze({ requested: config.enabled, backendApplied: false, source: '', retiredDomains: [], error: error?.code || error?.message || 'status-unavailable' });
  }
};
