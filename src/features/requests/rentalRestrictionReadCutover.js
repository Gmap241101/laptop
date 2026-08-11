import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';

const EVENT_NAME = 'rental:rental-restriction-read-cutover';
const WRITE_EVENT_NAME = 'rental:rental-restriction-write-through';
const SESSION_KEY = 'mk_rental_restriction_postgres_read_test';
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

export const readRentalRestrictionCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const enabled = bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRequested = Boolean(enabled && params.get('restrictionRead') === 'postgres' && params.get('restrictionWatcher') === 'off');
  let sessionRequested = false;
  try {
    if (params.get('restrictionRead') === 'firestore') storage?.removeItem?.(SESSION_KEY);
    else if (queryRequested) storage?.setItem?.(SESSION_KEY, '1');
    sessionRequested = storage?.getItem?.(SESSION_KEY) === '1';
  } catch {
    sessionRequested = false;
  }
  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  return Object.freeze({
    enabled,
    requested: Boolean(enabled && (queryRequested || sessionRequested || accountLifecycleRequested)),
    forcedByAccountLifecycle: Boolean(enabled && accountLifecycleRequested),
    queryRequested,
    sessionRequested,
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

const firebaseRequest = async ({ firebaseUser, apiBaseUrl, path, method = 'GET', fetchImpl = fetch }) => {
  if (!firebaseUser || typeof firebaseUser.getIdToken !== 'function') throw new Error('Firebase sign-in is required.');
  if (!apiBaseUrl) throw new Error('VITE_API_URL is required.');
  const token = await firebaseUser.getIdToken();
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method,
    headers: { Accept: 'application/json', 'X-Firebase-Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(`Rental restriction request failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'rental_restriction_request_failed';
    throw error;
  }
  return payload;
};

export const requestRentalRestrictionCandidate = async ({ firebaseUser, apiBaseUrl, fetchImpl = fetch }) => {
  const payload = await firebaseRequest({ firebaseUser, apiBaseUrl, path: '/api/legacy/rental-restriction-candidate', fetchImpl });
  const source = trim(payload?.restrictionCandidate?.source);
  if (!['postgresql-shadow', 'postgresql-authoritative'].includes(source)) {
    throw new Error('Invalid PostgreSQL rental restriction candidate.');
  }
  return Object.freeze(payload.restrictionCandidate);
};

export const requestRentalRestrictionFallback = async ({ firebaseUser, apiBaseUrl, fetchImpl = fetch }) => {
  const payload = await firebaseRequest({ firebaseUser, apiBaseUrl, path: '/api/legacy/rental-restriction-firestore-fallback', fetchImpl });
  if (payload?.restrictionFallback?.source !== 'firestore-one-time-fallback') throw new Error('Invalid Firestore rental restriction fallback.');
  return Object.freeze(payload.restrictionFallback);
};

export const loadRentalRestrictionWithoutFirestoreWatcher = async ({ loadCandidate, loadFallback }) => {
  try {
    const candidate = await loadCandidate();
    return Object.freeze({
      restriction: candidate.exists ? candidate.restriction : null,
      source: candidate.source || 'postgresql-shadow',
      firestoreFallbackReads: 0,
      fallbackReason: '',
    });
  } catch (candidateError) {
    const fallback = await loadFallback();
    return Object.freeze({
      restriction: fallback.exists ? fallback.restriction : null,
      source: 'firestore-one-time-fallback',
      firestoreFallbackReads: 1,
      fallbackReason: candidateError?.code || 'restriction-candidate-unavailable',
    });
  }
};

let latestObservation = null;
export const publishRentalRestrictionCutoverObservation = (detail) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestRentalRestrictionCutoverObservation = () => latestObservation;
export const subscribeRentalRestrictionCutoverObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

let latestWriteObservation = null;
let writeCounters = { attempted: 0, synced: 0, failed: 0 };
export const syncRentalRestrictionWriteThroughBestEffort = async ({
  firebaseUser,
  firebaseUid = '',
  reason = 'rental-restriction-write',
  env = import.meta.env,
  fetchImpl = fetch,
} = {}) => {
  const enabled = bool(env?.VITE_CLERK_STAGING_ENABLED) && bool(env?.VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED);
  const targetUid = trim(firebaseUid) || trim(firebaseUser?.uid);
  if (!enabled) return Object.freeze({ attempted: false, status: 'disabled', reason, firebaseUid: targetUid });
  const apiBaseUrl = normalizeApiBaseUrl(env?.VITE_API_URL);
  writeCounters = { ...writeCounters, attempted: writeCounters.attempted + 1 };
  try {
    const query = targetUid ? `?firebaseUid=${encodeURIComponent(targetUid)}` : '';
    const payload = await firebaseRequest({ firebaseUser, apiBaseUrl, path: `/api/legacy/rental-restriction-shadow/write-through${query}`, method: 'POST', fetchImpl });
    const result = payload?.restrictionWriteThrough;
    if (!result?.firebaseUid) throw new Error('Invalid rental restriction write-through response.');
    writeCounters = { ...writeCounters, synced: writeCounters.synced + 1 };
    const detail = Object.freeze({ attempted: true, status: 'synced', reason, firebaseUid: result.firebaseUid, counters: Object.freeze({ ...writeCounters }), observedAt: new Date().toISOString() });
    latestWriteObservation = detail;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WRITE_EVENT_NAME, { detail }));
    return detail;
  } catch (error) {
    writeCounters = { ...writeCounters, failed: writeCounters.failed + 1 };
    console.warn('Rental restriction Firestore write succeeded, but PostgreSQL shadow synchronization failed.', { reason, firebaseUid: targetUid, code: error?.code, status: error?.status });
    const detail = Object.freeze({ attempted: true, status: 'failed', reason, firebaseUid: targetUid, errorCode: error?.code || 'rental_restriction_write_through_failed', counters: Object.freeze({ ...writeCounters }), observedAt: new Date().toISOString() });
    latestWriteObservation = detail;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WRITE_EVENT_NAME, { detail }));
    return detail;
  }
};

export const getLatestRentalRestrictionWriteThroughObservation = () => latestWriteObservation;
export const subscribeRentalRestrictionWriteThroughObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(WRITE_EVENT_NAME, handler);
  return () => window.removeEventListener(WRITE_EVENT_NAME, handler);
};
