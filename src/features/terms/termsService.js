import { readPolicyContentCutoverConfig } from '../content/policyContentCutover.js';
import { normalizeTermsPolicy } from './termsConstants.js';

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
let signupTermsPolicyCache = null;
let signupTermsPolicyPending = null;

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

export function formatTermsTimestamp(value) {
  const millis = Number(value?.millis || value?.milliseconds || 0);
  const date = value?.toDate?.()
    || (millis > 0 ? new Date(millis) : value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}
