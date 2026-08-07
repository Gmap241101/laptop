import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';

const allowedOrigin = 'https://staging.example.vercel.app';
const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase5-smoke',
  corsAllowedOrigins: [allowedOrigin],
};

const databaseCheck = async () => ({ latencyMs: 1, databaseTime: new Date() });
const authenticateRequest = async () => ({
  userId: 'user_smoke',
  sessionId: 'sess_smoke',
  authorizedParty: allowedOrigin,
  issuedAt: 1,
  expiresAt: 2,
  status: 'active',
});
let currentIdentity = null;
const userIdentityService = {
  async getCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected user ID.');
    return currentIdentity;
  },
  async syncCurrent(userId) {
    if (userId !== 'user_smoke') throw new Error('Unexpected user ID.');
    currentIdentity = {
      id: '42',
      clerkUserId: userId,
      primaryEmail: 'smoke@example.com',
      primaryEmailVerified: true,
      displayName: 'Smoke User',
      firstName: 'Smoke',
      lastName: 'User',
      imageUrl: null,
      lastSyncedAt: new Date('2026-08-07T00:00:00.000Z'),
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    };
    return currentIdentity;
  },
};
const server = createServer(
  createRequestHandler({ config, databaseCheck, authenticateRequest, userIdentityService }),
);

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve smoke-test port.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const live = await fetch(`${baseUrl}/health/live`);
if (live.status !== 200) throw new Error(`/health/live returned ${live.status}`);
const liveBody = await live.json();
if (liveBody.status !== 'ok') throw new Error('/health/live payload is invalid.');

const ready = await fetch(`${baseUrl}/health`, {
  headers: { Origin: allowedOrigin },
});
if (ready.status !== 200) throw new Error(`/health returned ${ready.status}`);
const readyBody = await ready.json();
if (readyBody.database?.status !== 'ok') throw new Error('/health database payload is invalid.');
if (ready.headers.get('access-control-allow-origin') !== allowedOrigin) {
  throw new Error('Allowed CORS origin was not reflected.');
}

const authHeaders = { Authorization: 'Bearer smoke-token', Origin: allowedOrigin };
const session = await fetch(`${baseUrl}/api/auth/session`, { headers: authHeaders });
if (session.status !== 200) throw new Error(`/api/auth/session returned ${session.status}`);
const sessionBody = await session.json();
if (sessionBody.session?.userId !== 'user_smoke') throw new Error('Auth session payload is invalid.');

const beforeSync = await fetch(`${baseUrl}/api/users/me`, { headers: authHeaders });
if (beforeSync.status !== 404) throw new Error(`/api/users/me before sync returned ${beforeSync.status}`);
const beforeSyncBody = await beforeSync.json();
if (beforeSyncBody.error !== 'profile_not_synced') throw new Error('Unsynced user response is invalid.');

const preflight = await fetch(`${baseUrl}/api/users/me/sync`, {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization',
  },
});
if (preflight.status !== 204) throw new Error(`POST preflight returned ${preflight.status}`);
if (!preflight.headers.get('access-control-allow-methods')?.includes('POST')) {
  throw new Error('POST is missing from CORS allow methods.');
}

const sync = await fetch(`${baseUrl}/api/users/me/sync`, { method: 'POST', headers: authHeaders });
if (sync.status !== 200) throw new Error(`/api/users/me/sync returned ${sync.status}`);
const syncBody = await sync.json();
if (!syncBody.synchronized || syncBody.user?.id !== '42' || syncBody.user?.clerkUserId !== 'user_smoke') {
  throw new Error('User synchronization payload is invalid.');
}

const afterSync = await fetch(`${baseUrl}/api/users/me`, { headers: authHeaders });
if (afterSync.status !== 200) throw new Error(`/api/users/me after sync returned ${afterSync.status}`);
const afterSyncBody = await afterSync.json();
if (afterSyncBody.user?.primaryEmail !== 'smoke@example.com') throw new Error('Synced user lookup is invalid.');

const missing = await fetch(`${baseUrl}/missing`);
if (missing.status !== 404) throw new Error(`/missing returned ${missing.status}`);

await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
console.log('[server-smoke] PASS (/health, auth, identity GET/POST, CORS, 404)');
