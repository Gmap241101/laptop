import {
  FAQ_BOARD_CONFIG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  FAQ_CATEGORIES_COLLECTION_REF,
  FAQ_POSTS_COLLECTION_REF,
  FOOTER_PAGES_COLLECTION_REF,
  HOME_BANNERS_COLLECTION_REF,
  HOME_PAGE_CONFIG_DOC_REF,
  NOTICE_BOARD_CONFIG_DOC_REF,
  NOTICE_POSTS_COLLECTION_REF,
  POPUP_POSTS_COLLECTION_REF,
  SIGNUP_TERMS_COLLECTION_REF,
  SIGNUP_TERMS_POLICY_DOC_REF,
  SITE_FOOTER_CONFIG_DOC_REF,
  SITE_SETTINGS_DOC_REF,
  firebaseAuth,
} from '../../firebase.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';

const READ_SESSION_KEY = 'mk_site_content_postgres_read';
const WRITE_SESSION_KEY = 'mk_site_content_postgres_write_through';
const EVENT_NAME = 'rental:site-content-cutover';
const INVALIDATION_EVENT_NAME = 'rental:site-content-invalidated';
const INVALIDATION_STORAGE_KEY = 'mk_site_content_invalidated_v2';
const DOMAIN_CACHE_TTL_MS = 5_000;
export const PHASE33_PUBLIC_CONTENT_VISIBILITY_REVISION = 'phase33-public-content-visibility-hotfix-20260812-0105';
export const PHASE33_PUBLIC_CONTENT_SYNC_REVISION = 'phase33-public-content-full-server-sync-hotfix-20260812-0117';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

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

export const readSiteContentCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const authorityEnabled = staging && bool(env?.VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED);
  const readEnabled = staging && (
    bool(env?.VITE_SITE_CONTENT_POSTGRES_READ_ENABLED) || authorityEnabled
  );
  // Phase 33 public PostgreSQL authority and administrator Firestore editing must move
  // together. Once public authority is enabled, every administrator site-content
  // save is required to write through to PostgreSQL even when a legacy query/session
  // latch is absent. This prevents Firestore-admin / PostgreSQL-public split brain.
  const writeThroughEnabled = staging && (
    bool(env?.VITE_SITE_CONTENT_WRITE_THROUGH_ENABLED) || authorityEnabled
  );
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRead = readEnabled && params.get('siteContent') === 'postgres';
  const queryRollback = authorityEnabled && params.get('siteContent') === 'firestore';
  const queryWrite = writeThroughEnabled && params.get('siteContentWrite') === 'postgres';
  const queryWriteRollback = authorityEnabled && params.get('siteContentWrite') === 'firestore';
  let sessionRead = false;
  let sessionWrite = false;
  try {
    if (params.get('siteContent') === 'firestore') storage?.removeItem?.(READ_SESSION_KEY);
    else if (queryRead) storage?.setItem?.(READ_SESSION_KEY, '1');
    if (params.get('siteContentWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
    else if (queryWrite) storage?.setItem?.(WRITE_SESSION_KEY, '1');
    sessionRead = storage?.getItem?.(READ_SESSION_KEY) === '1';
    sessionWrite = storage?.getItem?.(WRITE_SESSION_KEY) === '1';
  } catch {
    sessionRead = false;
    sessionWrite = false;
  }
  return Object.freeze({
    authorityEnabled,
    authorityRequested: Boolean(authorityEnabled && !queryRollback),
    fallbackAllowed: !authorityEnabled || queryRollback,
    readEnabled,
    writeThroughEnabled,
    readRequested: Boolean(
      (authorityEnabled && !queryRollback) ||
      (readEnabled && (queryRead || sessionRead))
    ),
    writeThroughRequested: Boolean(
      writeThroughEnabled && (
        (authorityEnabled && !queryRollback && !queryWriteRollback) ||
        queryWrite ||
        sessionWrite
      )
    ),
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

const serializeValue = (value) => {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toMillis === 'function') return { __mkType: 'timestamp', millis: value.toMillis() };
  if (value instanceof Date) return { __mkType: 'timestamp', millis: value.getTime() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
  }
  return value;
};

const reviveValue = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (value.__mkType === 'timestamp' && Number.isFinite(Number(value.millis))) {
    const millis = Number(value.millis);
    return Object.freeze({
      seconds: Math.trunc(millis / 1000),
      nanoseconds: Math.trunc((millis % 1000) * 1_000_000),
      toMillis: () => millis,
      toDate: () => new Date(millis),
    });
  }
  if (Array.isArray(value)) return value.map(reviveValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reviveValue(item)]));
};

const domainCache = new Map();
export const clearSiteContentDomainCache = (domain) => {
  if (domain) domainCache.delete(domain);
  else domainCache.clear();
};

export const publishSiteContentInvalidation = (domain = 'all') => {
  clearSiteContentDomainCache(domain === 'all' ? null : domain);
  if (typeof window === 'undefined') return;
  const detail = Object.freeze({
    domain: trim(domain) || 'all',
    invalidatedAt: Date.now(),
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  window.dispatchEvent(new CustomEvent(INVALIDATION_EVENT_NAME, { detail }));
  try {
    window.localStorage?.setItem?.(INVALIDATION_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Cross-tab invalidation is best-effort; the same-tab CustomEvent already fired.
  }
};

export const subscribeSiteContentInvalidation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const onLocal = (event) => listener(event.detail || { domain: 'all', invalidatedAt: Date.now() });
  const onStorage = (event) => {
    if (event.key !== INVALIDATION_STORAGE_KEY || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue);
      listener(detail && typeof detail === 'object' ? detail : { domain: 'all', invalidatedAt: Date.now() });
    } catch {
      listener({ domain: 'all', invalidatedAt: Date.now() });
    }
  };
  window.addEventListener(INVALIDATION_EVENT_NAME, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(INVALIDATION_EVENT_NAME, onLocal);
    window.removeEventListener('storage', onStorage);
  };
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
        payload: reviveValue(item.payload || {}),
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
  catch (error) { if (useCache) domainCache.delete(domain); observationPublisher?.({ readRequested: true, domain, readSource: 'firestore-fallback', error: error?.code || 'site_content_read_failed' }); throw error; }
};

const getClerkToken = async ({ forceRefresh = false } = {}) => {
  const clerk = await clerkStagingClient.initialize();
  const token = await clerk?.session?.getToken?.(forceRefresh ? { skipCache: true } : undefined);
  if (!token) throw Object.assign(new Error('Clerk administrator session is required for site content write-through.'), { code: 'site_content_clerk_session_missing' });
  return token;
};

export const syncSiteContentDomainFromFirestore = async ({ domain, fetchImpl = fetch, config = readSiteContentCutoverConfig(), observationPublisher = publishSiteContentObservation } = {}) => {
  if (!config.writeThroughRequested) return Object.freeze({ skipped: true });
  if (!config.apiBaseUrl) throw Object.assign(new Error('VITE_API_URL is required for site content write-through.'), { code: 'site_content_api_missing' });
  const firebaseUser = firebaseAuth.currentUser;
  if (!firebaseUser) throw Object.assign(new Error('Firebase administrator compatibility session is required for site content write-through.'), { code: 'site_content_firebase_session_missing' });

  const performSync = async ({ forceClerkRefresh = false, forceFirebaseRefresh = false } = {}) => {
    const [clerkToken, firebaseIdToken] = await Promise.all([
      getClerkToken({ forceRefresh: forceClerkRefresh }),
      firebaseUser.getIdToken(forceFirebaseRefresh),
    ]);
    const response = await fetchImpl(`${config.apiBaseUrl}/api/admin/site-content/${encodeURIComponent(domain)}/sync`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clerkToken}`,
        'X-Firebase-Authorization': `Bearer ${firebaseIdToken}`,
      },
      cache: 'no-store',
      body: JSON.stringify({ sourceMode: 'firestore-server-backend-full-domain' }),
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { response, payload };
  };

  let result = await performSync();
  if (result.response.status === 401 && result.payload?.error === 'unauthorized') {
    result = await performSync({ forceClerkRefresh: true });
  } else if (result.response.status === 401 && result.payload?.error === 'legacy_firebase_unauthorized') {
    result = await performSync({ forceFirebaseRefresh: true });
  }

  const { response, payload } = result;
  if (!response.ok) {
    const error = new Error(`PostgreSQL site content write-through failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'site_content_write_through_failed';
    observationPublisher?.({ writeThroughRequested: true, domain, writeSource: 'firestore-server-backend', postgresSync: 'failed', error: error.code });
    throw error;
  }

  const sourceDocumentCount = Number(payload?.siteContentSource?.documentCount ?? -1);
  const postgresDocumentCount = Number(payload?.siteContent?.documentCount ?? -1);
  if (payload?.siteContentSource?.mode !== 'firestore-server-backend-full-domain' || sourceDocumentCount < 0) {
    const error = Object.assign(new Error('Backend did not confirm a complete Firestore server source for site content sync.'), {
      code: 'site_content_sync_source_invalid',
    });
    observationPublisher?.({ writeThroughRequested: true, domain, writeSource: 'firestore-server-backend', postgresSync: 'failed', error: error.code });
    throw error;
  }
  if (postgresDocumentCount !== sourceDocumentCount) {
    const error = Object.assign(new Error('PostgreSQL site content sync document count mismatch.'), {
      code: 'site_content_sync_count_mismatch',
      firestoreDocumentCount: sourceDocumentCount,
      postgresDocumentCount,
    });
    observationPublisher?.({
      writeThroughRequested: true,
      domain,
      writeSource: 'firestore-server-backend',
      postgresSync: 'failed',
      firestoreDocumentCount: sourceDocumentCount,
      postgresDocumentCount,
      error: error.code,
    });
    throw error;
  }

  const persistedDocuments = Array.isArray(payload?.siteContent?.documents) ? payload.siteContent.documents : [];
  const homeBanners = domain === SITE_CONTENT_DOMAINS.HOME
    ? persistedDocuments.filter((item) => String(item?.key || '').startsWith('homeBanners/'))
    : [];
  const activeHomeBanners = homeBanners.filter((item) => item?.publicVisibility?.active === true);
  const popupPosts = domain === SITE_CONTENT_DOMAINS.POPUP
    ? persistedDocuments.filter((item) => String(item?.key || '').startsWith('popupPosts/'))
    : [];
  publishSiteContentInvalidation(domain);
  observationPublisher?.({
    writeThroughRequested: true,
    domain,
    writeSource: 'firestore-server-backend',
    postgresSync: 'synced',
    documentCount: postgresDocumentCount,
    firestoreDocumentCount: sourceDocumentCount,
    postgresDocumentCount,
    ...(domain === SITE_CONTENT_DOMAINS.HOME ? {
      homeBannerCount: homeBanners.length,
      homeActiveHeroCount: activeHomeBanners.filter((item) => item?.payload?.placement === 'hero').length,
      homeActivePromotionCount: activeHomeBanners.filter((item) => item?.payload?.placement === 'promotion').length,
      homeActiveQuickLinkCount: activeHomeBanners.filter((item) => item?.payload?.placement === 'quickLink').length,
    } : {}),
    ...(domain === SITE_CONTENT_DOMAINS.POPUP ? {
      popupPostCount: popupPosts.length,
      popupActiveCount: popupPosts.filter((item) => item?.publicVisibility?.active === true).length,
    } : {}),
    syncAt: payload?.siteContent?.syncedAt || null,
    error: null,
  });
  return payload?.siteContent || null;
};

export const syncAllSiteContentDomainsFromFirestore = async ({ config = readSiteContentCutoverConfig() } = {}) => {
  const results = [];
  for (const domain of Object.values(SITE_CONTENT_DOMAINS)) {
    results.push(await syncSiteContentDomainFromFirestore({ domain, config }));
  }
  publishSiteContentObservation({
    readRequested: config.readRequested,
    writeThroughRequested: config.writeThroughRequested,
    domain: 'all',
    writeSource: 'firestore-server-backend',
    postgresSync: 'synced',
    synchronizedDomains: Object.values(SITE_CONTENT_DOMAINS),
    error: null,
  });
  return results;
};

// Explicitly exported for Phase 24 source audits. These remain excluded from the current cutover.
export const PHASE24_EXCLUDED_CONTENT_REFS = Object.freeze([
  NOTICE_BOARD_CONFIG_DOC_REF,
  NOTICE_POSTS_COLLECTION_REF,
  FAQ_BOARD_CONFIG_DOC_REF,
  PUBLIC_CONFIG_DOC_REF,
  FAQ_CATEGORIES_COLLECTION_REF,
  FAQ_POSTS_COLLECTION_REF,
  SIGNUP_TERMS_POLICY_DOC_REF,
  SIGNUP_TERMS_COLLECTION_REF,
]);
