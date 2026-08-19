import { readPolicyContentCutoverConfig } from '../content/policyContentCutover.js';
import { normalizeActiveTerm, normalizeTermsPolicy } from './termsConstants.js';

export async function createTermsContentHash(value = '') {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim();

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const SIGNUP_TERMS_POLICY_CACHE_TTL_MS = 60_000;
const SIGNUP_TERM_CONTENT_CACHE_TTL_MS = 5 * 60_000;
let signupTermsPolicyCache = null;
let signupTermsPolicyPending = null;
const signupTermContentCache = new Map();
const signupTermContentPending = new Map();
const signupTermBatchPending = new Map();

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const requestSignupTermsPolicy = async ({ fetchImpl = fetch } = {}) => {
  const config = readPolicyContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.readEnabled || !apiBaseUrl) {
    const error = new Error('Signup terms PostgreSQL authority is unavailable.');
    error.code = 'signup_terms_policy_authority_unavailable';
    throw error;
  }

  const response = await fetchImpl(`${apiBaseUrl}/api/signup/terms-policy`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(`Signup terms policy read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'signup_terms_policy_read_failed';
    throw error;
  }
  if (payload?.signupTermsPolicy?.source !== 'postgresql') {
    const error = new Error('Backend returned an invalid signup terms policy response.');
    error.code = 'signup_terms_policy_payload_invalid';
    throw error;
  }
  return normalizeTermsPolicy(payload.signupTermsPolicy.payload || {});
};

const createSignupTermContentCacheKey = (termValue = {}) => {
  const term = normalizeActiveTerm(termValue);
  return [term.id, term.version, term.versionId, term.contentHash].join(':');
};

const requestSignupTermContents = async (termValues = [], { fetchImpl = fetch } = {}) => {
  const terms = (Array.isArray(termValues) ? termValues : [])
    .map((term) => normalizeActiveTerm(term))
    .filter((term) => term.id);
  if (terms.length === 0) return [];
  const config = readPolicyContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.readEnabled || !apiBaseUrl) {
    const error = new Error('Signup term PostgreSQL authority is unavailable.');
    error.code = 'signup_term_content_authority_unavailable';
    throw error;
  }
  const ids = terms.map((term) => term.id).join(',');
  const response = await fetchImpl(
    `${apiBaseUrl}/api/signup/terms-content?ids=${encodeURIComponent(ids)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
  );
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(`Signup term batch content read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'signup_term_contents_read_failed';
    throw error;
  }
  const remoteTerms = Array.isArray(payload?.signupTermContents?.terms)
    ? payload.signupTermContents.terms.map((term) => normalizeActiveTerm(term))
    : [];
  if (payload?.signupTermContents?.source !== 'postgresql' || remoteTerms.length !== terms.length) {
    const error = new Error('Backend returned an invalid signup term batch content response.');
    error.code = 'signup_term_contents_payload_invalid';
    throw error;
  }
  const remoteById = new Map(remoteTerms.map((term) => [term.id, term]));
  return terms.map((term) => {
    const remoteTerm = remoteById.get(term.id);
    if (
      !remoteTerm ||
      remoteTerm.version !== term.version ||
      String(remoteTerm.versionId || '') !== String(term.versionId || '') ||
      String(remoteTerm.contentHash || '') !== String(term.contentHash || '')
    ) {
      const error = new Error('Backend returned stale or invalid signup term batch content.');
      error.code = 'signup_term_contents_payload_invalid';
      throw error;
    }
    return normalizeActiveTerm({ ...term, ...remoteTerm });
  });
};

const requestSignupTermContent = async (termValue, { fetchImpl = fetch } = {}) => {
  const term = normalizeActiveTerm(termValue);
  if (!term.id) {
    const error = new Error('Signup term ID is required.');
    error.code = 'signup_term_id_missing';
    throw error;
  }
  const config = readPolicyContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.readEnabled || !apiBaseUrl) {
    const error = new Error('Signup term PostgreSQL authority is unavailable.');
    error.code = 'signup_term_content_authority_unavailable';
    throw error;
  }
  const response = await fetchImpl(
    `${apiBaseUrl}/api/signup/terms/${encodeURIComponent(term.id)}/content`,
    { method: 'GET', headers: { Accept: 'application/json' } },
  );
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(`Signup term content read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'signup_term_content_read_failed';
    throw error;
  }
  const remoteTerm = normalizeActiveTerm(payload?.signupTermContent?.term || {});
  if (
    payload?.signupTermContent?.source !== 'postgresql' ||
    remoteTerm.id !== term.id ||
    remoteTerm.version !== term.version ||
    String(remoteTerm.versionId || '') !== String(term.versionId || '') ||
    String(remoteTerm.contentHash || '') !== String(term.contentHash || '')
  ) {
    const error = new Error('Backend returned stale or invalid signup term content.');
    error.code = 'signup_term_content_payload_invalid';
    throw error;
  }
  return normalizeActiveTerm({ ...term, ...remoteTerm });
};

export const primeSignupTermsPolicyCache = (policyValue, { ttlMs = SIGNUP_TERMS_POLICY_CACHE_TTL_MS } = {}) => {
  const policy = normalizeTermsPolicy(policyValue || {});
  signupTermsPolicyCache = {
    policy,
    expiresAt: Date.now() + Math.max(5_000, Number(ttlMs) || SIGNUP_TERMS_POLICY_CACHE_TTL_MS),
  };
  return policy;
};

export const getCachedSignupTermsPolicy = () => {
  if (!signupTermsPolicyCache) return null;
  if (Date.now() >= signupTermsPolicyCache.expiresAt) {
    signupTermsPolicyCache = null;
    return null;
  }
  return signupTermsPolicyCache.policy;
};

export const preloadSignupTermsPolicy = async ({ force = false } = {}) => {
  const cachedPolicy = force ? null : getCachedSignupTermsPolicy();
  if (cachedPolicy) return cachedPolicy;
  if (!force && signupTermsPolicyPending) return signupTermsPolicyPending;

  signupTermsPolicyPending = requestSignupTermsPolicy()
    .then((policy) => {
      signupTermsPolicyCache = {
        policy,
        expiresAt: Date.now() + SIGNUP_TERMS_POLICY_CACHE_TTL_MS,
      };
      return policy;
    })
    .finally(() => {
      signupTermsPolicyPending = null;
    });

  return signupTermsPolicyPending;
};

export async function loadSignupTermsPolicy() {
  return preloadSignupTermsPolicy();
}

export const getCachedSignupTermContent = (termValue = {}) => {
  const key = createSignupTermContentCacheKey(termValue);
  const cached = signupTermContentCache.get(key);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    signupTermContentCache.delete(key);
    return null;
  }
  return cached.term;
};

export const preloadSignupTermContent = async (termValue, { force = false } = {}) => {
  const term = normalizeActiveTerm(termValue);
  const key = createSignupTermContentCacheKey(term);
  if (!term.id) {
    const error = new Error('Signup term ID is required.');
    error.code = 'signup_term_id_missing';
    throw error;
  }
  const cached = force ? null : getCachedSignupTermContent(term);
  if (cached) return cached;
  if (!force && signupTermContentPending.has(key)) {
    return signupTermContentPending.get(key);
  }
  const pending = requestSignupTermContent(term)
    .then((contentTerm) => {
      signupTermContentCache.set(key, {
        term: contentTerm,
        expiresAt: Date.now() + SIGNUP_TERM_CONTENT_CACHE_TTL_MS,
      });
      return contentTerm;
    })
    .finally(() => {
      signupTermContentPending.delete(key);
    });
  signupTermContentPending.set(key, pending);
  return pending;
};

export const preloadSignupTermContents = async (termValues = [], { force = false } = {}) => {
  const terms = (Array.isArray(termValues) ? termValues : [])
    .map((term) => normalizeActiveTerm(term))
    .filter((term) => term.id);
  if (terms.length === 0) return [];

  const cachedById = new Map();
  const unresolved = [];
  for (const term of terms) {
    const cached = force ? null : getCachedSignupTermContent(term);
    if (cached) cachedById.set(term.id, cached);
    else unresolved.push(term);
  }
  if (unresolved.length === 1) {
    cachedById.set(unresolved[0].id, await preloadSignupTermContent(unresolved[0], { force }));
  } else if (unresolved.length > 1) {
    const batchKey = unresolved.map(createSignupTermContentCacheKey).sort().join('|');
    let pending = !force ? signupTermBatchPending.get(batchKey) : null;
    if (!pending) {
      pending = requestSignupTermContents(unresolved)
        .then((loadedTerms) => {
          loadedTerms.forEach((contentTerm) => {
            signupTermContentCache.set(createSignupTermContentCacheKey(contentTerm), {
              term: contentTerm,
              expiresAt: Date.now() + SIGNUP_TERM_CONTENT_CACHE_TTL_MS,
            });
          });
          return loadedTerms;
        })
        .finally(() => {
          signupTermBatchPending.delete(batchKey);
        });
      signupTermBatchPending.set(batchKey, pending);
    }
    const loadedTerms = await pending;
    loadedTerms.forEach((contentTerm) => cachedById.set(contentTerm.id, contentTerm));
  }
  return terms.map((term) => cachedById.get(term.id) || getCachedSignupTermContent(term) || term);
};

export const loadSignupTermContents = async (terms = []) =>
  preloadSignupTermContents(terms);

export function formatTermsTimestamp(value) {
  const millis = Number(value?.millis || value?.milliseconds || 0);
  const date = value?.toDate?.()
    || (millis > 0 ? new Date(millis) : value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}
