import { readSiteContentCutoverConfig } from '../content/siteContentCutover.js';

const ADMIN_CATALOG_CACHE_TTL_MS = 60_000;
const catalogCache = new Map();
const catalogPending = new Map();
const documentContentCache = new Map();
const documentContentPending = new Map();

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');
const trim = (value) => String(value || '').trim();

const getClerkToken = async ({ forceRefresh = false } = {}) => {
  const { clerkStagingClient } = await import('../../clerk/clerkStagingClient.js');
  const clerk = await clerkStagingClient.initialize();
  const token = await clerk?.session?.getToken?.(forceRefresh ? { skipCache: true } : undefined);
  if (!token) {
    throw Object.assign(new Error('Clerk administrator session is required for site-content catalog access.'), {
      code: 'admin_site_content_clerk_session_missing',
    });
  }
  return token;
};

const requestAdminJson = async (path, { fetchImpl = fetch, forceRefresh = false } = {}) => {
  const config = readSiteContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.adminAuthorityRequested || !apiBaseUrl) {
    throw Object.assign(new Error('Administrator PostgreSQL site-content authority is unavailable.'), {
      code: 'admin_site_content_authority_unavailable',
    });
  }

  const performRequest = async (refreshToken = false) => {
    const token = await getClerkToken({ forceRefresh: refreshToken });
    const response = await fetchImpl(`${apiBaseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    return { response, payload };
  };

  let result = await performRequest(forceRefresh);
  if (!forceRefresh && result.response.status === 401 && result.payload?.error === 'unauthorized') {
    result = await performRequest(true);
  }
  if (!result.response.ok) {
    const error = new Error(`Administrator site-content read failed with HTTP ${result.response.status}.`);
    error.status = result.response.status;
    error.code = result.payload?.error || 'admin_site_content_read_failed';
    throw error;
  }
  if (!result.payload?.authenticated || !result.payload?.authorized) {
    throw Object.assign(new Error('Backend did not confirm administrator site-content authority.'), {
      code: 'admin_site_content_authority_invalid',
    });
  }
  return result.payload;
};

const catalogPath = (domain) => `/api/admin/site-content-catalog/${encodeURIComponent(domain)}`;
const contentPath = (domain, documentId) => `/api/admin/site-content-catalog/${encodeURIComponent(domain)}/${encodeURIComponent(documentId)}/content`;

const requestCatalog = async (domain, options = {}) => {
  const payload = await requestAdminJson(catalogPath(domain), options);
  const catalog = payload?.adminSiteContentCatalog;
  if (
    catalog?.source !== 'postgresql' ||
    catalog?.domain !== domain ||
    !Array.isArray(catalog?.documents)
  ) {
    throw Object.assign(new Error('Backend returned an invalid administrator site-content catalog.'), {
      code: 'admin_site_content_catalog_payload_invalid',
    });
  }
  return Object.freeze({
    source: 'postgresql',
    domain,
    documents: catalog.documents,
    documentCount: Number(catalog.documentCount || catalog.documents.length),
    syncedAt: catalog.syncedAt || null,
  });
};

const createDocumentCacheKey = (domain, documentValue = {}) => [
  domain,
  trim(documentValue?.id),
  trim(documentValue?.updatedAt || documentValue?.sourceUpdatedAt || documentValue?.syncedAt),
  Number.isFinite(Number(documentValue?.sortOrder)) ? String(Number(documentValue.sortOrder)) : '',
].join(':');

const requestDocumentContent = async (domain, documentValue, options = {}) => {
  const documentId = trim(documentValue?.id);
  if (!documentId) {
    throw Object.assign(new Error('Administrator site-content document ID is required.'), {
      code: 'admin_site_content_document_id_missing',
    });
  }
  const payload = await requestAdminJson(contentPath(domain, documentId), options);
  const content = payload?.adminSiteContentDocument;
  const document = content?.document;
  if (
    content?.source !== 'postgresql' ||
    content?.domain !== domain ||
    trim(document?.id) !== documentId
  ) {
    throw Object.assign(new Error('Backend returned an invalid administrator site-content document.'), {
      code: 'admin_site_content_document_payload_invalid',
    });
  }
  return Object.freeze({ ...document });
};

const getCachedCatalog = (domain) => {
  const cached = catalogCache.get(domain);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    catalogCache.delete(domain);
    return null;
  }
  return cached.value;
};

const preloadCatalog = async (domain, { force = false } = {}) => {
  const cached = force ? null : getCachedCatalog(domain);
  if (cached) return cached;
  if (!force && catalogPending.has(domain)) return catalogPending.get(domain);

  const pending = requestCatalog(domain, { forceRefresh: force })
    .then((catalog) => {
      catalogCache.set(domain, {
        value: catalog,
        expiresAt: Date.now() + ADMIN_CATALOG_CACHE_TTL_MS,
      });
      return catalog;
    })
    .finally(() => catalogPending.delete(domain));
  catalogPending.set(domain, pending);
  return pending;
};

const preloadDocumentContent = async (domain, documentValue, { force = false } = {}) => {
  const key = createDocumentCacheKey(domain, documentValue);
  if (!trim(documentValue?.id)) {
    throw Object.assign(new Error('Administrator site-content document ID is required.'), {
      code: 'admin_site_content_document_id_missing',
    });
  }
  if (!force && documentContentCache.has(key)) return documentContentCache.get(key);
  if (!force && documentContentPending.has(key)) return documentContentPending.get(key);

  const pending = requestDocumentContent(domain, documentValue, { forceRefresh: force })
    .then((document) => {
      documentContentCache.set(key, document);
      return document;
    })
    .finally(() => documentContentPending.delete(key));
  documentContentPending.set(key, pending);
  return pending;
};

const invalidateDomain = (domain) => {
  catalogCache.delete(domain);
  for (const key of documentContentCache.keys()) {
    if (key.startsWith(`${domain}:`)) documentContentCache.delete(key);
  }
  for (const key of documentContentPending.keys()) {
    if (key.startsWith(`${domain}:`)) documentContentPending.delete(key);
  }
};

export const preloadAdminPopupCatalog = (options) => preloadCatalog('popup', options);
export const preloadAdminFooterCatalog = (options) => preloadCatalog('footer', options);
export const preloadAdminPopupPostContent = (post, options) => preloadDocumentContent('popup', post, options);
export const preloadAdminFooterPageContent = (page, options) => preloadDocumentContent('footer', page, options);
export const invalidateAdminPopupCatalog = () => invalidateDomain('popup');
export const invalidateAdminFooterCatalog = () => invalidateDomain('footer');
