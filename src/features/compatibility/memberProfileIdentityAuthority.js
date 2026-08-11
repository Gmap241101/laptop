const trim = (value) => typeof value === 'string' ? value.trim() : String(value ?? '').trim();
const bool = (value) => trim(value).toLowerCase() === 'true';
const SESSION_KEY = 'mk_member_profile_identity_authority';
const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? `${url.origin}${url.pathname.replace(/\/+$/, '')}` : ''; } catch { return ''; }
};

export const readMemberProfileIdentityAuthorityConfig = ({ env = import.meta.env, location = globalThis.location, storage = globalThis.sessionStorage } = {}) => {
  const enabled = bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryValue = params.get('memberProfileAuthority');
  let requested = enabled && queryValue !== 'firestore';
  try {
    if (enabled && queryValue === 'postgres') storage?.setItem?.(SESSION_KEY, '1');
    if (queryValue === 'firestore') storage?.removeItem?.(SESSION_KEY);
    requested = enabled && queryValue !== 'firestore';
  } catch { requested = enabled && queryValue !== 'firestore'; }
  return Object.freeze({ enabled, requested, apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL) });
};

export const requestMemberProfileIdentityAuthorityStatus = async ({ fetchImpl = fetch, config = readMemberProfileIdentityAuthorityConfig() } = {}) => {
  if (!config.apiBaseUrl) return Object.freeze({ requested: config.requested, backendApplied: false, source: '', identitySource: '', retiredDomains: [], error: 'api-base-url-missing' });
  try {
    const response = await fetchImpl(`${config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    const backendApplied = Boolean(payload?.compatibility?.memberProfileWriteMirrorDisabled);
    const source = trim(payload?.compatibility?.memberProfileSource);
    const identitySource = trim(payload?.compatibility?.memberIdentitySource);
    return Object.freeze({
      requested: config.requested,
      backendApplied,
      source,
      identitySource,
      retiredDomains: Array.isArray(payload?.compatibility?.retiredWriteMirrorDomains) ? payload.compatibility.retiredWriteMirrorDomains : [],
      error: config.requested && (!backendApplied || source !== 'postgresql' || identitySource !== 'postgresql') ? 'backend-member-profile-authority-not-applied' : null,
    });
  } catch (error) {
    return Object.freeze({ requested: config.requested, backendApplied: false, source: '', identitySource: '', retiredDomains: [], error: error?.code || error?.message || 'status-unavailable' });
  }
};
