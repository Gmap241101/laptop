import assert from 'node:assert/strict';

import { createClerkBackendClient, normalizeClerkBackendUser } from '../../server/src/clerk/clerk-api.mjs';
import { createUserRepository } from '../../server/src/users/user-repository.mjs';
import { createUserIdentityService } from '../../server/src/users/user-service.mjs';

const rawUser = {
  id: 'user_phase5',
  first_name: 'Rental',
  last_name: 'Tester',
  primary_email_address_id: 'idn_primary',
  email_addresses: [
    {
      id: 'idn_primary',
      email_address: 'phase5@example.com',
      verification: { status: 'verified' },
    },
  ],
  image_url: 'https://img.example/avatar.png',
  created_at: Date.parse('2026-08-01T00:00:00.000Z'),
  updated_at: Date.parse('2026-08-07T00:00:00.000Z'),
};

const normalized = normalizeClerkBackendUser(rawUser);
assert.equal(normalized.clerkUserId, 'user_phase5');
assert.equal(normalized.primaryEmail, 'phase5@example.com');
assert.equal(normalized.primaryEmailVerified, true);
assert.equal(normalized.displayName, 'Rental Tester');
assert.equal(normalized.clerkCreatedAt, '2026-08-01T00:00:00.000Z');

let requestedUrl = null;
let authorizationHeader = null;
const clerkClient = createClerkBackendClient({
  secretKey: 'sk_test_phase5_secret',
  timeoutMs: 1000,
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    authorizationHeader = options.headers.Authorization;
    return {
      ok: true,
      status: 200,
      async json() { return rawUser; },
    };
  },
});

const fetched = await clerkClient.getUser('user_phase5');
assert.equal(requestedUrl, 'https://api.clerk.com/v1/users/user_phase5');
assert.equal(authorizationHeader, 'Bearer sk_test_phase5_secret');
assert.equal(fetched.primaryEmail, 'phase5@example.com');

const queryCalls = [];
let stored = null;
const pool = {
  async query(sql, params) {
    queryCalls.push({ sql, params });
    if (sql.includes('WHERE clerk_user_id = $1')) {
      return { rows: stored ? [stored] : [] };
    }
    if (sql.includes('INSERT INTO app_user_identities')) {
      stored = {
        id: '7',
        clerk_user_id: params[0],
        primary_email: params[1],
        primary_email_verified: params[2],
        display_name: params[3],
        first_name: params[4],
        last_name: params[5],
        image_url: params[6],
        clerk_created_at: params[7],
        clerk_updated_at: params[8],
        last_synced_at: new Date('2026-08-07T00:00:00.000Z'),
        created_at: new Date('2026-08-07T00:00:00.000Z'),
        updated_at: new Date('2026-08-07T00:00:00.000Z'),
      };
      return { rows: [stored] };
    }
    throw new Error('Unexpected SQL in Phase 5 smoke test.');
  },
};

const userRepository = createUserRepository(pool);
const service = createUserIdentityService({ clerkClient, userRepository });
assert.equal(await service.getCurrent('user_phase5'), null);
const synced = await service.syncCurrent('user_phase5');
assert.equal(synced.id, '7');
assert.equal(synced.clerkUserId, 'user_phase5');
assert.equal(synced.primaryEmailVerified, true);
const loaded = await service.getCurrent('user_phase5');
assert.equal(loaded.id, '7');
assert.equal(queryCalls.length, 3);

await assert.rejects(
  () =>
    createClerkBackendClient({
      secretKey: 'sk_test_phase5_secret',
      timeoutMs: 1000,
      fetchImpl: async () => ({ ok: false, status: 401, async json() { return {}; } }),
    }).getUser('user_phase5'),
  /HTTP 401/,
);

console.log('[clerk-user-sync-smoke] PASS (BAPI auth, trusted profile normalization, PostgreSQL upsert/read)');
