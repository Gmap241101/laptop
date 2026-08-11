import {
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';

import {
  SIGNUP_TERMS_POLICY_DOC_REF,
  USER_TERM_CONSENT_LOGS_COLLECTION_REF,
  USER_TERM_CONSENT_STATES_COLLECTION_REF,
} from '../../firebase.js';
import {
  getTermsConsentStateId,
  normalizeTermsPolicy,
} from './termsConstants.js';
import {
  POLICY_CONTENT_DOMAINS,
  getPolicyContentDocument,
  readPolicyContentCutoverConfig,
  requestPolicyContentDomain,
} from '../content/policyContentCutover.js';

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
  if (config.readRequested) {
    try {
      const domainResult = await requestPolicyContentDomain({
        domain: POLICY_CONTENT_DOMAINS.TERMS,
        config,
        useCache: false,
      });
      const policyDocument = getPolicyContentDocument(
        domainResult,
        'signupTermsPolicy/current'
      );
      if (policyDocument?.payload) {
        return normalizeTermsPolicy(policyDocument.payload);
      }
    } catch (error) {
      console.error('PostgreSQL signup terms policy read error:', error);
      if (config.authorityRequested) throw error;
    }
  }

  const snapshot = await getDoc(SIGNUP_TERMS_POLICY_DOC_REF);
  return normalizeTermsPolicy(snapshot.exists() ? snapshot.data() : {});
}

export async function loadUserTermConsentStates(uid, policy) {
  const normalizedPolicy = normalizeTermsPolicy(policy);
  const pairs = await Promise.all(
    normalizedPolicy.activeTerms.map(async (term) => {
      const stateSnapshot = await getDoc(
        doc(
          USER_TERM_CONSENT_STATES_COLLECTION_REF,
          getTermsConsentStateId(uid, term.id)
        )
      );
      return [term.id, stateSnapshot.exists() ? stateSnapshot.data() : null];
    })
  );

  return Object.fromEntries(pairs);
}

export async function loadUserTermConsentLogs(uid) {
  const snapshot = await getDocs(
    query(
      USER_TERM_CONSENT_LOGS_COLLECTION_REF,
      where('uid', '==', uid),
      limit(500)
    )
  );

  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => {
      const aMillis = a.createdAt?.toMillis?.() || Number(a.createdAtMs) || 0;
      const bMillis = b.createdAt?.toMillis?.() || Number(b.createdAtMs) || 0;
      return bMillis - aMillis;
    });
}

export function formatTermsTimestamp(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}
