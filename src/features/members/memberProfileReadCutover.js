import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';
import { readUserFirebaseAuthRetirementConfig } from '../auth/userFirebaseAuthRetirement.js';
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';
import { clerkStagingClient } from '../../clerk/clerkStagingClient.js';
import { compareMemberProfileReads, normalizeMemberProfileRead } from './memberProfileReadObservation.js';

const EVENT_NAME = 'rental:member-profile-read-cutover';
const READ_SESSION_KEY = 'mk_member_profile_postgres_read_test';
const WATCHER_SESSION_KEY = 'mk_member_profile_watcher_off_test';
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

export const readMemberProfileCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingBridgeEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig({ env, location }).requested;
  const postgresReadEnabled = bool(env?.VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED) || firebaseRuntimeRetired;
  const firestoreWatcherDisableEnabled = bool(env?.VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED) || firebaseRuntimeRetired;
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const enabled = stagingBridgeEnabled && postgresReadEnabled;
  const queryRequested = Boolean(enabled && location && params.get('memberRead') === 'postgres');
  const queryWatcherDisabled = Boolean(
    queryRequested &&
    firestoreWatcherDisableEnabled &&
    params.get('memberWatcher') === 'off'
  );

  let sessionRequested = false;
  let sessionWatcherDisabled = false;
  try {
    if (params.get('memberRead') === 'firestore') {
      storage?.removeItem?.(READ_SESSION_KEY);
      storage?.removeItem?.(WATCHER_SESSION_KEY);
    } else {
      if (queryRequested) storage?.setItem?.(READ_SESSION_KEY, '1');
      if (queryWatcherDisabled) storage?.setItem?.(WATCHER_SESSION_KEY, '1');
    }
    sessionRequested = storage?.getItem?.(READ_SESSION_KEY) === '1';
    sessionWatcherDisabled = storage?.getItem?.(WATCHER_SESSION_KEY) === '1';
  } catch {
    sessionRequested = false;
    sessionWatcherDisabled = false;
  }

  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  const requested = Boolean(enabled && (queryRequested || sessionRequested || accountLifecycleRequested));
  const firestoreWatcherDisabled = Boolean(
    requested &&
    firestoreWatcherDisableEnabled &&
    (queryWatcherDisabled || sessionWatcherDisabled || accountLifecycleRequested)
  );
  return Object.freeze({
    enabled,
    requested,
    queryRequested,
    sessionRequested,
    forcedByAccountLifecycle: Boolean(enabled && accountLifecycleRequested),
    firestoreWatcherDisableEnabled,
    firestoreWatcherDisabled,
    queryWatcherDisabled,
    sessionWatcherDisabled,
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

export const shouldUseMemberProfileFirestoreWatcher = (config) =>
  !Boolean(config?.firestoreWatcherDisabled);

export const requestMemberProfileCutoverCandidate = async ({ firebaseUser, apiBaseUrl, fetchImpl = fetch }) => {
  if (!apiBaseUrl) throw new Error('VITE_API_URL is required for the Phase 9 member read cutover.');
  const userFirebaseRetirement = readUserFirebaseAuthRetirementConfig();
  let headers = { Accept: 'application/json' };
  if (userFirebaseRetirement.requested) {
    const clerk = await clerkStagingClient.initialize();
    const token = await clerk?.session?.getToken?.();
    if (!token) throw new Error('Clerk sign-in is required for the PostgreSQL member read cutover.');
    headers = { ...headers, Authorization: `Bearer ${token}` };
  } else {
    if (!firebaseUser || typeof firebaseUser.getIdToken !== 'function') {
      throw new Error('Firebase sign-in is required for the Phase 9 member read cutover.');
    }
    const firebaseIdToken = await firebaseUser.getIdToken();
    headers = { ...headers, 'X-Firebase-Authorization': `Bearer ${firebaseIdToken}` };
  }
  const response = await fetchImpl(`${apiBaseUrl}/api/legacy/member-profile-cutover-candidate`, {
    method: 'GET',
    headers,
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
  if (!['postgresql-shadow', 'postgresql-authoritative'].includes(payload?.readCandidate?.source) || !payload?.readCandidate?.profile?.uid) {
    throw new Error('Backend returned an invalid PostgreSQL member read candidate.');
  }
  return Object.freeze({
    ...payload.readCandidate,
    profile: normalizeMemberProfileRead(payload.readCandidate.profile),
  });
};


export const requestMemberProfileFirestoreFallback = async ({ firebaseUser, apiBaseUrl, fetchImpl = fetch }) => {
  if (!firebaseUser || typeof firebaseUser.getIdToken !== 'function') {
    throw new Error('Firebase sign-in is required for the Phase 10 one-time Firestore fallback.');
  }
  if (!apiBaseUrl) throw new Error('VITE_API_URL is required for the Phase 10 one-time Firestore fallback.');
  const firebaseIdToken = await firebaseUser.getIdToken();
  const response = await fetchImpl(`${apiBaseUrl}/api/legacy/member-profile-firestore-fallback`, {
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
    const error = new Error(`One-time Firestore member fallback failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'member_profile_firestore_fallback_failed';
    throw error;
  }
  if (payload?.readFallback?.source !== 'firestore-one-time-fallback' || !payload?.readFallback?.profile?.uid) {
    throw new Error('Backend returned an invalid Phase 10 Firestore fallback profile.');
  }
  return Object.freeze({
    ...payload.readFallback,
    profile: normalizeMemberProfileRead(payload.readFallback.profile),
  });
};

export const loadMemberProfileWithoutFirestoreWatcher = async ({
  loadPostgresCandidate,
  loadFirestoreFallback,
}) => {
  if (typeof loadPostgresCandidate !== 'function' || typeof loadFirestoreFallback !== 'function') {
    throw new TypeError('Phase 10 member profile loaders are required.');
  }
  try {
    const candidate = await loadPostgresCandidate();
    if (!candidate?.profile) throw new Error('PostgreSQL member profile candidate is empty.');
    return Object.freeze({
      source: candidate.source || 'postgresql-shadow',
      profile: candidate.profile,
      equivalent: null,
      changedFields: [],
      fallbackReason: '',
      firestoreFallbackReads: 0,
    });
  } catch (candidateError) {
    try {
      const fallback = await loadFirestoreFallback();
      return Object.freeze({
        source: 'firestore-one-time-fallback',
        profile: fallback?.profile || null,
        equivalent: null,
        changedFields: [],
        fallbackReason: candidateError?.code || 'postgres-candidate-error',
        firestoreFallbackReads: 1,
      });
    } catch (fallbackError) {
      const error = new Error('PostgreSQL member profile and one-time Firestore fallback are both unavailable.');
      error.code = fallbackError?.code || 'member-profile-read-unavailable';
      error.candidateCode = candidateError?.code || 'postgres-candidate-error';
      error.firestoreFallbackReads = 1;
      throw error;
    }
  }
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
  return Object.freeze({ source: 'postgresql-authoritative', profile: postgresProfile, equivalent: true, changedFields: [], fallbackReason: '' });
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
