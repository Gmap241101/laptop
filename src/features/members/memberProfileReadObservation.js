const OBSERVATION_EVENT = 'rental:member-profile-read-observation';

const trim = (value) => (typeof value === 'string' ? value.trim() : '');
const normalizeInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeMemberProfileRead = (profile, firebaseUid = '') => {
  if (!profile || typeof profile !== 'object') return null;
  return Object.freeze({
    uid: trim(profile.uid || firebaseUid),
    email: trim(profile.email).toLowerCase(),
    maskedEmail: trim(profile.maskedEmail),
    name: trim(profile.name),
    team: trim(profile.team),
    phone: trim(profile.phone),
    status: trim(profile.status),
    directoryMemberId: trim(profile.directoryMemberId),
    directoryVerifiedVersion: normalizeInteger(profile.directoryVerifiedVersion),
    profileRequiredReason: trim(profile.profileRequiredReason),
    rejoinedAccount: Boolean(profile.rejoinedAccount),
    termsConsentRevision: normalizeInteger(profile.termsConsentRevision),
    termsConsentPolicyVersion: normalizeInteger(profile.termsConsentPolicyVersion),
    identityKey: trim(profile.identityKey),
    recoveryKey: trim(profile.recoveryKey),
    previousAccountUids: Object.freeze(
      (Array.isArray(profile.previousAccountUids) ? profile.previousAccountUids : [])
        .map((value) => trim(value))
        .filter(Boolean),
    ),
  });
};

const comparableKeys = Object.freeze([
  'uid',
  'email',
  'maskedEmail',
  'name',
  'team',
  'phone',
  'status',
  'directoryMemberId',
  'directoryVerifiedVersion',
  'profileRequiredReason',
  'rejoinedAccount',
  'termsConsentRevision',
  'termsConsentPolicyVersion',
  'identityKey',
  'recoveryKey',
  'previousAccountUids',
]);

export const compareMemberProfileReads = (left, right) => {
  const normalizedLeft = normalizeMemberProfileRead(left);
  const normalizedRight = normalizeMemberProfileRead(right);
  if (!normalizedLeft || !normalizedRight) {
    return Object.freeze({ equivalent: false, changedFields: ['profileMissing'] });
  }
  const changedFields = comparableKeys.filter((key) => {
    const leftValue = normalizedLeft[key];
    const rightValue = normalizedRight[key];
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return JSON.stringify(leftValue || []) !== JSON.stringify(rightValue || []);
    }
    return leftValue !== rightValue;
  });
  return Object.freeze({ equivalent: changedFields.length === 0, changedFields });
};

let latestObservation = null;

const diagnosticsEnabled = () => {
  if (typeof window === 'undefined') return false;
  const env = import.meta.env || {};
  if (String(env.VITE_CLERK_STAGING_ENABLED || '').trim().toLowerCase() !== 'true') return false;
  return new URLSearchParams(window.location.search).get('clerkTest') === '1';
};

export const publishMemberProfileReadObservation = ({ firebaseUid, profile }) => {
  if (!diagnosticsEnabled()) return;
  latestObservation = Object.freeze({
    source: 'firestore-onSnapshot',
    firebaseUid: trim(firebaseUid),
    profile: normalizeMemberProfileRead(profile, firebaseUid),
    observedAt: new Date().toISOString(),
  });
  window.dispatchEvent(new CustomEvent(OBSERVATION_EVENT, { detail: latestObservation }));
};

export const getLatestMemberProfileReadObservation = () => latestObservation;

export const subscribeMemberProfileReadObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(OBSERVATION_EVENT, handler);
  return () => window.removeEventListener(OBSERVATION_EVENT, handler);
};
