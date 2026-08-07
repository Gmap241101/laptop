import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequestHandler } from '../../server/src/app.mjs';

const config = {
  serviceName: 'rental-api',
  appEnv: 'staging',
  serviceVersion: 'phase2-hotfix-test',
  corsAllowedOrigins: ['https://staging.example.test'],
};
const server = createServer(createRequestHandler({ config, checkDatabaseFn: async () => ({ latencyMs: 3 }) }));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
const live = await fetch(`${base}/health/live`);
if (live.status !== 200 || (await live.json()).status !== 'ok') throw new Error('/health/live smoke test failed');
const health = await fetch(`${base}/health`, { headers: { Origin: 'https://staging.example.test' } });
const healthBody = await health.json();
if (health.status !== 200 || healthBody.database?.status !== 'ok') throw new Error('/health smoke test failed');
if (health.headers.get('access-control-allow-origin') !== 'https://staging.example.test') throw new Error('CORS smoke test failed');
const missing = await fetch(`${base}/missing`);
if (missing.status !== 404) throw new Error('404 smoke test failed');
server.close();
await once(server, 'close');
console.log('[server-smoke] PASS (/health/live, /health, CORS, 404)');
