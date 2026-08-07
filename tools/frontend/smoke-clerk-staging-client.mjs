import assert from 'node:assert/strict';

import {
  createClerkStagingClient,
  decodeClerkFrontendApiDomain,
  readClerkStagingConfig,
  requestAuthenticatedSession,
} from '../../src/clerk/clerkStagingClient.js';

const encode = (value) => Buffer.from(`${value}$`, 'utf8').toString('base64');
const decode = (value) => Buffer.from(value, 'base64').toString('utf8');
const domain = 'staging-example.clerk.accounts.dev';
const key = `pk_test_${encode(domain)}`;

assert.equal(decodeClerkFrontendApiDomain(key, decode), domain);

const disabledByDefault = readClerkStagingConfig(
  {
    MODE: 'production',
    VITE_CLERK_STAGING_ENABLED: 'false',
    VITE_CLERK_PUBLISHABLE_KEY: key,
    VITE_API_URL: 'https://api.example.com',
  },
  decode,
);
assert.equal(disabledByDefault.enabled, false, 'The staging bridge must remain disabled unless explicitly enabled.');

const vercelProductionStaging = readClerkStagingConfig(
  {
    MODE: 'production',
    VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: key,
    VITE_API_URL: 'https://api.example.com',
  },
  decode,
);
assert.equal(
  vercelProductionStaging.enabled,
  true,
  'A dedicated Vercel staging project can build in Vite production mode when the explicit staging flag is enabled.',
);

const staging = readClerkStagingConfig(
  {
    MODE: 'staging',
    VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: key,
    VITE_API_URL: 'https://api.example.com/',
  },
  decode,
);
assert.equal(staging.enabled, true);
assert.equal(staging.apiBaseUrl, 'https://api.example.com');

assert.throws(
  () =>
    readClerkStagingConfig(
      {
        MODE: 'staging',
        VITE_CLERK_STAGING_ENABLED: 'true',
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_invalid',
        VITE_API_URL: 'https://api.example.com',
      },
      decode,
    ),
  /Development publishable key/,
);

assert.throws(
  () =>
    readClerkStagingConfig(
      {
        MODE: 'staging',
        VITE_CLERK_STAGING_ENABLED: 'true',
        VITE_CLERK_PUBLISHABLE_KEY: key,
        VITE_API_URL: 'http://api.example.com',
      },
      decode,
    ),
  /https:\/\//,
);

let authorizationHeader = null;
const payload = await requestAuthenticatedSession({
  clerk: {
    session: {
      async getToken() {
        return 'test-token-that-must-not-be-logged';
      },
    },
  },
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/auth/session');
    authorizationHeader = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      async json() {
        return { authenticated: true, session: { userId: 'user_test' } };
      },
    };
  },
});
assert.equal(authorizationHeader, 'Bearer test-token-that-must-not-be-logged');
assert.equal(payload.session.userId, 'user_test');

await assert.rejects(
  () =>
    requestAuthenticatedSession({
      clerk: { session: { async getToken() { return 'expired'; } } },
      apiBaseUrl: 'https://api.example.com',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() { return { authenticated: false }; },
      }),
    }),
  /HTTP 401/,
);

const scripts = new Map();
const fakeClerk = {
  loaded: false,
  isSignedIn: true,
  user: { id: 'user_browser' },
  session: {
    id: 'sess_browser',
    async getToken() { return 'browser-session-token'; },
  },
  async load(options) {
    assert.ok(options.ui.ClerkUI);
    this.loaded = true;
  },
  async openSignIn() {},
  async signOut() {},
};

const windowRef = {
  atob: decode,
  location: { search: '?clerkTest=1' },
  __internal_ClerkUICtor: null,
  Clerk: undefined,
};

const createFakeScript = () => {
  const handlers = { load: [], error: [] };
  return {
    id: '',
    src: '',
    defer: false,
    async: true,
    crossOrigin: '',
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { handlers[name].push(handler); },
    removeEventListener(name, handler) {
      handlers[name] = handlers[name].filter((item) => item !== handler);
    },
    emit(name) { [...handlers[name]].forEach((handler) => handler()); },
  };
};

const documentRef = {
  head: {
    appendChild(script) {
      scripts.set(script.id, script);
      queueMicrotask(() => {
        if (script.id === 'clerk-staging-ui') windowRef.__internal_ClerkUICtor = function ClerkUI() {};
        if (script.id === 'clerk-staging-js') windowRef.Clerk = fakeClerk;
        script.emit('load');
      });
    },
  },
  createElement(tag) {
    assert.equal(tag, 'script');
    return createFakeScript();
  },
  getElementById(id) {
    return scripts.get(id) || null;
  },
};

let browserFetchAuth = null;
const client = createClerkStagingClient({
  env: {
    MODE: 'staging',
    VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: key,
    VITE_API_URL: 'https://api.example.com',
  },
  windowRef,
  documentRef,
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.example.com/api/auth/session');
    browserFetchAuth = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      async json() {
        return { authenticated: true, session: { userId: 'user_browser' } };
      },
    };
  },
});

assert.equal(client.isDiagnosticsRequested(), true);
assert.equal(await client.initialize(), fakeClerk);
assert.equal(fakeClerk.loaded, true);
assert.equal(
  scripts.get('clerk-staging-ui').src,
  `https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`,
);
assert.equal(
  scripts.get('clerk-staging-js').src,
  `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
);
assert.equal(scripts.get('clerk-staging-js').attributes['data-clerk-publishable-key'], key);

const browserPayload = await client.verifyBackendSession();
assert.equal(browserFetchAuth, 'Bearer browser-session-token');
assert.equal(browserPayload.session.userId, 'user_browser');

console.log('[clerk-frontend-smoke] PASS (config, Vercel production-mode staging, CDN loader, bearer request)');
