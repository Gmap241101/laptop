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
const USER_AUTH_TRANSITION_PENDING_MS = 15 * 60 * 1000;
const USER_AUTH_TRANSITION_COMPLETED_MS = 15 * 1000;

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
  return transition;
};

export const readUserAuthTransition = () => readStoredUserAuthTransition();

export const clearUserAuthTransition = () => {
  if (typeof window === 'undefined') return;
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
  return nextSession;
};

export const clearUserAuthSession = () => {
  clearStoredAuthSession(USER_AUTH_SESSION_KEY);
};
