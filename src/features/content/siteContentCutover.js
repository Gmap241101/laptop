import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';

const EVENT_NAME = 'rental:site-content-cutover';
const INVALIDATION_EVENT_NAME = 'rental:site-content-invalidated';
const INVALIDATION_STORAGE_KEY = 'mk_site_content_invalidated_v2';
const domainCache = new Map();
const DOMAIN_CACHE_TTL_MS = 5_000;
export const PHASE33_PUBLIC_CONTENT_VISIBILITY_REVISION = 'phase33-public-content-visibility-hotfix-20260812-0105';
export const PHASE33_PUBLIC_CONTENT_SYNC_REVISION = 'phase33-public-content-full-server-sync-hotfix-20260812-0117';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';
const randomId = () => globalThis.crypto?.randomUUID?.() || `content-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeApiBaseUrl = (value) => {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return '';
  }
};

export const SITE_CONTENT_DOMAINS = Object.freeze({
  SITE_SETTINGS: 'site-settings',
  HOME: 'home',
  POPUP: 'popup',
  FOOTER: 'footer',
});

export const readSiteContentCutoverConfig = ({ env = import.meta.env } = {}) => {
  const apiBaseUrl = normalizeApiBaseUrl(env?.VITE_API_URL);
  const authorityEnabled = Boolean(apiBaseUrl);
  return Object.freeze({
    authorityEnabled,
    authorityRequested: authorityEnabled,
    adminAuthorityEnabled: authorityEnabled,
    adminAuthorityRequested: authorityEnabled,
    fallbackAllowed: false,
    readEnabled: authorityEnabled,
    writeThroughEnabled: authorityEnabled,
    readRequested: authorityEnabled,
    writeThroughRequested: authorityEnabled,
    apiBaseUrl,
  });
};

let latestObservation = null;
export const publishSiteContentObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestSiteContentObservation = () => latestObservation;
export const subscribeSiteContentObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

export const createSiteContentDocumentId = () => randomId();

export const createSiteContentDomainDocument = (document = {}) => {
  const key = trim(document?.key);
  const payload = document?.payload && typeof document.payload === 'object'
    ? document.payload
    : {};
  const enabled = typeof document?.enabled === 'boolean'
    ? document.enabled
    : (typeof payload?.enabled === 'boolean' ? payload.enabled : null);
  const sortOrder = Number.isFinite(Number(document?.sortOrder))
    ? Math.trunc(Number(document.sortOrder))
    : (Number.isFinite(Number(payload?.sortOrder)) ? Math.trunc(Number(payload.sortOrder)) : null);
  const sourceUpdatedAt = document?.sourceUpdatedAt || null;
  return Object.freeze({ key, payload, enabled, sortOrder, sourceUpdatedAt });
};

const invalidateDomainCache = (domain = 'all') => {
  if (domain === 'all') domainCache.clear();
  else domainCache.delete(domain);
};

export const publishSiteContentInvalidation = (domain = 'all') => {
  const detail = Object.freeze({ domain: trim(domain) || 'all', invalidatedAt: new Date().toISOString() });
  invalidateDomainCache(detail.domain);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INVALIDATION_EVENT_NAME, { detail }));
    try {
      window.localStorage?.setItem?.(INVALIDATION_STORAGE_KEY, JSON.stringify(detail));
    } catch { /* storage can be unavailable in privacy modes */ }
  }
  return detail;
};

export const subscribeSiteContentInvalidation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const onLocal = (event) => listener(event.detail || { domain: 'all' });
  const onStorage = (event) => {
    if (event.key !== INVALIDATION_STORAGE_KEY || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue);
      invalidateDomainCache(detail?.domain || 'all');
      listener(detail || { domain: 'all' });
    } catch { /* ignore malformed external storage */ }
  };
  window.addEventListener(INVALIDATION_EVENT_NAME, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(INVALIDATION_EVENT_NAME, onLocal);
    window.removeEventListener('storage', onStorage);
  };
};

export const requestSiteContentDomain = async ({ domain, fetchImpl = fetch, config = readSiteContentCutoverConfig(), useCache = true, observationPublisher = publishSiteContentObservation } = {}) => {
  if (!config.readRequested) return null;
  if (!config.apiBaseUrl) throw Object.assign(new Error('VITE_API_URL is required for Phase 24 site content read cutover.'), { code: 'site_content_api_missing' });
  const nowMillis = Date.now();
  const cached = useCache ? domainCache.get(domain) : null;
  if (cached?.promise && cached.expiresAt > nowMillis) return cached.promise;
  if (cached) domainCache.delete(domain);
  const promise = (async () => {
    const response = await fetchImpl(`${config.apiBaseUrl}/api/site-content/${encodeURIComponent(domain)}`, {
      method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      const error = new Error(`PostgreSQL site content read failed with HTTP ${response.status}.`);
      error.status = response.status;
      error.code = payload?.error || 'site_content_read_failed';
      throw error;
    }
    const content = payload?.siteContent;
    if (content?.source !== 'postgresql' || !Array.isArray(content?.documents)) {
      throw Object.assign(new Error('Backend returned an invalid Phase 24 site content payload.'), { code: 'site_content_payload_invalid' });
    }
    const result = Object.freeze({
      ...content,
      documents: content.documents.map((item) => Object.freeze({
        ...item,
        payload: item?.payload && typeof item.payload === 'object' ? item.payload : {},
        publicVisibility: item?.publicVisibility && typeof item.publicVisibility === 'object'
          ? Object.freeze({ ...item.publicVisibility })
          : null,
      })),
    });
    observationPublisher?.({ readRequested: true, domain, readSource: 'postgresql', documentCount: result.documents.length, syncAt: result.syncedAt || null, error: null });
    return result;
  })();
  if (useCache) domainCache.set(domain, { promise, expiresAt: nowMillis + DOMAIN_CACHE_TTL_MS });
  try { return await promise; }
  catch (error) { if (useCache) domainCache.delete(domain); observationPublisher?.({ readRequested: true, domain, readSource: 'postgresql-error', error: error?.code || 'site_content_read_failed' }); throw error; }
};

const getClerkToken = async ({ forceRefresh = false } = {}) => {
  const clerk = await clerkStagingClient.initialize();
  const token = await clerk?.session?.getToken?.(forceRefresh ? { skipCache: true } : undefined);
  if (!token) throw Object.assign(new Error('Clerk administrator session is required for site content write-through.'), { code: 'site_content_clerk_session_missing' });
  return token;
};

export const replaceSiteContentDomainInPostgresql = async ({
  domain,
  documents,
  fetchImpl = fetch,
  config = readSiteContentCutoverConfig(),
  observationPublisher = publishSiteContentObservation,
} = {}) => {
  if (!config.adminAuthorityRequested) return Object.freeze({ skipped: true });
  if (!config.apiBaseUrl) throw Object.assign(new Error('VITE_API_URL is required for PostgreSQL administrator content writes.'), { code: 'site_content_api_missing' });
  const normalizedDocuments = (Array.isArray(documents) ? documents : [])
    .map((document) => createSiteContentDomainDocument(document))
    .filter((document) => document.key);

  const performReplace = async (forceRefresh = false) => {
    const clerkToken = await getClerkToken({ forceRefresh });
    const response = await fetchImpl(`${config.apiBaseUrl}/api/admin/site-content/${encodeURIComponent(domain)}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clerkToken}`,
      },
      cache: 'no-store',
      body: JSON.stringify({ documents: normalizedDocuments }),
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { response, payload };
  };

  let result = await performReplace(false);
  if (result.response.status === 401 && result.payload?.error === 'unauthorized') {
    result = await performReplace(true);
  }
  const { response, payload } = result;
  if (!response.ok) {
    const error = new Error(`PostgreSQL administrator content write failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'site_content_admin_replace_failed';
    observationPublisher?.({ writeThroughRequested: true, domain, writeSource: 'postgresql-admin-direct', postgresSync: 'failed', error: error.code });
    throw error;
  }
  if (payload?.siteContentMutation?.authority !== 'postgresql' || payload?.siteContentMutation?.sourceMode !== 'postgresql-admin-direct') {
    throw Object.assign(new Error('Backend did not confirm PostgreSQL administrator content authority.'), { code: 'site_content_admin_authority_invalid' });
  }
  const content = payload?.siteContent;
  if (content?.source !== 'postgresql' || Number(content.documentCount) !== normalizedDocuments.length) {
    throw Object.assign(new Error('PostgreSQL administrator content replacement count mismatch.'), { code: 'site_content_admin_count_mismatch' });
  }
  publishSiteContentInvalidation(domain);
  observationPublisher?.({
    writeThroughRequested: true,
    domain,
    writeSource: 'postgresql-admin-direct',
    postgresSync: 'authoritative',
    postgresDocumentCount: Number(content.documentCount),
    error: null,
  });
  return content;
};
