import {
  POLICY_CONTENT_DOMAINS,
  getPolicyContentDocument,
  readPolicyContentCutoverConfig,
  requestPolicyContentDomain,
} from '../content/policyContentCutover.js';
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

export async function loadSignupTermsPolicy() {
  const config = readPolicyContentCutoverConfig();
  const domainResult = await requestPolicyContentDomain({
    domain: POLICY_CONTENT_DOMAINS.TERMS,
    config,
    useCache: false,
  });
  const policyDocument = getPolicyContentDocument(
    domainResult,
    'signupTermsPolicy/current'
  );
  return normalizeTermsPolicy(policyDocument?.payload || {});
}

export function formatTermsTimestamp(value) {
  const millis = Number(value?.millis || value?.milliseconds || 0);
  const date = value?.toDate?.()
    || (millis > 0 ? new Date(millis) : value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}
