import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  createFirebaseIdTokenVerifier,
  extractFirebaseBearerToken,
} from '../../server/src/firebase/firebase-id-token.mjs';
import { createFirebaseLinkRepository } from '../../server/src/legacy/firebase-link-repository.mjs';
import { createFirebaseLinkService } from '../../server/src/legacy/firebase-link-service.mjs';

const projectId = 'laptop-system-mk';
const kid = 'phase6-test-kid';
const nowSeconds = Math.floor(Date.now() / 1000);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

const encodeJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const createToken = (payloadOverrides = {}, signingKey = privateKey, headerOverrides = {}) => {
  const header = { alg: 'RS256', typ: 'JWT', kid, ...headerOverrides };
  const payload = {
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: 'firebase_uid_phase6',
    email: 'phase6@example.com',
    email_verified: false,
    auth_time: nowSeconds - 30,
    iat: nowSeconds - 20,
    exp: nowSeconds + 3600,
    firebase: { sign_in_provider: 'password' },
    ...payloadOverrides,
  };
  const unsigned = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), signingKey).toString('base64url');
  return `${unsigned}.${signature}`;
};

let certFetchCount = 0;
const verifier = createFirebaseIdTokenVerifier({
  projectId,
  fetchImpl: async () => {
    certFetchCount += 1;
    return {
      ok: true,
      status: 200,
      headers: { get(name) { return name.toLowerCase() === 'cache-control' ? 'public, max-age=3600' : null; } },
      async json() { return { [kid]: publicPem }; },
    };
  },
});

const verified = await verifier(createToken());
assert.equal(verified.uid, 'firebase_uid_phase6');
assert.equal(verified.email, 'phase6@example.com');
assert.equal(verified.emailVerified, false);
assert.equal(verified.signInProvider, 'password');
assert.equal(certFetchCount, 1);
await verifier(createToken());
assert.equal(certFetchCount, 1, 'Firebase signing certificates should be cached.');

await assert.rejects(() => verifier(createToken({ aud: 'wrong-project' })), (error) => error.code === 'firebase_audience_invalid');
await assert.rejects(() => verifier(createToken({ exp: nowSeconds - 100 })), (error) => error.code === 'firebase_token_expired');
await assert.rejects(() => verifier(createToken({}, privateKey, { alg: 'HS256' })), (error) => error.code === 'firebase_algorithm_invalid');

const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
await assert.rejects(() => verifier(createToken({}, otherKeys.privateKey)), (error) => error.code === 'firebase_signature_invalid');

assert.equal(
  extractFirebaseBearerToken({ headers: { 'x-firebase-authorization': 'Bearer firebase-id-token' } }),
  'firebase-id-token',
);
assert.throws(
  () => extractFirebaseBearerToken({ headers: {} }),
  (error) => error.code === 'firebase_authorization_missing',
);

let linkRow = null;
const pool = {
  async query(sql, params) {
    if (sql.includes('FROM app_user_firebase_links') && sql.includes('WHERE app_user_id = $1')) {
      return { rows: linkRow && String(linkRow.app_user_id) === String(params[0]) ? [linkRow] : [] };
    }
    if (sql.includes('FROM app_user_firebase_links') && sql.includes('WHERE firebase_uid = $1')) {
      return { rows: linkRow && linkRow.firebase_uid === params[0] ? [linkRow] : [] };
    }
    if (sql.includes('INSERT INTO app_user_firebase_links')) {
      linkRow = {
        app_user_id: String(params[0]),
        firebase_uid: params[1],
        firebase_email: params[2],
        firebase_email_verified: params[3],
        firebase_sign_in_provider: params[4],
        linked_at: new Date('2026-08-07T00:00:00.000Z'),
        last_verified_at: new Date('2026-08-07T00:00:00.000Z'),
        created_at: new Date('2026-08-07T00:00:00.000Z'),
        updated_at: new Date('2026-08-07T00:00:00.000Z'),
      };
      return { rows: [linkRow] };
    }
    throw new Error(`Unexpected Phase 6 SQL: ${sql}`);
  },
};

const userRepository = {
  async findByClerkUserId(clerkUserId) {
    if (clerkUserId !== 'user_phase6') return null;
    return { id: '7', clerkUserId, primaryEmail: 'phase6@example.com' };
  },
};
const firebaseLinkRepository = createFirebaseLinkRepository(pool);
const service = createFirebaseLinkService({ userRepository, firebaseLinkRepository });
assert.equal(await service.getCurrent('user_phase6'), null);
const linked = await service.linkCurrent('user_phase6', verified);
assert.equal(linked.appUserId, '7');
assert.equal(linked.firebaseUid, 'firebase_uid_phase6');
assert.equal((await service.getCurrent('user_phase6')).firebaseUid, 'firebase_uid_phase6');
const linkedAgain = await service.linkCurrent('user_phase6', verified);
assert.equal(linkedAgain.appUserId, '7');

await assert.rejects(
  () => service.linkCurrent('user_phase6', { ...verified, email: 'other@example.com' }),
  (error) => error.code === 'firebase_email_mismatch',
);

console.log('[firebase-identity-bridge-smoke] PASS (RS256 Firebase token verification, cert cache, email gate, PostgreSQL one-to-one link)');
