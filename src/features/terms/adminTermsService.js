import { readPolicyContentCutoverConfig } from '../content/policyContentCutover.js';

const ADMIN_SIGNUP_TERMS_CATALOG_CACHE_TTL_MS = 60_000;
let adminSignupTermsCatalogCache = null;
let adminSignupTermsCatalogPending = null;
const adminSignupTermContentCache = new Map();
const adminSignupTermContentPending = new Map();

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const getClerkToken = async ({ forceRefresh = false } = {}) => {
  const { clerkStagingClient } = await import('../../clerk/clerkStagingClient.js');
  const clerk = await clerkStagingClient.initialize();
  const token = await clerk?.session?.getToken?.(forceRefresh ? { skipCache: true } : undefined);
  if (!token) {
    throw Object.assign(new Error('Clerk administrator session is required for signup terms catalog access.'), {
      code: 'signup_terms_admin_clerk_session_missing',
    });
  }
  return token;
};

const requestAdminSignupTermsCatalog = async ({ fetchImpl = fetch, forceRefresh = false } = {}) => {
  const config = readPolicyContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.adminAuthorityRequested || !apiBaseUrl) {
    throw Object.assign(new Error('Signup terms administrator PostgreSQL authority is unavailable.'), {
      code: 'signup_terms_admin_authority_unavailable',
    });
  }

  const performRequest = async (refreshToken = false) => {
    const token = await getClerkToken({ forceRefresh: refreshToken });
    const response = await fetchImpl(`${apiBaseUrl}/api/admin/signup-terms/catalog`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    return { response, payload };
  };

  let result = await performRequest(forceRefresh);
  if (!forceRefresh && result.response.status === 401 && result.payload?.error === 'unauthorized') {
    result = await performRequest(true);
  }
  if (!result.response.ok) {
    const error = new Error(`Signup terms administrator catalog read failed with HTTP ${result.response.status}.`);
    error.status = result.response.status;
    error.code = result.payload?.error || 'signup_terms_admin_catalog_read_failed';
    throw error;
  }

  const catalog = result.payload?.signupTermsCatalog;
  if (
    !result.payload?.authenticated ||
    !result.payload?.authorized ||
    catalog?.source !== 'postgresql' ||
    !Array.isArray(catalog?.terms)
  ) {
    throw Object.assign(new Error('Backend returned an invalid signup terms administrator catalog.'), {
      code: 'signup_terms_admin_catalog_payload_invalid',
    });
  }
  return Object.freeze({
    source: 'postgresql',
    policy: catalog.policy && typeof catalog.policy === 'object' ? catalog.policy : {},
    terms: catalog.terms,
  });
};


const createAdminSignupTermContentCacheKey = (termValue = {}) => [
  String(termValue?.id || '').trim(),
  Math.max(1, Number(termValue?.currentVersion || termValue?.version) || 1),
  String(termValue?.currentVersionId || termValue?.versionId || '').trim(),
  String(termValue?.contentHash || '').trim(),
  termValue?.enabled === false ? 'disabled' : 'enabled',
  termValue?.archived === true ? 'archived' : 'active',
  Number.isFinite(Number(termValue?.displayOrder)) ? String(Number(termValue.displayOrder)) : '0',
].join(':');

const requestAdminSignupTermContent = async (termValue, { fetchImpl = fetch } = {}) => {
  const termId = String(termValue?.id || '').trim();
  if (!termId) throw Object.assign(new Error('Signup term ID is required.'), { code: 'signup_term_id_missing' });
  const config = readPolicyContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.adminAuthorityRequested || !apiBaseUrl) {
    throw Object.assign(new Error('Signup terms administrator PostgreSQL authority is unavailable.'), { code: 'signup_terms_admin_authority_unavailable' });
  }
  const performRequest = async (forceRefresh = false) => {
    const token = await getClerkToken({ forceRefresh });
    const response = await fetchImpl(`${apiBaseUrl}/api/admin/signup-terms/${encodeURIComponent(termId)}/content`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    return { response, payload };
  };
  let result = await performRequest(false);
  if (result.response.status === 401 && result.payload?.error === 'unauthorized') result = await performRequest(true);
  if (!result.response.ok) {
    const error = new Error(`Signup terms administrator content read failed with HTTP ${result.response.status}.`);
    error.status = result.response.status;
    error.code = result.payload?.error || 'signup_terms_admin_content_read_failed';
    throw error;
  }
  const remoteTerm = result.payload?.signupTermContent?.term;
  if (
    !result.payload?.authenticated ||
    !result.payload?.authorized ||
    result.payload?.signupTermContent?.source !== 'postgresql' ||
    String(remoteTerm?.id || '').trim() !== termId
  ) {
    throw Object.assign(new Error('Backend returned an invalid signup terms administrator content payload.'), {
      code: 'signup_terms_admin_content_payload_invalid',
    });
  }
  return Object.freeze({ ...remoteTerm });
};

export const preloadAdminSignupTermContent = async (termValue, { force = false } = {}) => {
  const key = createAdminSignupTermContentCacheKey(termValue);
  if (!String(termValue?.id || '').trim()) throw Object.assign(new Error('Signup term ID is required.'), { code: 'signup_term_id_missing' });
  const cached = force ? null : adminSignupTermContentCache.get(key);
  if (cached) return cached;
  if (!force && adminSignupTermContentPending.has(key)) return adminSignupTermContentPending.get(key);
  const pending = requestAdminSignupTermContent(termValue)
    .then((term) => {
      adminSignupTermContentCache.set(key, term);
      return term;
    })
    .finally(() => adminSignupTermContentPending.delete(key));
  adminSignupTermContentPending.set(key, pending);
  return pending;
};

export const getCachedAdminSignupTermsCatalog = () => {
  if (!adminSignupTermsCatalogCache) return null;
  if (Date.now() >= adminSignupTermsCatalogCache.expiresAt) {
    adminSignupTermsCatalogCache = null;
    return null;
  }
  return adminSignupTermsCatalogCache.catalog;
};

export const primeAdminSignupTermsCatalog = (catalogValue) => {
  const catalog = Object.freeze({
    source: 'postgresql',
    policy: catalogValue?.policy && typeof catalogValue.policy === 'object' ? catalogValue.policy : {},
    terms: Array.isArray(catalogValue?.terms) ? catalogValue.terms : [],
  });
  adminSignupTermsCatalogCache = {
    catalog,
    expiresAt: Date.now() + ADMIN_SIGNUP_TERMS_CATALOG_CACHE_TTL_MS,
  };
  return catalog;
};

export const invalidateAdminSignupTermsCatalog = () => {
  adminSignupTermsCatalogCache = null;
};

export const preloadAdminSignupTermsCatalog = async ({ force = false } = {}) => {
  const cached = force ? null : getCachedAdminSignupTermsCatalog();
  if (cached) return cached;
  if (!force && adminSignupTermsCatalogPending) return adminSignupTermsCatalogPending;

  adminSignupTermsCatalogPending = requestAdminSignupTermsCatalog({ forceRefresh: force })
    .then((catalog) => primeAdminSignupTermsCatalog(catalog))
    .finally(() => {
      adminSignupTermsCatalogPending = null;
    });
  return adminSignupTermsCatalogPending;
};
