import assert from 'node:assert/strict';

import {
  createClerkStagingClient,
  decodeClerkFrontendApiDomain,
  readClerkStagingConfig,
  requestAuthenticatedSession,
  requestCurrentUserIdentity,
  requestCurrentUserIdentitySync,
  requestFirebaseLegacyLink,
  requestFirebaseLegacyLinkStatus,
  requestMemberProfileReadCandidate,
  requestMemberShadowStatus,
  requestMemberShadowSync,
  requestMemberShadowComparison,
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

const fakeSessionClerk = {
  session: {
    async getToken() {
      return 'test-token-that-must-not-be-logged';
    },
  },
};
let calls = [];
const fetchForRequests = async (url, options) => {
  calls.push({ url, options });
  if (url.endsWith('/api/auth/session')) {
    return {
      ok: true,
      status: 200,
      async json() { return { authenticated: true, session: { userId: 'user_test' } }; },
    };
  }
  if (url.endsWith('/api/users/me/sync')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          authenticated: true,
          synchronized: true,
          user: { id: '7', clerkUserId: 'user_test', primaryEmail: 'test@example.com' },
        };
      },
    };
  }
  if (url.endsWith('/api/users/me/legacy/firebase')) {
    if (options.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async json() {
          return { authenticated: true, linked: true, firebaseLink: { appUserId: '7', firebaseUid: 'firebase_uid_test' } };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { authenticated: true, firebaseLink: { appUserId: '7', firebaseUid: 'firebase_uid_test' } };
      },
    };
  }
  if (url.endsWith('/api/users/me/member-profile-candidate')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          authenticated: true,
          readCandidate: {
            source: 'postgresql-shadow',
            profile: { uid: 'firebase_uid_test', name: 'Phase Seven', team: 'QA', status: 'active' },
          },
        };
      },
    };
  }
  if (url.endsWith('/api/users/me/legacy/member-shadow/sync')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return { authenticated: true, synchronized: true, memberShadow: { firebaseUid: 'firebase_uid_test', name: 'Phase Seven', sourceHash: 'a'.repeat(64) } };
      },
    };
  }
  if (url.endsWith('/api/users/me/legacy/member-shadow/compare')) {
    return {
      ok: true,
      status: 200,
      async json() { return { authenticated: true, comparison: { equivalent: true, changedFields: [] } }; },
    };
  }
  if (url.endsWith('/api/users/me/legacy/member-shadow')) {
    return {
      ok: true,
      status: 200,
      async json() { return { authenticated: true, memberShadow: { firebaseUid: 'firebase_uid_test', name: 'Phase Seven', sourceHash: 'a'.repeat(64) } }; },
    };
  }
  if (url.endsWith('/api/users/me')) {
    return {
      ok: true,
      status: 200,
      async json() {
        return { authenticated: true, user: { id: '7', clerkUserId: 'user_test' } };
      },
    };
  }
  throw new Error(`Unexpected request: ${url}`);
};

const payload = await requestAuthenticatedSession({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(payload.session.userId, 'user_test');

const syncPayload = await requestCurrentUserIdentitySync({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(syncPayload.user.id, '7');
assert.equal(calls.at(-1).options.method, 'POST');

const currentPayload = await requestCurrentUserIdentity({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(currentPayload.user.clerkUserId, 'user_test');
assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer test-token-that-must-not-be-logged'));

const firebaseLinkPayload = await requestFirebaseLegacyLink({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
  firebaseIdToken: 'firebase-id-token-that-must-not-be-logged',
});
assert.equal(firebaseLinkPayload.firebaseLink.firebaseUid, 'firebase_uid_test');
assert.equal(calls.at(-1).options.headers['X-Firebase-Authorization'], undefined);

const firebaseLinkStatus = await requestFirebaseLegacyLinkStatus({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(firebaseLinkStatus.firebaseLink.appUserId, '7');
assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer test-token-that-must-not-be-logged'));

const shadowSyncPayload = await requestMemberShadowSync({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
  firebaseIdToken: 'firebase-id-token-that-must-not-be-logged',
});
assert.equal(shadowSyncPayload.memberShadow.firebaseUid, 'firebase_uid_test');
assert.equal(calls.at(-1).options.headers['X-Firebase-Authorization'], undefined);

const shadowStatusPayload = await requestMemberShadowStatus({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(shadowStatusPayload.memberShadow.name, 'Phase Seven');

const readCandidatePayload = await requestMemberProfileReadCandidate({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
});
assert.equal(readCandidatePayload.readCandidate.source, 'postgresql-shadow');
assert.equal(readCandidatePayload.readCandidate.profile.uid, 'firebase_uid_test');

const shadowComparePayload = await requestMemberShadowComparison({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: fetchForRequests,
  firebaseIdToken: 'firebase-id-token-that-must-not-be-logged',
});
assert.equal(shadowComparePayload.comparison.equivalent, true);

const unsynced = await requestCurrentUserIdentity({
  clerk: fakeSessionClerk,
  apiBaseUrl: 'https://api.example.com',
  fetchImpl: async () => ({
    ok: false,
    status: 404,
    async json() { return { authenticated: true, error: 'profile_not_synced' }; },
  }),
});
assert.equal(unsynced, null);

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

const browserCalls = [];
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
    browserCalls.push({ url, options });
    if (url.endsWith('/api/auth/session')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, session: { userId: 'user_browser' } }; } };
    }
    if (url.endsWith('/api/users/me/sync')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, synchronized: true, user: { id: '11', clerkUserId: 'user_browser' } }; } };
    }
    if (url.endsWith('/api/users/me/legacy/firebase')) {
      if (options.method === 'POST') {
        return { ok: true, status: 200, async json() { return { authenticated: true, linked: true, firebaseLink: { appUserId: '11', firebaseUid: 'firebase_uid_browser' } }; } };
      }
      return { ok: true, status: 200, async json() { return { authenticated: true, firebaseLink: { appUserId: '11', firebaseUid: 'firebase_uid_browser' } }; } };
    }
    if (url.endsWith('/api/users/me/member-profile-candidate')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, readCandidate: { source: 'postgresql-shadow', profile: { uid: 'firebase_uid_browser', name: 'Browser User', team: 'QA', status: 'active' } } }; } };
    }
    if (url.endsWith('/api/users/me/legacy/member-shadow/sync')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, synchronized: true, memberShadow: { firebaseUid: 'firebase_uid_browser', name: 'Browser User', sourceHash: 'b'.repeat(64) } }; } };
    }
    if (url.endsWith('/api/users/me/legacy/member-shadow/compare')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, comparison: { equivalent: true, changedFields: [] } }; } };
    }
    if (url.endsWith('/api/users/me/legacy/member-shadow')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, memberShadow: { firebaseUid: 'firebase_uid_browser', name: 'Browser User', sourceHash: 'b'.repeat(64) } }; } };
    }
    if (url.endsWith('/api/users/me')) {
      return { ok: true, status: 200, async json() { return { authenticated: true, user: { id: '11', clerkUserId: 'user_browser' } }; } };
    }
    throw new Error(`Unexpected browser request: ${url}`);
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

assert.equal((await client.verifyBackendSession()).session.userId, 'user_browser');
assert.equal((await client.syncBackendUserIdentity()).user.id, '11');
assert.equal((await client.getBackendUserIdentity()).user.id, '11');
assert.equal((await client.linkFirebaseLegacyAccount('firebase-browser-token')).firebaseLink.firebaseUid, 'firebase_uid_browser');
assert.equal((await client.getFirebaseLegacyLink()).firebaseLink.appUserId, '11');
assert.equal((await client.syncMemberShadow('firebase-browser-token')).memberShadow.firebaseUid, 'firebase_uid_browser');
assert.equal((await client.getMemberShadow()).memberShadow.name, 'Browser User');
assert.equal((await client.getMemberProfileReadCandidate()).readCandidate.profile.uid, 'firebase_uid_browser');
assert.equal((await client.compareMemberShadow('firebase-browser-token')).comparison.equivalent, true);
assert.ok(browserCalls.every((call) => call.options.headers.Authorization === 'Bearer browser-session-token'));
assert.equal(browserCalls.some((call) => call.options.headers['X-Firebase-Authorization']), false);

let deviceTrustSendCount = 0;
let deviceTrustVerifyCount = 0;
const deviceTrustSignIn = {
  status: 'needs_client_trust',
  createdSessionId: '',
  supportedSecondFactors: [
    { strategy: 'phone_code', phoneNumberId: 'phone_1', safeIdentifier: '+82 **-****-0000' },
    { strategy: 'email_code', emailAddressId: 'email_1', safeIdentifier: 'trust@example.com' },
  ],
  mfa: {
    async sendEmailCode() {
      deviceTrustSendCount += 1;
    },
    async verifyEmailCode({ code }) {
      assert.equal(code, '123456');
      deviceTrustVerifyCount += 1;
      deviceTrustSignIn.status = 'complete';
      deviceTrustSignIn.createdSessionId = 'sess_device_trust';
    },
  },
};
const deviceTrustClerk = {
  loaded: true,
  session: null,
  user: {
    id: 'user_device_trust',
    primaryEmailAddress: { emailAddress: 'trust@example.com' },
  },
  client: {
    signIn: {
      async create({ strategy, identifier, password }) {
        assert.equal(strategy, 'password');
        assert.equal(identifier, 'trust@example.com');
        assert.equal(password, 'password123');
        return deviceTrustSignIn;
      },
    },
    resetSignIn() {},
  },
  async load() {},
  async signOut() {},
  async setActive({ session }) {
    assert.equal(session, 'sess_device_trust');
    this.session = { id: session, async getToken() { return 'device-trust-token'; } };
  },
};
const deviceTrustClient = createClerkStagingClient({
  env: {
    MODE: 'staging',
    VITE_CLERK_STAGING_ENABLED: 'true',
    VITE_CLERK_PUBLISHABLE_KEY: key,
    VITE_API_URL: 'https://api.example.com',
  },
  windowRef: {
    atob: decode,
    location: { search: '' },
    Clerk: deviceTrustClerk,
  },
  documentRef: {},
  fetchImpl: async () => { throw new Error('Device Trust smoke must not call backend fetch.'); },
});
const deviceTrustPending = await deviceTrustClient.signInWithPassword('trust@example.com', 'password123');
assert.equal(deviceTrustPending.status, 'needs_client_trust');
assert.equal(deviceTrustPending.clientTrustStrategy, 'email_code', 'new-device login must prefer the email code factor');
assert.equal(deviceTrustSendCount, 1, 'new-device password login must send one email verification code');
await deviceTrustClient.resendAdminClientTrust();
assert.equal(deviceTrustSendCount, 2, 'new-device verification must support resending the email code');
const deviceTrustComplete = await deviceTrustClient.verifyAdminClientTrust('123456');
assert.equal(deviceTrustVerifyCount, 1);
assert.equal(deviceTrustComplete.status, 'complete');
assert.equal(deviceTrustComplete.email, 'trust@example.com');
assert.equal(deviceTrustClerk.session.id, 'sess_device_trust');

console.log('[clerk-frontend-smoke] PASS (config, CDN loader, Clerk bearer auth, Device Trust email-code send/resend/verify, PostgreSQL compatibility-key endpoints, no retired-provider authorization header)');
