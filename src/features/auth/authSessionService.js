import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';

import {
  normalizeSystemAdminSettings,
  normalizeUserSessionPolicy,
} from '../../utils/systemSettings.js';

const ADMIN_AUTH_SESSION_KEY = 'mk_laptop_admin_auth_session';
const USER_AUTH_SESSION_KEY = 'mk_laptop_user_auth_session';
const USER_AUTH_TRANSITION_KEY = 'mk_laptop_user_auth_transition';
const USER_AUTH_SESSION_TRACE_KEY = 'mk_laptop_user_auth_session_trace';
const USER_AUTH_SESSION_TRACE_EVENT = 'rental:user-auth-session-trace';
const USER_AUTH_TRANSITION_PENDING_MS = 15 * 60 * 1000;
const USER_AUTH_TRANSITION_COMPLETED_MS = 15 * 1000;
const USER_AUTH_SESSION_TRACE_LIMIT = 12;

export const createDefaultAdminAuthForm = () => ({
  adminLoginId: '',
  password: '',
  clientTrustCode: '',
  clientTrustRequired: false,
  clientTrustStrategy: '',
  clientTrustDestination: '',
  clientTrustMigration: '',
});

const createEmptyAuthSession = (identityKey) => ({
  [identityKey]: '',
  expiresAt: 0,
  absoluteExpiresAt: 0,
  policyVersion: 0,
  lastActivityAt: 0,
  logoutOnBrowserClose: true,
});

const clearStoredAuthSession = (storageKey) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(storageKey);
  window.localStorage.removeItem(storageKey);
};

const appendUserAuthSessionTrace = (event, detail = {}) => {
  if (typeof window === 'undefined') return [];
  if (String(import.meta.env?.VITE_CLERK_STAGING_ENABLED || '').toLowerCase() !== 'true') {
    return [];
  }
  const entry = {
    event: String(event || 'unknown'),
    reason: String(detail?.reason || ''),
    userId: String(detail?.userId || ''),
    route: window.location?.pathname || '',
    observedAt: new Date().toISOString(),
  };
  let current = [];
  try {
    current = JSON.parse(
      window.localStorage.getItem(USER_AUTH_SESSION_TRACE_KEY) || '[]'
    );
    if (!Array.isArray(current)) current = [];
  } catch {
    current = [];
  }
  const next = [...current, entry].slice(-USER_AUTH_SESSION_TRACE_LIMIT);
  window.localStorage.setItem(USER_AUTH_SESSION_TRACE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(USER_AUTH_SESSION_TRACE_EVENT, { detail: entry }));
  return next;
};

export const readUserAuthSessionTrace = () => {
  if (typeof window === 'undefined') return [];
  if (String(import.meta.env?.VITE_CLERK_STAGING_ENABLED || '').toLowerCase() !== 'true') {
    return [];
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(USER_AUTH_SESSION_TRACE_KEY) || '[]'
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const subscribeUserAuthSessionTrace = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') {
    return () => {};
  }
  const handler = () => listener(readUserAuthSessionTrace());
  window.addEventListener(USER_AUTH_SESSION_TRACE_EVENT, handler);
  return () => window.removeEventListener(USER_AUTH_SESSION_TRACE_EVENT, handler);
};

const readStoredAuthSession = (storageKey, identityKey) => {
  const emptySession = createEmptyAuthSession(identityKey);
  if (typeof window === 'undefined') return emptySession;

  const now = Date.now();
  const candidates = [
    [window.sessionStorage, true],
    [window.localStorage, false],
  ];
  let selected = null;

  candidates.forEach(([storage, sessionOnly]) => {
    const raw = storage.getItem(storageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const absoluteExpiresAt = Number(parsed?.absoluteExpiresAt || 0);
      const absoluteIsValid = absoluteExpiresAt === 0 || absoluteExpiresAt > now;
      const isValid =
        Boolean(parsed?.[identityKey]) &&
        Number(parsed?.expiresAt || 0) > now &&
        absoluteIsValid;

      if (!isValid) {
        storage.removeItem(storageKey);
        return;
      }

      const candidate = {
        ...emptySession,
        ...parsed,
        absoluteExpiresAt,
        logoutOnBrowserClose:
          typeof parsed.logoutOnBrowserClose === 'boolean'
            ? parsed.logoutOnBrowserClose
            : sessionOnly,
      };

      if (
        !selected ||
        Number(candidate.lastActivityAt || 0) >
          Number(selected.lastActivityAt || 0)
      ) {
        selected = candidate;
      }
    } catch {
      storage.removeItem(storageKey);
    }
  });

  return selected || emptySession;
};


const readStoredUserAuthTransition = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(USER_AUTH_TRANSITION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Number(parsed?.expiresAt || 0) || Number(parsed.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(USER_AUTH_TRANSITION_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(USER_AUTH_TRANSITION_KEY);
    return null;
  }
};

export const beginUserAuthTransition = ({ email = '', userId = '' } = {}) => {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  const transition = {
    status: 'pending',
    email: String(email || '').trim().toLowerCase(),
    userId: String(userId || '').trim(),
    startedAt: now,
    expiresAt: now + USER_AUTH_TRANSITION_PENDING_MS,
  };
  window.sessionStorage.setItem(USER_AUTH_TRANSITION_KEY, JSON.stringify(transition));
  appendUserAuthSessionTrace('transition-begin', { userId: transition.userId });
  return transition;
};

export const bindUserAuthTransitionIdentity = (userId) => {
  if (typeof window === 'undefined') return null;
  const current = readStoredUserAuthTransition();
  const now = Date.now();
  const transition = {
    ...(current || {}),
    status: 'pending',
    userId: String(userId || '').trim(),
    startedAt: Number(current?.startedAt || now),
    expiresAt: now + USER_AUTH_TRANSITION_PENDING_MS,
  };
  window.sessionStorage.setItem(USER_AUTH_TRANSITION_KEY, JSON.stringify(transition));
  appendUserAuthSessionTrace('transition-bind', { userId: transition.userId });
  return transition;
};

export const completeUserAuthTransition = (userId) => {
  if (typeof window === 'undefined') return null;
  const current = readStoredUserAuthTransition();
  const now = Date.now();
  const transition = {
    ...(current || {}),
    status: 'completed',
    userId: String(userId || current?.userId || '').trim(),
    completedAt: now,
    expiresAt: now + USER_AUTH_TRANSITION_COMPLETED_MS,
  };
  window.sessionStorage.setItem(USER_AUTH_TRANSITION_KEY, JSON.stringify(transition));
  appendUserAuthSessionTrace('transition-complete', { userId: transition.userId });
  return transition;
};

export const readUserAuthTransition = () => readStoredUserAuthTransition();

export const clearUserAuthTransition = (reason = 'explicit-clear') => {
  if (typeof window === 'undefined') return;
  const current = readStoredUserAuthTransition();
  appendUserAuthSessionTrace('transition-clear', {
    reason,
    userId: current?.userId || '',
  });
  window.sessionStorage.removeItem(USER_AUTH_TRANSITION_KEY);
};

const writeStoredAuthSession = (storageKey, session, logoutOnBrowserClose) => {
  if (typeof window === 'undefined') return;
  clearStoredAuthSession(storageKey);
  const storage = logoutOnBrowserClose
    ? window.sessionStorage
    : window.localStorage;
  storage.setItem(storageKey, JSON.stringify(session));
};

export const configureFirebaseAuthPersistence = async (
  authInstance,
  logoutOnBrowserClose
) => {
  await setPersistence(
    authInstance,
    logoutOnBrowserClose
      ? browserSessionPersistence
      : browserLocalPersistence
  );
};

export const readAdminAuthSession = () =>
  readStoredAuthSession(ADMIN_AUTH_SESSION_KEY, 'adminId');

export const saveAdminAuthSession = (
  adminId,
  securitySettings = {},
  previousSession = null
) => {
  const normalized = normalizeSystemAdminSettings(securitySettings);
  const now = Date.now();
  const idleDurationMs = normalized.adminIdleTimeoutMinutes * 60 * 1000;
  const absoluteDurationMs =
    normalized.adminAbsoluteTimeoutHours > 0
      ? normalized.adminAbsoluteTimeoutHours * 60 * 60 * 1000
      : 0;
  const previousAbsoluteExpiresAt = Number(
    previousSession?.absoluteExpiresAt || 0
  );
  const absoluteExpiresAt =
    absoluteDurationMs === 0
      ? 0
      : previousAbsoluteExpiresAt > now
        ? previousAbsoluteExpiresAt
        : now + absoluteDurationMs;
  const idleExpiresAt = now + idleDurationMs;
  const nextSession = {
    adminId,
    lastActivityAt: now,
    expiresAt:
      absoluteExpiresAt > 0
        ? Math.min(idleExpiresAt, absoluteExpiresAt)
        : idleExpiresAt,
    absoluteExpiresAt,
    policyVersion: normalized.adminSecurityPolicyVersion,
    logoutOnBrowserClose: normalized.adminLogoutOnBrowserClose,
  };

  writeStoredAuthSession(
    ADMIN_AUTH_SESSION_KEY,
    nextSession,
    normalized.adminLogoutOnBrowserClose
  );
  return nextSession;
};

export const clearAdminAuthSession = () => {
  clearStoredAuthSession(ADMIN_AUTH_SESSION_KEY);
};

export const readUserAuthSession = () =>
  readStoredAuthSession(USER_AUTH_SESSION_KEY, 'userId');

export const saveUserAuthSession = (
  userId,
  policy = {},
  previousSession = null
) => {
  const normalized = normalizeUserSessionPolicy(policy);
  const now = Date.now();
  const idleDurationMs = normalized.userIdleTimeoutMinutes * 60 * 1000;
  const absoluteDurationMs =
    normalized.userAbsoluteTimeoutHours > 0
      ? normalized.userAbsoluteTimeoutHours * 60 * 60 * 1000
      : 0;
  const previousAbsoluteExpiresAt = Number(
    previousSession?.absoluteExpiresAt || 0
  );
  const absoluteExpiresAt =
    absoluteDurationMs === 0
      ? 0
      : previousAbsoluteExpiresAt > now
        ? previousAbsoluteExpiresAt
        : now + absoluteDurationMs;
  const idleExpiresAt = now + idleDurationMs;
  const nextSession = {
    userId,
    lastActivityAt: now,
    expiresAt:
      absoluteExpiresAt > 0
        ? Math.min(idleExpiresAt, absoluteExpiresAt)
        : idleExpiresAt,
    absoluteExpiresAt,
    policyVersion: normalized.userSecurityPolicyVersion,
    logoutOnBrowserClose: normalized.userLogoutOnBrowserClose,
  };

  writeStoredAuthSession(
    USER_AUTH_SESSION_KEY,
    nextSession,
    normalized.userLogoutOnBrowserClose
  );
  appendUserAuthSessionTrace('session-save', { userId });
  return nextSession;
};

export const clearUserAuthSession = (reason = 'unspecified') => {
  const current = readUserAuthSession();
  appendUserAuthSessionTrace('session-clear', {
    reason,
    userId: current.userId || '',
  });
  clearStoredAuthSession(USER_AUTH_SESSION_KEY);
};
