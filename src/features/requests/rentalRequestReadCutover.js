import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';
import {
  compareRentalRequestReads,
  normalizeRentalRequestRead,
} from './rentalRequestReadParity.js';

const EVENT_NAME = 'rental:rental-request-read-cutover';
const READ_SESSION_KEY = 'mk_rental_request_postgres_read_test';
const WATCHER_SESSION_KEY = 'mk_rental_request_watcher_off_test';
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

export const readRentalRequestCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingBridgeEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig({ env, location }).requested;
  const postgresReadEnabled = bool(env?.VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED) || firebaseRuntimeRetired;
  const firestoreWatcherDisableEnabled = bool(
    env?.VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED,
  ) || firebaseRuntimeRetired;
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const enabled = stagingBridgeEnabled && postgresReadEnabled;
  const queryRequested = Boolean(
    enabled && params.get('rentalRequestRead') === 'postgres',
  );
  const queryWatcherDisabled = Boolean(
    queryRequested &&
      firestoreWatcherDisableEnabled &&
      params.get('rentalRequestWatcher') === 'off',
  );

  let sessionRequested = false;
  let sessionWatcherDisabled = false;
  try {
    if (params.get('rentalRequestRead') === 'firestore') {
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
      (queryWatcherDisabled || sessionWatcherDisabled || accountLifecycleRequested),
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

export const shouldUseRentalRequestFirestoreWatcher = (config) =>
  !Boolean(config?.firestoreWatcherDisabled);

const normalizeCandidateRequests = (requests) =>
  (Array.isArray(requests) ? requests : [])
    .map(normalizeRentalRequestRead)
    .filter(Boolean);

export const readRentalRequestCandidatePayload = (payload) => {
  const source = trim(payload?.rentalRequestCandidate?.source);
  const supportedSource = source === 'postgresql-authoritative';
  if (
    !payload?.authenticated ||
    !supportedSource ||
    !Array.isArray(payload?.rentalRequestCandidate?.requests)
  ) {
    const error = new Error('Backend returned an invalid rental request read candidate.');
    error.code = 'rental_request_candidate_invalid';
    throw error;
  }

  return Object.freeze({
    source,
    authoritative: source === 'postgresql-authoritative' || Boolean(payload.rentalRequestCandidate.authoritative),
    requests: normalizeCandidateRequests(payload.rentalRequestCandidate.requests),
    count: Number(payload.rentalRequestCandidate.count) || 0,
    sourceHash: trim(payload.rentalRequestCandidate.sourceHash),
    shadowSyncedAt: trim(payload.rentalRequestCandidate.shadowSyncedAt),
    sourceRefreshes: 0,
  });
};

export const chooseRentalRequestReadSource = ({
  firestoreRequests,
  postgresRequests,
  requested,
}) => {
  const normalizedFirestore = normalizeCandidateRequests(firestoreRequests);

  if (!requested) {
    return Object.freeze({
      source: 'firestore-onSnapshot',
      requests: normalizedFirestore,
      equivalent: null,
      changedRequestIds: [],
      changedFields: [],
      fallbackReason: 'cutover-not-requested',
    });
  }

  if (!Array.isArray(postgresRequests)) {
    return Object.freeze({
      source: 'firestore-onSnapshot',
      requests: normalizedFirestore,
      equivalent: false,
      changedRequestIds: [],
      changedFields: ['postgresCandidateMissing'],
      fallbackReason: 'postgres-candidate-unavailable',
    });
  }

  const normalizedPostgres = normalizeCandidateRequests(postgresRequests);
  const comparison = compareRentalRequestReads(
    normalizedFirestore,
    normalizedPostgres,
  );

  if (!comparison.equivalent) {
    return Object.freeze({
      source: 'firestore-onSnapshot',
      requests: normalizedFirestore,
      equivalent: false,
      changedRequestIds: comparison.changedRequestIds,
      changedFields: comparison.changedFields,
      fallbackReason: 'rental-request-mismatch',
    });
  }

  return Object.freeze({
    source: 'postgresql-authoritative',
    requests: normalizedPostgres,
    equivalent: true,
    changedRequestIds: [],
    changedFields: [],
    fallbackReason: '',
  });
};

export const loadRentalRequestsWithoutFirestoreWatcher = async ({
  loadPostgresCandidate,
  loadFirestoreFallback,
  allowFirestoreFallback = true,
}) => {
  if (typeof loadPostgresCandidate !== 'function') {
    throw new TypeError('Phase 15 PostgreSQL rental request loader is required.');
  }
  if (allowFirestoreFallback && typeof loadFirestoreFallback !== 'function') {
    throw new TypeError('Phase 15 Firestore fallback loader is required when fallback is enabled.');
  }

  try {
    const candidate = await loadPostgresCandidate();
    if (!candidate || !Array.isArray(candidate.requests)) {
      const error = new Error('PostgreSQL rental request candidate is unavailable.');
      error.code = 'rental_request_candidate_unavailable';
      throw error;
    }
    return Object.freeze({
      source: candidate.source || 'postgresql-authoritative',
      requests: normalizeCandidateRequests(candidate.requests),
      equivalent: Number(candidate.sourceRefreshes) > 0 ? true : null,
      changedRequestIds: [],
      changedFields: [],
      fallbackReason: '',
      firestoreFallbackReads: 0,
      shadowSyncedAt: trim(candidate.shadowSyncedAt),
      sourceRefreshes: Number(candidate.sourceRefreshes) || 0,
    });
  } catch (candidateError) {
    if (!allowFirestoreFallback) {
      const error = new Error('PostgreSQL rental requests are unavailable and legacy Firestore fallback is disabled.');
      error.code = candidateError?.code || 'rental-request-postgres-unavailable';
      error.candidateCode = candidateError?.code || 'rental-request-candidate-unavailable';
      error.firestoreFallbackReads = 0;
      throw error;
    }
    try {
      const fallback = await loadFirestoreFallback();
      const fallbackRequests = Array.isArray(fallback?.requests)
        ? fallback.requests
        : [];
      return Object.freeze({
        source: 'firestore-one-time-fallback',
        requests: normalizeCandidateRequests(fallbackRequests),
        equivalent: null,
        changedRequestIds: [],
        changedFields: [],
        fallbackReason:
          candidateError?.code || 'rental-request-candidate-unavailable',
        firestoreFallbackReads:
          Number(fallback?.firestoreFallbackReads) || 1,
        shadowSyncedAt: '',
        sourceRefreshes: 0,
      });
    } catch (fallbackError) {
      const error = new Error(
        'PostgreSQL rental requests and one-time Firestore fallback are both unavailable.',
      );
      error.code =
        fallbackError?.code || 'rental-request-read-unavailable';
      error.candidateCode =
        candidateError?.code || 'rental-request-candidate-unavailable';
      error.firestoreFallbackReads =
        Number(fallbackError?.firestoreFallbackReads) || 1;
      throw error;
    }
  }
};

let latestObservation = null;

export const publishRentalRequestCutoverObservation = (detail) => {
  latestObservation = Object.freeze({
    ...detail,
    observedAt: new Date().toISOString(),
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: latestObservation }),
    );
  }
  return latestObservation;
};

export const getLatestRentalRequestCutoverObservation = () => latestObservation;

export const subscribeRentalRequestCutoverObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
