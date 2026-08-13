import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.equal(existsSync('server/src/firestore'), false, 'server legacy database client directory must be removed');
assert.equal(existsSync('server/src/firebase'), false, 'server legacy auth verifier directory must be removed');
const index = readFileSync('server/src/index.mjs', 'utf8');
const app = readFileSync('server/src/app.mjs', 'utf8');
const env = readFileSync('server/src/config/env.mjs', 'utf8');
for (const forbidden of ['./firestore/', './firebase/', 'createFirestore', 'createFirebaseIdTokenVerifier', 'extractFirebaseBearerToken']) assert.equal(index.includes(forbidden), false, `server runtime import/wiring must not contain ${forbidden}`);
assert.ok(env.includes('const firebaseRuntimeDisabled = true'));
assert.equal(env.includes('firebaseProjectId'), false, 'server configuration must not expose a Firebase project ID');
assert.equal(app.includes('X-Firebase-Authorization'), false, 'CORS/backend must not accept legacy authorization header');
assert.ok(index.includes("adminAuthentication: 'clerk-postgresql'"));
assert.ok(index.includes('createSystemConfigService'));
assert.ok(app.includes("'/api/admin/accounts'"));
assert.ok(app.includes("'/api/system-config/user-session-policy'"));
console.log('[phase34-external-runtime-removal-backend-smoke] PASS (retired external runtime removed; admin/settings authority is Clerk/PostgreSQL)');
