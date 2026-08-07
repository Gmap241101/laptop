import { randomUUID } from 'node:crypto';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const writeJson = (response, statusCode, payload, extraHeaders = {}) => {
  response.writeHead(statusCode, { ...JSON_HEADERS, ...extraHeaders });
  response.end(JSON.stringify(payload));
};
const buildCorsHeaders = (request, allowedOrigins) => {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Request-Id',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};

export const createRequestHandler = ({ config, checkDatabaseFn }) => {
  if (typeof checkDatabaseFn !== 'function') throw new TypeError('checkDatabaseFn is required.');
  const basePayload = { service: config.serviceName, environment: config.appEnv, version: config.serviceVersion };
  return async (request, response) => {
    const requestId = request.headers['x-request-id'] || randomUUID();
    const headers = { ...buildCorsHeaders(request, config.corsAllowedOrigins), 'X-Request-Id': requestId };
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return; }
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/') {
      writeJson(response, 200, { ...basePayload, status: 'running', health: '/health', liveness: '/health/live' }, headers); return;
    }
    if (request.method === 'GET' && url.pathname === '/health/live') {
      writeJson(response, 200, { ...basePayload, status: 'ok', timestamp: new Date().toISOString() }, headers); return;
    }
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/health/ready')) {
      try {
        const database = await checkDatabaseFn();
        writeJson(response, 200, { ...basePayload, status: 'ok', database: { status: 'ok', latencyMs: database.latencyMs }, timestamp: new Date().toISOString() }, headers);
      } catch (error) {
        console.error('[health] database readiness check failed', { requestId, name: error?.name, code: error?.code });
        writeJson(response, 503, { ...basePayload, status: 'unavailable', database: { status: 'unavailable' }, timestamp: new Date().toISOString() }, headers);
      }
      return;
    }
    writeJson(response, 404, { ...basePayload, status: 'not_found' }, headers);
  };
};
