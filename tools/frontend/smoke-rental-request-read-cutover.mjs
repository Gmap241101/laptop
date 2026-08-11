import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  chooseRentalRequestReadSource,
  loadRentalRequestsWithoutFirestoreWatcher,
  readRentalRequestCandidatePayload,
  readRentalRequestCutoverConfig,
  shouldUseRentalRequestFirestoreWatcher,
} from '../../src/features/requests/rentalRequestReadCutover.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED: 'true',
  VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED: 'true',
  VITE_API_URL: 'https://api.example.test',
};

const storageState = new Map();
const fakeStorage = {
  setItem(key, value) { storageState.set(key, String(value)); },
  getItem(key) { return storageState.has(key) ? storageState.get(key) : null; },
  removeItem(key) { storageState.delete(key); },
};

const readOnly = readRentalRequestCutoverConfig({
  env,
  location: { search: '?rentalRequestRead=postgres' },
  storage: fakeStorage,
});
assert.equal(readOnly.enabled, true);
assert.equal(readOnly.requested, true);
assert.equal(readOnly.firestoreWatcherDisabled, false);
assert.equal(readOnly.apiBaseUrl, 'https://api.example.test');

const watcherOff = readRentalRequestCutoverConfig({
  env,
  location: { search: '?rentalRequestRead=postgres&rentalRequestWatcher=off' },
  storage: fakeStorage,
});
assert.equal(watcherOff.requested, true);
assert.equal(watcherOff.firestoreWatcherDisabled, true);
assert.equal(shouldUseRentalRequestFirestoreWatcher(watcherOff), false);

const nonOptInRead = chooseRentalRequestReadSource({
  firestoreRequests: [],
  postgresRequests: null,
  requested: false,
});
assert.equal(nonOptInRead.source, 'firestore-onSnapshot');
assert.equal(nonOptInRead.equivalent, null);
assert.equal(nonOptInRead.fallbackReason, 'cutover-not-requested');

const latchedNavigation = readRentalRequestCutoverConfig({
  env,
  location: { search: '' },
  storage: fakeStorage,
});
assert.equal(latchedNavigation.requested, true);
assert.equal(latchedNavigation.firestoreWatcherDisabled, true);

const reset = readRentalRequestCutoverConfig({
  env,
  location: { search: '?rentalRequestRead=firestore' },
  storage: fakeStorage,
});
assert.equal(reset.requested, false);
assert.equal(reset.firestoreWatcherDisabled, false);

assert.equal(
  readRentalRequestCutoverConfig({
    env: { ...env, VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED: 'false' },
    location: { search: '?rentalRequestRead=postgres&rentalRequestWatcher=off' },
  }).requested,
  false,
);
assert.equal(
  readRentalRequestCutoverConfig({
    env: { ...env, VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED: 'false' },
    location: { search: '?rentalRequestRead=postgres&rentalRequestWatcher=off' },
  }).firestoreWatcherDisabled,
  false,
);

const firestoreRequests = [
  {
    id: 'REQ-2',
    requesterUid: 'firebase-current',
    requesterEmail: 'member@example.com',
    assetNo: 'NB-002',
    status: '대여중',
    dueDate: '2026-08-20',
    createdAt: { toDate: () => new Date('2026-08-02T00:00:00.000Z') },
    updatedAt: { toDate: () => new Date('2026-08-03T00:00:00.000Z') },
  },
  {
    id: 'REQ-1',
    requesterUid: 'firebase-old',
    requesterEmail: 'member@example.com',
    assetNo: 'NB-001',
    status: '반납완료',
    dueDate: '2026-07-20',
    createdAt: { toDate: () => new Date('2026-07-10T00:00:00.000Z') },
    returnedAt: { toDate: () => new Date('2026-07-19T00:00:00.000Z') },
    updatedAt: { toDate: () => new Date('2026-07-19T00:00:00.000Z') },
  },
];

const candidatePayload = {
  authenticated: true,
  rentalRequestCandidate: {
    source: 'postgresql-shadow',
    authoritative: false,
    count: 2,
    sourceHash: 'hash-phase15',
    shadowSyncedAt: '2026-08-08T03:19:13.930Z',
    requests: [
      {
        ...firestoreRequests[0],
        createdAt: '2026-08-02T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
      {
        ...firestoreRequests[1],
        createdAt: '2026-07-10T00:00:00.000Z',
        returnedAt: '2026-07-19T00:00:00.000Z',
        updatedAt: '2026-07-19T00:00:00.000Z',
      },
    ],
  },
};

const candidate = readRentalRequestCandidatePayload(candidatePayload);
assert.equal(candidate.source, 'postgresql-shadow');
assert.equal(candidate.requests.length, 2);
assert.equal(candidate.shadowSyncedAt, '2026-08-08T03:19:13.930Z');

const selected = chooseRentalRequestReadSource({
  firestoreRequests,
  postgresRequests: candidate.requests,
  requested: true,
});
assert.equal(selected.source, 'postgresql-shadow');
assert.equal(selected.equivalent, true);
assert.equal(selected.fallbackReason, '');

const drift = chooseRentalRequestReadSource({
  firestoreRequests,
  postgresRequests: candidate.requests.map((request) =>
    request.id === 'REQ-2' ? { ...request, status: '보류' } : request
  ),
  requested: true,
});
assert.equal(drift.source, 'firestore-onSnapshot');
assert.equal(drift.equivalent, false);
assert.equal(drift.fallbackReason, 'rental-request-mismatch');
assert.deepEqual(drift.changedRequestIds, ['REQ-2']);
assert.ok(drift.changedFields.includes('REQ-2.status'));

const missing = chooseRentalRequestReadSource({
  firestoreRequests,
  postgresRequests: null,
  requested: true,
});
assert.equal(missing.source, 'firestore-onSnapshot');
assert.equal(missing.fallbackReason, 'postgres-candidate-unavailable');

let fallbackCalls = 0;
const noWatcherPrimary = await loadRentalRequestsWithoutFirestoreWatcher({
  loadPostgresCandidate: async () => ({ ...candidate, sourceRefreshes: 1 }),
  loadFirestoreFallback: async () => {
    fallbackCalls += 1;
    return { requests: firestoreRequests, firestoreFallbackReads: 2 };
  },
});
assert.equal(noWatcherPrimary.source, 'postgresql-shadow');
assert.equal(noWatcherPrimary.firestoreFallbackReads, 0);
assert.equal(noWatcherPrimary.requests.length, 2);
assert.equal(noWatcherPrimary.sourceRefreshes, 1);
assert.equal(noWatcherPrimary.equivalent, true);
assert.equal(fallbackCalls, 0);

const noWatcherFallback = await loadRentalRequestsWithoutFirestoreWatcher({
  loadPostgresCandidate: async () => {
    const error = new Error('candidate unavailable');
    error.code = 'candidate-unavailable';
    throw error;
  },
  loadFirestoreFallback: async () => {
    fallbackCalls += 1;
    return { requests: firestoreRequests, firestoreFallbackReads: 2 };
  },
});
assert.equal(noWatcherFallback.source, 'firestore-one-time-fallback');
assert.equal(noWatcherFallback.firestoreFallbackReads, 2);
assert.equal(noWatcherFallback.fallbackReason, 'candidate-unavailable');
assert.equal(fallbackCalls, 1);

const controllerSource = await readFile(
  new URL('../../src/features/requests/useRentalDataSubscriptionController.js', import.meta.url),
  'utf8',
);
for (const marker of [
  'readRentalRequestCutoverConfig',
  'shouldUseRentalRequestFirestoreWatcher',
  'loadRentalRequestsWithoutFirestoreWatcher',
  'chooseRentalRequestReadSource',
  'clerkStagingClient.getRentalRequestReadCandidate()',
  'clerkStagingClient.syncRentalRequestShadow(firebaseIdToken)',
  'loadPostgresCandidate({ refreshSource: true })',
  "if (!shouldUseRentalRequestFirestoreWatcher(cutoverConfig))",
  'loadFirestoreFallback: loadFirestoreOnce',
]) {
  assert.ok(controllerSource.includes(marker), `Missing Phase 15 controller marker: ${marker}`);
}
assert.match(controllerSource, /onSnapshot\(/);
assert.match(controllerSource, /getDocs\(source\)/);

const diagnosticsSource = await readFile(
  new URL('../../src/clerk/ClerkStagingDiagnostics.jsx', import.meta.url),
  'utf8',
);
assert.match(diagnosticsSource, /Clerk Staging Test · Phase (15|16|17|18|19|20|21|22|23|24|25|26)/);
assert.match(diagnosticsSource, /Phase 15 rental request read cutover/);
assert.match(diagnosticsSource, /Rental request active source/);
assert.match(diagnosticsSource, /Rental shadow source refreshes this load/);
assert.match(diagnosticsSource, /Expected rentalRequests realtime reads/);

console.log('[rental-request-read-cutover-smoke] PASS (staging gate, session latch, PostgreSQL preferred read, parity mismatch fallback, watcher-off primary path, one-time Firestore fallback)');
