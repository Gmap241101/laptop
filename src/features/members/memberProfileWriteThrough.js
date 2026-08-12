const EVENT_NAME = 'rental:member-profile-write-through';
const SESSION_KEY = 'mk_member_profile_write_through_test';
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

export const readMemberProfileWriteThroughConfig = ({
  env = import.meta.env,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) => {
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const stagingBridgeEnabled = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const postgresReadEnabled = bool(env?.VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED);
  const watcherDisabledEnabled = bool(env?.VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED);
  const writeThroughEnabled = bool(env?.VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED);
  const enabled = stagingBridgeEnabled && postgresReadEnabled && watcherDisabledEnabled && writeThroughEnabled;
  const queryRequested = Boolean(
    enabled &&
    params.get('memberRead') === 'postgres' &&
    params.get('memberWatcher') === 'off' &&
    params.get('memberWriteThrough') === 'on'
  );

  let sessionRequested = false;
  try {
    if (queryRequested) storage?.setItem?.(SESSION_KEY, '1');
    sessionRequested = storage?.getItem?.(SESSION_KEY) === '1';
  } catch {
    sessionRequested = false;
  }

  return Object.freeze({
    enabled,
    requested: Boolean(enabled && (queryRequested || sessionRequested)),
    queryRequested,
    sessionRequested,
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL),
  });
};

export const requestMemberProfileWriteThrough = async () => { const error = new Error('Legacy Firebase member write-through was removed in Phase 34.'); error.code='firebase_runtime_removed'; error.status=410; throw error; };

export const syncMemberProfileWriteThroughBestEffort = async ({
  firebaseUser,
  firebaseUid = '',
  reason = 'member-profile-write',
  config = readMemberProfileWriteThroughConfig(),
  fetchImpl = fetch,
} = {}) => {
  const targetUid = trim(firebaseUid) || trim(firebaseUser?.uid);
  if (!config?.requested) {
    return Object.freeze({ attempted: false, status: 'disabled', reason: 'write-through-not-requested', firebaseUid: targetUid });
  }
  if (!firebaseUser || typeof firebaseUser.getIdToken !== 'function') {
    return publishObservation({ attempted: true, status: 'failed', reason, firebaseUid: targetUid, errorCode: 'firebase-user-missing' });
  }

  try {
    const result = await requestMemberProfileWriteThrough({
      firebaseUser,
      firebaseUid: targetUid,
      apiBaseUrl: config.apiBaseUrl,
      fetchImpl,
    });
    return publishObservation({
      attempted: true,
      status: result.status,
      reason,
      firebaseUid: result.firebaseUid,
      backendReason: result.reason || '',
      errorCode: '',
    });
  } catch (error) {
    console.warn('Member profile Firestore write succeeded, but PostgreSQL shadow write-through failed.', {
      reason,
      firebaseUid: targetUid,
      code: error?.code,
      status: error?.status,
    });
    return publishObservation({
      attempted: true,
      status: 'failed',
      reason,
      firebaseUid: targetUid,
      backendReason: '',
      errorCode: error?.code || 'member_write_through_failed',
    });
  }
};

export const syncMemberProfilesWriteThroughBestEffort = async ({
  firebaseUser,
  firebaseUids = [],
  reason = 'member-profile-bulk-write',
  config = readMemberProfileWriteThroughConfig(),
  fetchImpl = fetch,
} = {}) => {
  const uniqueUids = Array.from(new Set((firebaseUids || []).map(trim).filter(Boolean)));
  const results = [];
  for (const firebaseUid of uniqueUids) {
    results.push(await syncMemberProfileWriteThroughBestEffort({
      firebaseUser,
      firebaseUid,
      reason,
      config,
      fetchImpl,
    }));
  }
  return results;
};

export const getLatestMemberProfileWriteThroughObservation = () => latestObservation;

export const subscribeMemberProfileWriteThroughObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
