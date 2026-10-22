import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findRetiredSourceEntries } from '../lib/retired-source-paths.mjs';

assert.deepEqual(findRetiredSourceEntries('server/src/firebase'), []);
assert.deepEqual(findRetiredSourceEntries('server/src/firestore'), []);
const env = readFileSync('server/src/config/env.mjs', 'utf8');
const app = readFileSync('server/src/app.mjs', 'utf8');
const index = readFileSync('server/src/index.mjs', 'utf8');
const db = readFileSync('server/src/db/pool.mjs', 'utf8');
assert.match(env, /const firebaseRuntimeDisabled = true/, 'Firebase runtime must be permanently retired');
assert.ok(!env.includes('readFirebaseProjectId('), 'retired Firebase project configuration must not be restored');
assert.match(db, /readDatabaseRuntimeConfig/, 'database migrations must use isolated DB configuration');
assert.match(index, /createClerkDeviceTrustService/, 'Clerk user policies remain active');
assert.match(index, /userIdentityStore: 'postgresql'/, 'canonical user identity is PostgreSQL');
assert.equal(app.includes('X-Firebase-Authorization'), false, 'retired Firebase token headers must not be accepted');
assert.ok(app.includes("'/api/admin/system-data/reset'"), 'data maintenance must remain available');
console.log('[phase34-runtime-retirement-backend-smoke] PASS (Clerk/PostgreSQL authority, Firebase SDK runtime removed)');
