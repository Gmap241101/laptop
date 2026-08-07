import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';

const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase3-smoke',
  corsAllowedOrigins: ['https://staging.example.vercel.app'],
};

const databaseCheck = async () => ({ latencyMs: 1, databaseTime: new Date() });
const authenticateRequest = async () => ({
  userId: 'user_smoke',
  sessionId: 'sess_smoke',
  authorizedParty: 'https://staging.example.vercel.app',
  issuedAt: 1,
  expiresAt: 2,
  status: 'active',
});
const server = createServer(createRequestHandler({ config, databaseCheck, authenticateRequest }));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve smoke-test port.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const live = await fetch(`${baseUrl}/health/live`);
if (live.status !== 200) throw new Error(`/health/live returned ${live.status}`);
const liveBody = await live.json();
if (liveBody.status !== 'ok') throw new Error('/health/live payload is invalid.');

const ready = await fetch(`${baseUrl}/health`, {
  headers: { Origin: 'https://staging.example.vercel.app' },
});
if (ready.status !== 200) throw new Error(`/health returned ${ready.status}`);
const readyBody = await ready.json();
if (readyBody.database?.status !== 'ok') throw new Error('/health database payload is invalid.');
if (ready.headers.get('access-control-allow-origin') !== 'https://staging.example.vercel.app') {
  throw new Error('Allowed CORS origin was not reflected.');
}

const session = await fetch(`${baseUrl}/api/auth/session`, {
  headers: { Authorization: 'Bearer smoke-token' },
});
if (session.status !== 200) throw new Error(`/api/auth/session returned ${session.status}`);
const sessionBody = await session.json();
if (sessionBody.session?.userId !== 'user_smoke') throw new Error('Auth session payload is invalid.');

const missing = await fetch(`${baseUrl}/missing`);
if (missing.status !== 404) throw new Error(`/missing returned ${missing.status}`);

await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
console.log('[server-smoke] PASS (/health/live, /health, /api/auth/session, CORS, 404)');
