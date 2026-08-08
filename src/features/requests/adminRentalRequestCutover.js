const READ_SESSION_KEY = 'mk_admin_rental_request_postgres_read_test';
const WRITE_SESSION_KEY = 'mk_admin_rental_request_postgres_write_test';
const EVENT_NAME = 'rental:admin-rental-request-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readAdminRentalRequestCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const readEnabled = stagingEnabled && bool(env?.VITE_ADMIN_RENTAL_REQUEST_POSTGRES_READ_ENABLED);
  const writeEnabled = stagingEnabled && bool(env?.VITE_ADMIN_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRead = Boolean(readEnabled && params.get('adminRequestRead') === 'postgres');
  const queryWrite = Boolean(writeEnabled && params.get('adminRequestWrite') === 'postgres');
  let sessionRead = false;
  let sessionWrite = false;
  try {
    if (params.get('adminRequestRead') === 'firestore') storage?.removeItem?.(READ_SESSION_KEY);
    else if (queryRead) storage?.setItem?.(READ_SESSION_KEY, '1');
    if (params.get('adminRequestWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
    else if (queryWrite) storage?.setItem?.(WRITE_SESSION_KEY, '1');
    sessionRead = storage?.getItem?.(READ_SESSION_KEY) === '1';
    sessionWrite = storage?.getItem?.(WRITE_SESSION_KEY) === '1';
  } catch {
    sessionRead = false;
    sessionWrite = false;
  }
  return Object.freeze({
    readEnabled,
    writeEnabled,
    readRequested: Boolean(readEnabled && (queryRead || sessionRead)),
    writeRequested: Boolean(writeEnabled && (queryWrite || sessionWrite)),
    queryRead,
    queryWrite,
    sessionRead,
    sessionWrite,
  });
};

let latestObservation = null;
export const publishAdminRentalRequestCutoverObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};
export const getLatestAdminRentalRequestCutoverObservation = () => latestObservation;
export const subscribeAdminRentalRequestCutoverObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
