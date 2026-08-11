import {
  requestSiteContentDomain,
  syncSiteContentDomainFromFirestore,
} from './siteContentCutover.js';

const READ_SESSION_KEY = 'mk_policy_content_postgres_read';
const WRITE_SESSION_KEY = 'mk_policy_content_postgres_write_through';
const EVENT_NAME = 'rental:policy-content-cutover';
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

export const POLICY_CONTENT_DOMAINS = Object.freeze({
  RENTAL_CONFIG: 'rental-config',
  TERMS: 'terms',
});

export const readPolicyContentCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const authorityEnabled = staging && bool(env?.VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED);
  const readEnabled = staging && (
    bool(env?.VITE_POLICY_CONTENT_POSTGRES_READ_ENABLED) || authorityEnabled
  );
  // Phase 33 public PostgreSQL authority requires administrator policy edits to
  // write through as well. Do not let a missing legacy query/session latch leave
  // Firestore management ahead of the PostgreSQL public source.
  const writeThroughEnabled = staging && (
    bool(env?.VITE_POLICY_CONTENT_WRITE_THROUGH_ENABLED) || authorityEnabled
  );
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRead = readEnabled && params.get('policyContent') === 'postgres';
  const queryRollback = authorityEnabled && params.get('policyContent') === 'firestore';
  const queryWrite = writeThroughEnabled && params.get('policyContentWrite') === 'postgres';
  const queryWriteRollback = authorityEnabled && params.get('policyContentWrite') === 'firestore';
  let sessionRead = false;
  let sessionWrite = false;
  try {
    if (params.get('policyContent') === 'firestore') storage?.removeItem?.(READ_SESSION_KEY);
    else if (queryRead) storage?.setItem?.(READ_SESSION_KEY, '1');
    if (params.get('policyContentWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
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

let latestObservation = null;
export const publishPolicyContentObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};
export const getLatestPolicyContentObservation = () => latestObservation;
export const subscribePolicyContentObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

export const requestPolicyContentDomain = async ({
  domain,
  fetchImpl = fetch,
  config = readPolicyContentCutoverConfig(),
  useCache = true,
} = {}) => requestSiteContentDomain({
  domain,
  fetchImpl,
  config,
  useCache,
  observationPublisher: publishPolicyContentObservation,
});

export const getPolicyContentDocument = (domainResult, key) =>
  (domainResult?.documents || []).find((item) => item.key === key) || null;

export const syncPolicyContentDomainFromFirestore = async ({
  domain,
  fetchImpl = fetch,
  config = readPolicyContentCutoverConfig(),
} = {}) => syncSiteContentDomainFromFirestore({
  domain,
  fetchImpl,
  config,
  observationPublisher: publishPolicyContentObservation,
});

export const syncAllPolicyContentDomainsFromFirestore = async ({
  config = readPolicyContentCutoverConfig(),
} = {}) => {
  const results = [];
  for (const domain of Object.values(POLICY_CONTENT_DOMAINS)) {
    results.push(await syncPolicyContentDomainFromFirestore({ domain, config }));
  }
  publishPolicyContentObservation({
    readRequested: config.readRequested,
    writeThroughRequested: config.writeThroughRequested,
    domain: 'all',
    writeSource: 'firestore',
    postgresSync: 'synced',
    synchronizedDomains: Object.values(POLICY_CONTENT_DOMAINS),
    error: null,
  });
  return results;
};
