import { compareMemberProfileReads, normalizeMemberProfileRead } from './memberProfileReadObservation.js';

const EVENT_NAME = 'rental:member-profile-read-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : '');
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

export const readMemberProfileCutoverConfig = ({ env = import.meta.env, location = globalThis.location } = {}) => {
  const stagingBridgeEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const postgresReadEnabled = bool(env?.VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED);
  const requested = Boolean(
    stagingBridgeEnabled &&
    postgresReadEnabled &&
    location &&
    new URLSearchParams(location.search || '').get('memberRead') === 'postgres'
  );
  return Object.freeze({
    enabled: stagingBridgeEnabled && postgresReadEnabled,
    requested,
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

export const requestMemberProfileCutoverCandidate = async ({ firebaseUser, apiBaseUrl, fetchImpl = fetch }) => {
  if (!firebaseUser || typeof firebaseUser.getIdToken !== 'function') {
    throw new Error('Firebase sign-in is required for the Phase 9 member read cutover.');
  }
  if (!apiBaseUrl) throw new Error('VITE_API_URL is required for the Phase 9 member read cutover.');
  const firebaseIdToken = await firebaseUser.getIdToken();
  const response = await fetchImpl(`${apiBaseUrl}/api/legacy/member-profile-cutover-candidate`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Firebase-Authorization': `Bearer ${firebaseIdToken}`,
    },
    cache: 'no-store',
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(`PostgreSQL member cutover candidate failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'member_read_cutover_candidate_failed';
    throw error;
  }
  if (payload?.readCandidate?.source !== 'postgresql-shadow' || !payload?.readCandidate?.profile?.uid) {
    throw new Error('Backend returned an invalid Phase 9 member read candidate.');
  }
  return Object.freeze({
    ...payload.readCandidate,
    profile: normalizeMemberProfileRead(payload.readCandidate.profile),
  });
};

export const chooseMemberProfileReadSource = ({ firestoreProfile, postgresProfile, requested }) => {
  if (!firestoreProfile) {
    return Object.freeze({ source: 'firestore-onSnapshot', profile: null, equivalent: false, changedFields: ['profileMissing'], fallbackReason: 'firestore-profile-missing' });
  }
  if (!requested) {
    return Object.freeze({ source: 'firestore-onSnapshot', profile: firestoreProfile, equivalent: null, changedFields: [], fallbackReason: 'cutover-not-requested' });
  }
  if (!postgresProfile) {
    return Object.freeze({ source: 'firestore-onSnapshot', profile: firestoreProfile, equivalent: false, changedFields: ['postgresCandidateMissing'], fallbackReason: 'postgres-candidate-unavailable' });
  }
  const comparison = compareMemberProfileReads(firestoreProfile, postgresProfile);
  if (!comparison.equivalent) {
    return Object.freeze({ source: 'firestore-onSnapshot', profile: firestoreProfile, equivalent: false, changedFields: comparison.changedFields, fallbackReason: 'profile-mismatch' });
  }
  return Object.freeze({ source: 'postgresql-shadow', profile: postgresProfile, equivalent: true, changedFields: [], fallbackReason: '' });
};

let latest = null;
export const publishMemberProfileCutoverObservation = (detail) => {
  if (typeof window === 'undefined') return;
  latest = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latest }));
};
export const getLatestMemberProfileCutoverObservation = () => latest;
export const subscribeMemberProfileCutoverObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
