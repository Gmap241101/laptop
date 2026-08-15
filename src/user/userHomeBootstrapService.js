import {
  primeSiteContentDomainPromise,
  readSiteContentCutoverConfig,
  SITE_CONTENT_DOMAINS,
} from '../features/content/siteContentCutover.js';

const HOME_BOOTSTRAP_CACHE_TTL_MS = 30_000;
let homeBootstrapCache = null;
let homeBootstrapPending = null;

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const requestHomeBootstrap = async ({ fetchImpl = fetch } = {}) => {
  const config = readSiteContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.readEnabled || !apiBaseUrl) {
    const error = new Error('User home PostgreSQL bootstrap authority is unavailable.');
    error.code = 'user_home_bootstrap_authority_unavailable';
    throw error;
  }
  const response = await fetchImpl(`${apiBaseUrl}/api/user/home-bootstrap`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(`User home bootstrap read failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error || 'user_home_bootstrap_read_failed';
    throw error;
  }
  const bootstrap = payload?.userHomeBootstrap;
  if (
    bootstrap?.source !== 'postgresql' ||
    bootstrap?.siteSettings?.source !== 'postgresql' ||
    bootstrap?.home?.source !== 'postgresql' ||
    !Array.isArray(bootstrap?.siteSettings?.documents) ||
    !Array.isArray(bootstrap?.home?.documents)
  ) {
    const error = new Error('Backend returned an invalid user home bootstrap response.');
    error.code = 'user_home_bootstrap_payload_invalid';
    throw error;
  }
  return Object.freeze({
    source: 'postgresql',
    siteSettings: bootstrap.siteSettings,
    home: bootstrap.home,
  });
};

export const getCachedUserHomeBootstrap = () => {
  if (!homeBootstrapCache) return null;
  if (Date.now() >= homeBootstrapCache.expiresAt) {
    homeBootstrapCache = null;
    return null;
  }
  return homeBootstrapCache.value;
};

export const preloadUserHomeBootstrap = ({ force = false } = {}) => {
  const cached = force ? null : getCachedUserHomeBootstrap();
  if (cached) return Promise.resolve(cached);
  if (!force && homeBootstrapPending) return homeBootstrapPending;

  const pending = requestHomeBootstrap();
  homeBootstrapPending = pending
    .then((value) => {
      homeBootstrapCache = {
        value,
        expiresAt: Date.now() + HOME_BOOTSTRAP_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      homeBootstrapPending = null;
    });

  const siteSettingsPromise = homeBootstrapPending.then((value) => value.siteSettings);
  const homePromise = homeBootstrapPending.then((value) => value.home);
  void primeSiteContentDomainPromise(SITE_CONTENT_DOMAINS.SITE_SETTINGS, siteSettingsPromise).catch(() => {});
  void primeSiteContentDomainPromise(SITE_CONTENT_DOMAINS.HOME, homePromise).catch(() => {});

  return homeBootstrapPending;
};
