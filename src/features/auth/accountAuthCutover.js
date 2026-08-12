const ACCOUNT_RECOVERY_SESSION_KEY = 'mk_account_recovery_postgres_read';
const ADMIN_CLERK_AUTH_SESSION_KEY = 'mk_admin_clerk_auth_authority';
const EVENT_NAME = 'rental:account-auth-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readAccountAuthCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const accountRecoveryEnabled = staging && bool(env?.VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED);
  const adminClerkAuthEnabled = staging && bool(env?.VITE_ADMIN_CLERK_AUTH_ENABLED);
  // Phase 34 hard retirement: every administrator runtime uses Clerk/PostgreSQL.
  const adminClerkAuthorityRequired = staging;
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryAccountRecovery = accountRecoveryEnabled && params.get('accountRecovery') === 'postgres';
  const queryAdminClerk = adminClerkAuthEnabled && params.get('adminAuth') === 'clerk';
  let sessionAccountRecovery = false;
  let sessionAdminClerk = false;

  try {
    if (params.get('accountRecovery') === 'firestore') storage?.removeItem?.(ACCOUNT_RECOVERY_SESSION_KEY);
    else if (queryAccountRecovery) storage?.setItem?.(ACCOUNT_RECOVERY_SESSION_KEY, '1');

    if (params.get('adminAuth') === 'firebase') storage?.removeItem?.(ADMIN_CLERK_AUTH_SESSION_KEY);
    else if (queryAdminClerk) storage?.setItem?.(ADMIN_CLERK_AUTH_SESSION_KEY, '1');

    sessionAccountRecovery = storage?.getItem?.(ACCOUNT_RECOVERY_SESSION_KEY) === '1';
    sessionAdminClerk = storage?.getItem?.(ADMIN_CLERK_AUTH_SESSION_KEY) === '1';
  } catch { /* ignored */ }

  return Object.freeze({
    accountRecoveryEnabled,
    adminClerkAuthEnabled,
    adminClerkAuthorityRequired,
    accountRecoveryRequested: Boolean(accountRecoveryEnabled && (queryAccountRecovery || sessionAccountRecovery)),
    adminClerkAuthRequested: Boolean(
      adminClerkAuthorityRequired ||
      (adminClerkAuthEnabled && (queryAdminClerk || sessionAdminClerk))
    ),
  });
};

let latestObservation = null;

export const publishAccountAuthObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};

export const getLatestAccountAuthObservation = () => latestObservation;

export const subscribeAccountAuthObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
