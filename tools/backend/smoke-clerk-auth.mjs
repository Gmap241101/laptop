import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequestHandler } from '../../server/src/app.mjs';
import { createClerkSessionAuthenticator } from '../../server/src/auth/clerk-session.mjs';

const allowedOrigin = 'https://staging.example.vercel.app';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const config = {
  serviceName: 'rental-api',
  appEnv: 'test',
  serviceVersion: 'phase3-auth-smoke',
  corsAllowedOrigins: [allowedOrigin],
  clerkJwtKey: publicKey,
  clerkAuthorizedParties: [allowedOrigin],
  clerkClockSkewSeconds: 0,
  clerkRejectPendingSession: true,
};

const base64urlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const createToken = (payload, key = privateKey, header = { alg: 'RS256', typ: 'JWT' }) => {
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), key).toString('base64url');
  return `${signingInput}.${signature}`;
};

const now = Math.floor(Date.now() / 1000);
const validClaims = {
  sub: 'user_phase3_smoke',
  sid: 'sess_phase3_smoke',
  azp: allowedOrigin,
  iat: now - 1,
  nbf: now - 1,
  exp: now + 300,
  sts: 'active',
};

const authenticateRequest = createClerkSessionAuthenticator(config);
const databaseCheck = async () => ({ latencyMs: 1, databaseTime: new Date() });
const userIdentityService = {
  async getCurrent() { return null; },
  async syncCurrent() { throw new Error('not used in auth smoke'); },
};
const authenticateFirebaseRequest = async () => {
  throw new Error('not used in Clerk auth smoke');
};
const firebaseLinkService = {
  async getCurrent() { return null; },
  async linkCurrent() { throw new Error('not used in Clerk auth smoke'); },
};
const server = createServer(createRequestHandler({
  config,
  databaseCheck,
  authenticateRequest,
  authenticateFirebaseRequest,
  userIdentityService,
  firebaseLinkService,
}));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Unable to resolve auth smoke-test port.');
const baseUrl = `http://127.0.0.1:${address.port}`;

const requestSession = (token, origin = allowedOrigin) =>
  fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: origin,
    },
  });

const valid = await requestSession(createToken(validClaims));
if (valid.status !== 200) throw new Error(`Valid Clerk JWT returned ${valid.status}`);
const validBody = await valid.json();
if (!validBody.authenticated || validBody.session?.userId !== validClaims.sub) {
  throw new Error('Valid Clerk JWT did not return the expected sanitized session.');
}
if (validBody.session?.sessionId !== validClaims.sid) throw new Error('Session ID was not preserved.');

const missing = await requestSession(null);
if (missing.status !== 401) throw new Error(`Missing token returned ${missing.status}`);

const wrongAzp = await requestSession(createToken({ ...validClaims, azp: 'https://evil.example' }));
if (wrongAzp.status !== 401) throw new Error(`Invalid azp returned ${wrongAzp.status}`);

const expired = await requestSession(createToken({ ...validClaims, nbf: now - 600, exp: now - 300 }));
if (expired.status !== 401) throw new Error(`Expired token returned ${expired.status}`);

const pending = await requestSession(createToken({ ...validClaims, sts: 'pending' }));
if (pending.status !== 401) throw new Error(`Pending session returned ${pending.status}`);

const wrongAlgorithm = await requestSession(createToken(validClaims, privateKey, { alg: 'HS256', typ: 'JWT' }));
if (wrongAlgorithm.status !== 401) throw new Error(`Wrong algorithm returned ${wrongAlgorithm.status}`);

const otherKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const wrongSignature = await requestSession(createToken(validClaims, otherKeys.privateKey));
if (wrongSignature.status !== 401) throw new Error(`Wrong signature returned ${wrongSignature.status}`);

const preflight = await fetch(`${baseUrl}/api/auth/session`, {
  method: 'OPTIONS',
  headers: {
    Origin: allowedOrigin,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization',
  },
});
if (preflight.status !== 204) throw new Error(`Auth CORS preflight returned ${preflight.status}`);
if (preflight.headers.get('access-control-allow-origin') !== allowedOrigin) {
  throw new Error('Auth CORS preflight did not return the allowed origin.');
}

await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
console.log('[clerk-auth-smoke] PASS (valid JWT, missing, azp, expiry, pending, alg, signature, CORS)');
