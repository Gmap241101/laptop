import {
  readSiteContentCutoverConfig,
  patchSiteContentDomainInPostgresql,
  replaceSiteContentDomainInPostgresql,
  requestSiteContentDomain,
} from './siteContentCutover.js';

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

export const readPolicyContentCutoverConfig = ({ env = import.meta.env } = {}) => {
  const adminContentConfig = readSiteContentCutoverConfig({ env });
  const apiBaseUrl = normalizeApiBaseUrl(env?.VITE_API_URL);
  const authorityEnabled = Boolean(apiBaseUrl);
  return Object.freeze({
    authorityEnabled,
    authorityRequested: authorityEnabled,
    adminAuthorityEnabled: adminContentConfig.adminAuthorityEnabled,
    adminAuthorityRequested: adminContentConfig.adminAuthorityRequested,
    fallbackAllowed: false,
    readEnabled: authorityEnabled,
    writeThroughEnabled: authorityEnabled,
    readRequested: authorityEnabled,
    writeThroughRequested: authorityEnabled,
    apiBaseUrl,
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

export const patchPolicyContentDomainInPostgresql = async ({
  domain,
  upserts = [],
  deletes = [],
  fetchImpl = fetch,
  config = readPolicyContentCutoverConfig(),
} = {}) => patchSiteContentDomainInPostgresql({
  domain,
  upserts,
  deletes,
  fetchImpl,
  config,
  observationPublisher: publishPolicyContentObservation,
});

export const replacePolicyContentDomainInPostgresql = async ({
  domain,
  documents,
  fetchImpl = fetch,
  config = readPolicyContentCutoverConfig(),
} = {}) => replaceSiteContentDomainInPostgresql({
  domain,
  documents,
  fetchImpl,
  config,
  observationPublisher: publishPolicyContentObservation,
});
