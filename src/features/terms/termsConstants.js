export const SIGNUP_TERMS_POLICY_DOC_PATH = 'signupTermsPolicy/current';
export const SIGNUP_TERMS_COLLECTION_NAME = 'signupTerms';
export const SIGNUP_TERM_VERSIONS_COLLECTION_NAME = 'signupTermVersions';
export const USER_TERM_CONSENT_STATES_COLLECTION_NAME = 'userTermConsentStates';
export const USER_TERM_CONSENT_LOGS_COLLECTION_NAME = 'userTermConsentLogs';
export const MAX_ACTIVE_SIGNUP_TERMS = 10;

export const TERMS_DECISION = Object.freeze({
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
});

export const TERMS_CONSENT_SOURCE = Object.freeze({
  SIGNUP: 'signup',
  MY_PAGE: 'myPage',
  RECONSENT: 'reconsent',
});

export const DEFAULT_SIGNUP_TERMS_POLICY = Object.freeze({
  enabled: false,
  requireReconsentOnChange: true,
  applyToExistingMembers: false,
  revision: 0,
  requiredRevision: 0,
  initialRevision: 0,
  activeTerms: [],
});

export const normalizeActiveTerm = (term = {}) => ({
  id: String(term.id || '').trim(),
  title: String(term.title || '').trim(),
  contentHtml: String(term.contentHtml || ''),
  contentText: String(term.contentText || ''),
  contentHash: String(term.contentHash || ''),
  required: Boolean(term.required),
  version: Math.max(1, Number(term.version) || 1),
  versionId: String(term.versionId || term.currentVersionId || '').trim(),
  displayOrder: Number.isFinite(Number(term.displayOrder))
    ? Number(term.displayOrder)
    : 0,
});

export const normalizeActiveTermMetadata = (term = {}) => {
  const normalized = normalizeActiveTerm(term);
  return {
    id: normalized.id,
    title: normalized.title,
    contentHash: normalized.contentHash,
    required: normalized.required,
    version: normalized.version,
    versionId: normalized.versionId,
    displayOrder: normalized.displayOrder,
  };
};

export const normalizeTermsPolicy = (policy = {}) => ({
  enabled: Boolean(policy.enabled),
  requireReconsentOnChange: policy.requireReconsentOnChange !== false,
  applyToExistingMembers: Boolean(policy.applyToExistingMembers),
  revision: Math.max(0, Number(policy.revision) || 0),
  requiredRevision: Math.max(0, Number(policy.requiredRevision) || 0),
  initialRevision: Math.max(0, Number(policy.initialRevision) || 0),
  activeTerms: (Array.isArray(policy.activeTerms) ? policy.activeTerms : [])
    .map(normalizeActiveTermMetadata)
    .filter((term) => term.id && term.title)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title, 'ko')),
});

export const getTermsConsentStateId = (uid, termId) =>
  `${String(uid || '').trim()}__${String(termId || '').trim()}`;

export const isTermsConsentRequiredForAccount = ({ policy, account }) => {
  const normalizedPolicy = normalizeTermsPolicy(policy);
  if (!normalizedPolicy.enabled || normalizedPolicy.activeTerms.length === 0) {
    return false;
  }

  const consentRevision = Math.max(
    0,
    Number(account?.termsConsentRevision) || 0
  );

  if (consentRevision >= normalizedPolicy.requiredRevision) {
    return false;
  }

  if (
    consentRevision === 0 &&
    !normalizedPolicy.applyToExistingMembers &&
    normalizedPolicy.requiredRevision <= normalizedPolicy.initialRevision
  ) {
    return false;
  }

  return normalizedPolicy.requiredRevision > 0;
};

export const createEmptyTermsSubmission = () => ({
  ready: false,
  enabled: false,
  valid: false,
  policyRevision: 0,
  requiredRevision: 0,
  decisions: [],
});
