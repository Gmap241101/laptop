import { readAccountLifecycleAuthorityConfig } from './accountLifecycleAuthority.js';
import { readFirebaseRuntimeRetirementConfig } from './firebaseRuntimeRetirement.js';

const USER_AUTH_SESSION_KEY = 'mk_user_clerk_auth_authority';
const USER_LIFECYCLE_SESSION_KEY = 'mk_user_clerk_lifecycle_authority';
const EVENT_NAME = 'rental:user-account-lifecycle-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readUserAccountLifecycleCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig({ env, location }).requested;
  const authEnabled = staging && (bool(env?.VITE_USER_CLERK_AUTH_ENABLED) || firebaseRuntimeRetired);
  const lifecycleEnabled = staging && (bool(env?.VITE_USER_CLERK_LIFECYCLE_ENABLED) || firebaseRuntimeRetired);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryAuth = authEnabled && params.get('userAuth') === 'clerk';
  const queryLifecycle = lifecycleEnabled && params.get('userLifecycle') === 'clerk';
  let sessionAuth = false;
  let sessionLifecycle = false;

  try {
    if (params.get('userAuth') === 'firebase') storage?.removeItem?.(USER_AUTH_SESSION_KEY);
    else if (queryAuth) storage?.setItem?.(USER_AUTH_SESSION_KEY, '1');
    if (params.get('userLifecycle') === 'firebase') storage?.removeItem?.(USER_LIFECYCLE_SESSION_KEY);
    else if (queryLifecycle) storage?.setItem?.(USER_LIFECYCLE_SESSION_KEY, '1');
    sessionAuth = storage?.getItem?.(USER_AUTH_SESSION_KEY) === '1';
    sessionLifecycle = storage?.getItem?.(USER_LIFECYCLE_SESSION_KEY) === '1';
  } catch { /* ignored */ }

  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  return Object.freeze({
    userAuthEnabled: authEnabled,
    userLifecycleEnabled: lifecycleEnabled,
    userAuthRequested: Boolean(authEnabled && (queryAuth || sessionAuth || accountLifecycleRequested)),
    userLifecycleRequested: Boolean(lifecycleEnabled && (queryLifecycle || sessionLifecycle || accountLifecycleRequested)),
    forcedByAccountLifecycle: Boolean(accountLifecycleRequested),
  });
};

let latestObservation = null;
export const publishUserAccountLifecycleObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestUserAccountLifecycleObservation = () => latestObservation;
export const subscribeUserAccountLifecycleObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
