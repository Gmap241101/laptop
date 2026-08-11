import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';

const WRITE_SESSION_KEY = 'mk_rental_request_postgres_write_test';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readRentalRequestWriteCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingBridgeEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const postgresWriteEnabled = bool(env?.VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const enabled = stagingBridgeEnabled && postgresWriteEnabled;
  const queryRequested = Boolean(enabled && params.get('rentalRequestWrite') === 'postgres');
  let sessionRequested = false;

  try {
    if (params.get('rentalRequestWrite') === 'firestore') {
      storage?.removeItem?.(WRITE_SESSION_KEY);
    } else if (queryRequested) {
      storage?.setItem?.(WRITE_SESSION_KEY, '1');
    }
    sessionRequested = storage?.getItem?.(WRITE_SESSION_KEY) === '1';
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
  });
};

let latestWriteObservation = null;
const EVENT_NAME = 'rental:rental-request-write-cutover';

export const publishRentalRequestWriteObservation = (detail = {}) => {
  latestWriteObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestWriteObservation }));
  }
  return latestWriteObservation;
};

export const getLatestRentalRequestWriteObservation = () => latestWriteObservation;

export const subscribeRentalRequestWriteObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
