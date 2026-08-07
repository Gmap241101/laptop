const CLERK_UI_MAJOR = '1';
const CLERK_JS_MAJOR = '6';
const ENABLED_MODES = new Set(['staging', 'development', 'test']);

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeBoolean = (value) => trim(value).toLowerCase() === 'true';

const normalizeApiBaseUrl = (value, mode) => {
  const raw = trim(value);
  if (!raw) throw new Error('VITE_API_URL is required when Clerk staging diagnostics are enabled.');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('VITE_API_URL must be an absolute http(s) URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('VITE_API_URL must use http:// or https://.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must not include credentials, query, or hash.');
  }
  if (mode === 'staging' && parsed.protocol !== 'https:') {
    throw new Error('VITE_API_URL must use https:// in staging mode.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
};

export const decodeClerkFrontendApiDomain = (publishableKey, decodeBase64) => {
  const key = trim(publishableKey);
  if (!key.startsWith('pk_test_')) {
    throw new Error('Staging Clerk integration requires a Development publishable key (pk_test_...).');
  }

  const encoded = key.split('_')[2];
  if (!encoded) throw new Error('VITE_CLERK_PUBLISHABLE_KEY has an invalid format.');

  let decoded;
  try {
    decoded = decodeBase64(encoded);
  } catch {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY could not be decoded.');
  }

  const domain = trim(decoded).replace(/\$$/, '');
  if (!domain || domain.includes('/') || domain.includes(' ')) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY decoded to an invalid Frontend API domain.');
  }

  return domain;
};

export const readClerkStagingConfig = (env, decodeBase64) => {
  const mode = trim(env?.MODE || 'production').toLowerCase();
  const requested = normalizeBoolean(env?.VITE_CLERK_STAGING_ENABLED);
  const enabled = requested && ENABLED_MODES.has(mode);

  if (!enabled) {
    return Object.freeze({ enabled: false, mode });
  }

  const publishableKey = trim(env?.VITE_CLERK_PUBLISHABLE_KEY);
  if (!publishableKey) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required when Clerk staging diagnostics are enabled.');
  }

  return Object.freeze({
    enabled: true,
    mode,
    publishableKey,
    frontendApiDomain: decodeClerkFrontendApiDomain(publishableKey, decodeBase64),
    apiBaseUrl: normalizeApiBaseUrl(env?.VITE_API_URL, mode),
  });
};

export const requestAuthenticatedSession = async ({ clerk, apiBaseUrl, fetchImpl }) => {
  const session = clerk?.session;
  if (!session || typeof session.getToken !== 'function') {
    throw new Error('Clerk sign-in is required before verifying the backend session.');
  }

  const token = await session.getToken();
  if (!token) throw new Error('Clerk did not return a session token.');

  const response = await fetchImpl(`${apiBaseUrl}/api/auth/session`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(`Backend Clerk session verification failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  if (!payload?.authenticated || !payload?.session?.userId) {
    throw new Error('Backend returned an invalid authenticated-session response.');
  }

  return payload;
};

const createScriptLoader = (documentRef) => (id, src, attributes = {}) =>
  new Promise((resolve, reject) => {
    const existing = documentRef.getElementById(id);
    if (existing?.dataset?.loaded === 'true') {
      resolve(existing);
      return;
    }

    const script = existing || documentRef.createElement('script');
    if (!existing) {
      script.id = id;
      script.src = src;
      script.defer = true;
      script.async = false;
      script.crossOrigin = 'anonymous';
      Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
      documentRef.head.appendChild(script);
    }

    const handleLoad = () => {
      script.dataset.loaded = 'true';
      cleanup();
      resolve(script);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Failed to load Clerk script: ${src}`));
    };
    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
  });

export const createClerkStagingClient = ({ env, windowRef, documentRef, fetchImpl }) => {
  const decodeBase64 = (value) => windowRef.atob(value);
  const config = readClerkStagingConfig(env, decodeBase64);
  let initializePromise = null;

  const initialize = async () => {
    if (!config.enabled) return null;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      if (!windowRef.Clerk?.load) {
        const loadScript = createScriptLoader(documentRef);
        const base = `https://${config.frontendApiDomain}/npm`;

        await loadScript(
          'clerk-staging-ui',
          `${base}/@clerk/ui@${CLERK_UI_MAJOR}/dist/ui.browser.js`,
        );
        await loadScript(
          'clerk-staging-js',
          `${base}/@clerk/clerk-js@${CLERK_JS_MAJOR}/dist/clerk.browser.js`,
          { 'data-clerk-publishable-key': config.publishableKey },
        );
      }

      if (!windowRef.Clerk?.load) {
        throw new Error('ClerkJS did not initialize after its script loaded.');
      }

      if (!windowRef.Clerk.loaded) {
        await windowRef.Clerk.load({
          ui: { ClerkUI: windowRef.__internal_ClerkUICtor },
        });
      }

      return windowRef.Clerk;
    })();

    try {
      return await initializePromise;
    } catch (error) {
      initializePromise = null;
      throw error;
    }
  };

  return Object.freeze({
    config,
    isDiagnosticsRequested() {
      if (!config.enabled) return false;
      return new URLSearchParams(windowRef.location.search).get('clerkTest') === '1';
    },
    async initialize() {
      return initialize();
    },
    async openSignIn() {
      const clerk = await initialize();
      await clerk.openSignIn();
    },
    async signOut() {
      const clerk = await initialize();
      await clerk.signOut();
    },
    async verifyBackendSession() {
      const clerk = await initialize();
      return requestAuthenticatedSession({ clerk, apiBaseUrl: config.apiBaseUrl, fetchImpl });
    },
  });
};

const browserEnv = import.meta.env || {};

export const clerkStagingClient =
  typeof window !== 'undefined' && typeof document !== 'undefined'
    ? createClerkStagingClient({
        env: browserEnv,
        windowRef: window,
        documentRef: document,
        fetchImpl: window.fetch.bind(window),
      })
    : Object.freeze({
        config: Object.freeze({ enabled: false, mode: 'server' }),
        isDiagnosticsRequested: () => false,
        initialize: async () => null,
      });
