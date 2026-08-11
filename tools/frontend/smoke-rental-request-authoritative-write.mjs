import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { readRentalRequestWriteCutoverConfig } from '../../src/features/requests/rentalRequestWriteCutover.js';
import { chooseRentalRequestReadSource } from '../../src/features/requests/rentalRequestReadCutover.js';

const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED: 'true',
};
const state = new Map();
const storage = {
  getItem(key) { return state.has(key) ? state.get(key) : null; },
  setItem(key, value) { state.set(key, String(value)); },
  removeItem(key) { state.delete(key); },
};

const requested = readRentalRequestWriteCutoverConfig({
  env,
  location: { search: '?rentalRequestWrite=postgres' },
  storage,
});
assert.equal(requested.enabled, true);
assert.equal(requested.requested, true);

const latched = readRentalRequestWriteCutoverConfig({
  env,
  location: { search: '' },
  storage,
});
assert.equal(latched.requested, true);

const reset = readRentalRequestWriteCutoverConfig({
  env,
  location: { search: '?rentalRequestWrite=firestore' },
  storage,
});
assert.equal(reset.requested, false);

const disabled = readRentalRequestWriteCutoverConfig({
  env: { ...env, VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED: 'false' },
  location: { search: '?rentalRequestWrite=postgres' },
  storage,
});
assert.equal(disabled.requested, false);

const controllerSource = await readFile(
  new URL('../../src/features/requests/useUserRentalRequestController.js', import.meta.url),
  'utf8',
);
for (const marker of [
  'readRentalRequestWriteCutoverConfig',
  'clerkStagingClient.createRentalRequest',
  "activeWriteSource: 'postgresql-authoritative'",
  "activeWriteSource: 'firestore-transaction'",
  'runTransaction(db',
]) {
  assert.ok(controllerSource.includes(marker), `Missing Phase 16 controller marker: ${marker}`);
}

const clientSource = await readFile(
  new URL('../../src/clerk/clerkStagingClient.js', import.meta.url),
  'utf8',
);
assert.match(clientSource, /POST/);
assert.match(clientSource, /X-Firebase-Authorization/);
assert.match(clientSource, /requestRentalRequestCreate/);

const diagnosticsSource = await readFile(
  new URL('../../src/clerk/ClerkStagingDiagnostics.jsx', import.meta.url),
  'utf8',
);
assert.match(diagnosticsSource, /Clerk Staging Test · Phase (16|17|18|19|20|21|22|23|24|25|26|27|28)/);
assert.match(diagnosticsSource, /Phase 16 rental request authoritative write/);
assert.match(diagnosticsSource, /Firestore compatibility mirror/);

const nonOptInRead = chooseRentalRequestReadSource({
  firestoreRequests: [],
  postgresRequests: null,
  requested: false,
});
assert.equal(nonOptInRead.source, 'firestore-onSnapshot');
assert.equal(nonOptInRead.equivalent, null);
assert.equal(nonOptInRead.fallbackReason, 'cutover-not-requested');

console.log('[rental-request-authoritative-write-frontend-smoke] PASS (staging write gate, session latch/reset, backend write path, Firestore fallback preservation, Phase 15 non-opt-in regression fix)');
