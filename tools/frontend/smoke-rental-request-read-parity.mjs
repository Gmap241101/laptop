import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  compareRentalRequestReads,
  normalizeRentalRequestRead,
  readRentalRequestParityConfig,
} from '../../src/features/requests/rentalRequestReadParity.js';

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED: 'true',
  VITE_API_URL: 'https://api.example.test/',
};
const storage = createStorage();
const enabled = readRentalRequestParityConfig({
  env,
  location: { search: '?rentalRequestParity=1' },
  storage,
});
assert.equal(enabled.enabled, true);
assert.equal(enabled.requested, true);
assert.equal(enabled.apiBaseUrl, 'https://api.example.test');

const latched = readRentalRequestParityConfig({ env, location: { search: '' }, storage });
assert.equal(latched.requested, true);
assert.equal(latched.sessionRequested, true);

const reset = readRentalRequestParityConfig({
  env,
  location: { search: '?rentalRequestParity=0' },
  storage,
});
assert.equal(reset.requested, false);

const timestamp = (iso) => ({ toDate: () => new Date(iso) });
const firestore = [{
  id: 'REQ-2',
  requesterUid: 'uid-new',
  requesterEmail: 'USER@example.test',
  requesterName: 'User',
  requesterTeam: 'QA',
  laptopId: 'LAPTOP-2',
  assetCategory: 'notebook',
  assetNo: 'A-002',
  team: 'QA',
  borrower: 'User',
  startDate: '2026-08-10',
  dueDate: '2026-08-12',
  purpose: 'Parity',
  status: 'requested',
  extensionHistory: [{ extendedAt: timestamp('2026-08-11T01:00:00.000Z') }],
  userActionRequest: { type: 'extension', requestedAt: timestamp('2026-08-11T02:00:00.000Z') },
  createdAt: timestamp('2026-08-08T01:00:00.000Z'),
  updatedAt: timestamp('2026-08-08T02:00:00.000Z'),
}];
const candidate = [{
  ...firestore[0],
  requesterEmail: 'user@example.test',
  extensionHistory: [{ extendedAt: '2026-08-11T01:00:00.000Z' }],
  userActionRequest: { type: 'extension', requestedAt: '2026-08-11T02:00:00.000Z' },
  createdAt: '2026-08-08T01:00:00.000Z',
  updatedAt: '2026-08-08T02:00:00.000Z',
}];
assert.deepEqual(normalizeRentalRequestRead(firestore[0]), normalizeRentalRequestRead(candidate[0]));
assert.deepEqual(compareRentalRequestReads(firestore, candidate), {
  equivalent: true,
  firestoreCount: 1,
  postgresCount: 1,
  changedRequestIds: [],
  changedFields: [],
  firestoreOrder: ['REQ-2'],
  postgresOrder: ['REQ-2'],
});

const drift = compareRentalRequestReads(firestore, [{ ...candidate[0], status: 'approved' }]);
assert.equal(drift.equivalent, false);
assert.deepEqual(drift.changedRequestIds, ['REQ-2']);
assert.deepEqual(drift.changedFields, ['REQ-2.status']);

const missing = compareRentalRequestReads(firestore, []);
assert.equal(missing.equivalent, false);
assert.deepEqual(missing.changedRequestIds, ['REQ-2']);
assert.ok(missing.changedFields.includes('REQ-2.requestMissing'));
assert.ok(missing.changedFields.includes('requestOrder'));

const subscriptionSource = await readFile(
  new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url),
  'utf8',
);
assert.match(subscriptionSource, /publishRentalRequestReadObservation\(\{ requests: [A-Za-z]+Requests \}\)/);

const diagnosticsSource = await readFile(
  new URL('../../src/clerk/ClerkStagingDiagnostics.jsx', import.meta.url),
  'utf8',
);
assert.match(diagnosticsSource, /syncAndVerifyRentalRequestParity/);
assert.match(diagnosticsSource, /대여신청 Shadow 동기화·병행검증/);
assert.match(diagnosticsSource, /Clerk Staging Test · Phase (14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30)/);

const clientSource = await readFile(
  new URL('../../src/clerk/clerkStagingClient.js', import.meta.url),
  'utf8',
);
for (const marker of [
  '/api/users/me/rental-requests',
  '/api/users/me/legacy/rental-request-shadows/sync',
  '/api/users/me/legacy/rental-request-shadows/compare',
]) {
  assert.ok(clientSource.includes(marker), `Missing Phase 14 client API marker: ${marker}`);
}

console.log('[rental-request-read-parity-smoke] PASS (opt-in latch, Timestamp normalization, parity/drift/order, app observation and diagnostics wiring)');
