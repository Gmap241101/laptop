const READ_SESSION_KEY = 'mk_asset_postgres_read_test';
const WRITE_SESSION_KEY = 'mk_asset_postgres_write_test';
const EVENT_NAME = 'rental:asset-domain-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readAssetDomainCutoverConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const stagingEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const firebaseRuntimeRetired = readFirebaseRuntimeRetirementConfig({ env, location }).requested;
  const readEnabled = stagingEnabled && (bool(env?.VITE_ASSET_POSTGRES_READ_ENABLED) || firebaseRuntimeRetired);
  const writeEnabled = stagingEnabled && (bool(env?.VITE_ASSET_POSTGRES_WRITE_ENABLED) || firebaseRuntimeRetired);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryRead = Boolean(readEnabled && params.get('assetRead') === 'postgres');
  const queryWrite = Boolean(writeEnabled && params.get('assetWrite') === 'postgres');
  let sessionRead = false;
  let sessionWrite = false;
  try {
    if (params.get('assetRead') === 'firestore') storage?.removeItem?.(READ_SESSION_KEY);
    else if (queryRead) storage?.setItem?.(READ_SESSION_KEY, '1');
    if (params.get('assetWrite') === 'firestore') storage?.removeItem?.(WRITE_SESSION_KEY);
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
    readRequested: Boolean(firebaseRuntimeRetired || (readEnabled && (queryRead || sessionRead))),
    writeRequested: Boolean(firebaseRuntimeRetired || (writeEnabled && (queryWrite || sessionWrite))),
    queryRead,
    queryWrite,
    sessionRead,
    sessionWrite,
  });
};

let latestObservation = null;
export const publishAssetDomainCutoverObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  }
  return latestObservation;
};
export const getLatestAssetDomainCutoverObservation = () => latestObservation;
export const subscribeAssetDomainCutoverObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
import { readFirebaseRuntimeRetirementConfig } from '../auth/firebaseRuntimeRetirement.js';
