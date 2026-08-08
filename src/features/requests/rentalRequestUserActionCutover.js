const WRITE_SESSION_KEY = 'mk_rental_request_user_action_postgres_write_test';
const EVENT_NAME = 'rental:rental-request-user-action-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readRentalRequestUserActionCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const writeEnabled = stagingEnabled && bool(env?.VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRequested = Boolean(writeEnabled && params.get('rentalRequestActionWrite') === 'postgres');
  let sessionRequested = false;
  try {
    if (params.get('rentalRequestActionWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
    else if (queryRequested) storage?.setItem?.(WRITE_SESSION_KEY, '1');
    sessionRequested = storage?.getItem?.(WRITE_SESSION_KEY) === '1';
  } catch {
    sessionRequested = false;
  }
  return Object.freeze({
    enabled: writeEnabled,
    requested: Boolean(writeEnabled && (queryRequested || sessionRequested)),
    queryRequested,
    sessionRequested,
  });
};

let latestObservation = null;
export const publishRentalRequestUserActionObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestRentalRequestUserActionObservation = () => latestObservation;
export const subscribeRentalRequestUserActionObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
