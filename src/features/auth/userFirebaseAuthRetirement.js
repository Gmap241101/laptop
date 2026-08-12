import { readAccountLifecycleAuthorityConfig } from './accountLifecycleAuthority.js';
import { readFirebaseRuntimeRetirementConfig } from './firebaseRuntimeRetirement.js';

const SESSION_KEY = 'mk_user_firebase_auth_compatibility';
const EVENT_NAME = 'rental:user-firebase-auth-retirement';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readUserFirebaseAuthRetirementConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const enabled = staging && (
    bool(env?.VITE_USER_FIREBASE_AUTH_COMPATIBILITY_DISABLED) ||
    readFirebaseRuntimeRetirementConfig({ env, location }).requested
  );
  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryMode = trim(params.get('userFirebaseAuth')).toLowerCase();
  let sessionMode = '';

  try {
    if (queryMode === 'firebase') storage?.setItem?.(SESSION_KEY, 'firebase');
    else if (queryMode === 'clerk') storage?.setItem?.(SESSION_KEY, 'clerk');
    sessionMode = trim(storage?.getItem?.(SESSION_KEY)).toLowerCase();
  } catch {
    sessionMode = '';
  }

  const rollbackRequested = Boolean(enabled && (queryMode === 'firebase' || sessionMode === 'firebase'));
  const requested = Boolean(enabled && accountLifecycleRequested && !rollbackRequested);

  return Object.freeze({
    enabled,
    requested,
    rollbackRequested,
    forcedByAccountLifecycle: Boolean(requested && accountLifecycleRequested),
  });
};

export const createClerkPostgresqlUserPrincipal = ({
  uid,
  email = '',
  displayName = '',
} = {}) => {
  const normalizedUid = trim(uid);
  if (!normalizedUid) return null;
  const normalizedEmail = trim(email).toLowerCase();
  return Object.freeze({
    uid: normalizedUid,
    email: normalizedEmail,
    displayName: trim(displayName),
    emailVerified: true,
    providerId: 'clerk-postgresql',
    __mkAuthSource: 'clerk-postgresql',
    async getIdToken() { return ''; },
  });
};

export const isClerkPostgresqlUserPrincipal = (user) =>
  Boolean(user?.uid && user?.__mkAuthSource === 'clerk-postgresql');

let latestObservation = null;
export const publishUserFirebaseAuthRetirementObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};

export const getLatestUserFirebaseAuthRetirementObservation = () => latestObservation;

export const subscribeUserFirebaseAuthRetirementObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
