import { readAccountLifecycleAuthorityConfig } from '../auth/accountLifecycleAuthority.js';

const MEMBER_SESSION_KEY = 'mk_member_postgres_write_authority';
const RESTRICTION_SESSION_KEY = 'mk_restriction_postgres_write_authority';
const ADMIN_REGISTRY_SESSION_KEY = 'mk_admin_identity_registry_test';
const EVENT_NAME = 'rental:member-authority-cutover';
const trim = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim());
const bool = (value) => trim(value).toLowerCase() === 'true';

export const readMemberAuthorityCutoverConfig = ({ env = import.meta.env, location = globalThis.location, storage = globalThis.sessionStorage } = {}) => {
  const staging = bool(env?.VITE_CLERK_STAGING_ENABLED);
  const memberEnabled = staging && bool(env?.VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED);
  const restrictionEnabled = staging && bool(env?.VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED);
  const adminRegistryEnabled = staging && bool(env?.VITE_ADMIN_IDENTITY_REGISTRY_ENABLED);
  const params = location ? new URLSearchParams(location.search || '') : new URLSearchParams();
  const queryMember = memberEnabled && params.get('memberWrite') === 'postgres';
  const queryRestriction = restrictionEnabled && params.get('restrictionWrite') === 'postgres';
  const queryAdminRegistry = adminRegistryEnabled && params.get('adminIdentity') === 'postgres';
  let sessionMember = false; let sessionRestriction = false; let sessionAdminRegistry = false;
  try {
    if (params.get('memberWrite') === 'firestore') storage?.removeItem?.(MEMBER_SESSION_KEY); else if (queryMember) storage?.setItem?.(MEMBER_SESSION_KEY, '1');
    if (params.get('restrictionWrite') === 'firestore') storage?.removeItem?.(RESTRICTION_SESSION_KEY); else if (queryRestriction) storage?.setItem?.(RESTRICTION_SESSION_KEY, '1');
    if (params.get('adminIdentity') === 'firestore') storage?.removeItem?.(ADMIN_REGISTRY_SESSION_KEY); else if (queryAdminRegistry) storage?.setItem?.(ADMIN_REGISTRY_SESSION_KEY, '1');
    sessionMember = storage?.getItem?.(MEMBER_SESSION_KEY) === '1';
    sessionRestriction = storage?.getItem?.(RESTRICTION_SESSION_KEY) === '1';
    sessionAdminRegistry = storage?.getItem?.(ADMIN_REGISTRY_SESSION_KEY) === '1';
  } catch { /* ignored */ }
  const accountLifecycleRequested = readAccountLifecycleAuthorityConfig({ env, location, storage }).requested;
  return Object.freeze({
    memberEnabled, restrictionEnabled, adminRegistryEnabled,
    memberRequested: Boolean(memberEnabled && (queryMember || sessionMember || accountLifecycleRequested)),
    restrictionRequested: Boolean(restrictionEnabled && (queryRestriction || sessionRestriction || accountLifecycleRequested)),
    forcedByAccountLifecycle: Boolean(accountLifecycleRequested),
    adminRegistryRequested: Boolean(adminRegistryEnabled && (queryAdminRegistry || sessionAdminRegistry)),
  });
};

let latestObservation = null;
export const publishMemberAuthorityObservation = (detail = {}) => {
  latestObservation = Object.freeze({ ...detail, observedAt: new Date().toISOString() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: latestObservation }));
  return latestObservation;
};
export const getLatestMemberAuthorityObservation = () => latestObservation;
export const subscribeMemberAuthorityObservation = (listener) => {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
  const handler = (event) => listener(event.detail || null);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
