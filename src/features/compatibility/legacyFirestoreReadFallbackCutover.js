import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';

const SESSION_KEY = 'mk_legacy_firestore_read_fallback_disabled';
const EVENT_NAME = 'rental:legacy-firestore-read-fallback';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readLegacyFirestoreReadFallbackConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const enabled = bool(env?.VITE_CLERK_STAGING_ENABLED) && (
    bool(env?.VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED) ||
    readFirebaseRuntimeRetirementConfig({ env, location }).requested
  );
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryDisabled = Boolean(enabled && params.get('legacyReadFallback') === 'off');
  let sessionDisabled = false;
  try {
    if (params.get('legacyReadFallback') === 'on') storage?.removeItem?.(SESSION_KEY);
    else if (queryDisabled) storage?.setItem?.(SESSION_KEY, '1');
    sessionDisabled = storage?.getItem?.(SESSION_KEY) === '1';
  } catch {
    sessionDisabled = false;
  }
  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  return Object.freeze({
    enabled,
    requested: Boolean(enabled && (queryDisabled || sessionDisabled || accountLifecycleRequested)),
    forcedByAccountLifecycle: Boolean(enabled && accountLifecycleRequested),
    queryDisabled,
    sessionDisabled,
  });
};

export const isLegacyFirestoreReadFallbackAllowed = (config = readLegacyFirestoreReadFallbackConfig()) =>
  !Boolean(config?.requested);

let latestObservation = null;
let blockedCount = 0;

export const publishLegacyFirestoreReadFallbackObservation = (detail = {}) => {
  latestObservation = Object.freeze({
    requested: Boolean(detail.requested),
    fallbackAllowed: !Boolean(detail.requested),
    blockedCount,
    ...detail,
    observedAt: new Date().toISOString(),
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};

export const recordLegacyFirestoreReadFallbackBlocked = (domain, reason = '') => {
  blockedCount += 1;
  const config = readLegacyFirestoreReadFallbackConfig();
  return publishLegacyFirestoreReadFallbackObservation({
    requested: config.requested,
    lastBlockedDomain: trim(domain),
    lastBlockedReason: trim(reason),
    blockedCount,
  });
};

export const getLatestLegacyFirestoreReadFallbackObservation = () => latestObservation;

export const subscribeLegacyFirestoreReadFallbackObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
