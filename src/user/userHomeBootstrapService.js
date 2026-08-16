import {
  primeSiteContentDomainPromise,
  readSiteContentCutoverConfig,
  SITE_CONTENT_DOMAINS,
} from '../features/content/siteContentCutover.js';

const HOME_BOOTSTRAP_CACHE_TTL_MS = 30_000;
let homeBootstrapCache = null;
let homeBootstrapPending = null;

const normalizeApiBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const preconnectedOrigins = new Set();
const preconnectOrigin = (value) => {
  if (typeof document === 'undefined') return;
  try {
    const origin = new URL(String(value || '').trim()).origin;
    if (!origin || preconnectedOrigins.has(origin)) return;
    preconnectedOrigins.add(origin);
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch { /* ignore invalid optional preconnect targets */ }
};

const getBootstrapPresentationAssets = (bootstrap) => {
  const siteDocument = bootstrap?.siteSettings?.documents?.find((item) => item.key === 'siteSettings/config');
  const siteSettings = siteDocument?.payload || {};
  const hero = (bootstrap?.home?.documents || [])
    .filter((item) => item.key?.startsWith('homeBanners/'))
    .map((item) => ({ ...item.payload, enabled: item.enabled !== false && item.payload?.enabled !== false, sortOrder: item.sortOrder ?? item.payload?.sortOrder, visibility: item.publicVisibility }))
    .filter((item) => item.enabled && item.placement === 'hero' && item.visibility?.active !== false)
    .sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0))[0] || null;
  const mobile = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)')?.matches;
  const heroUrl = String((mobile ? hero?.mobileImageUrl : '') || hero?.imageUrl || '').trim();
  const logoUrl = String((mobile ? siteSettings.mobileLogoImageUrl : '') || siteSettings.logoImageUrl || '').trim();
  return { heroUrl, logoUrl };
};

const warmImage = (url, { waitForDecode = false, timeoutMs = 0 } = {}) => {
  const source = String(url || '').trim();
  if (!source || typeof Image === 'undefined') return Promise.resolve();
  preconnectOrigin(source);
  const image = new Image();
  image.fetchPriority = 'high';
  image.decoding = 'async';
  const loaded = new Promise((resolve) => {
    image.onload = resolve;
    image.onerror = resolve;
  });
  image.src = source;
  if (!waitForDecode) return Promise.resolve();
  const decoded = loaded.then(async () => {
    if (typeof image.decode === 'function') await image.decode().catch(() => {});
  });
  if (!(timeoutMs > 0)) return decoded;
  return Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
};

const requestHomeBootstrap = async ({ fetchImpl = fetch } = {}) => {
  const config = readSiteContentCutoverConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  preconnectOrigin(apiBaseUrl);
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

export const preconnectUserHomeAuthority = () => {
  const config = readSiteContentCutoverConfig();
  if (config?.apiBaseUrl) preconnectOrigin(config.apiBaseUrl);
};

export const preloadCriticalUserHomeAssets = async (bootstrap, { timeoutMs = 1200 } = {}) => {
  const { heroUrl, logoUrl } = getBootstrapPresentationAssets(bootstrap);
  void warmImage(logoUrl);
  await warmImage(heroUrl, { waitForDecode: true, timeoutMs });
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
