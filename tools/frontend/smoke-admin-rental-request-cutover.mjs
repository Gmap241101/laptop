import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readAdminRentalRequestCutoverConfig } from '../../src/features/requests/adminRentalRequestCutover.js';

const state = new Map();
const storage = {
  getItem(key) { return state.has(key) ? state.get(key) : null; },
  setItem(key, value) { state.set(key, String(value)); },
  removeItem(key) { state.delete(key); },
};
const env = {
  VITE_CLERK_STAGING_ENABLED: 'true',
  VITE_ADMIN_RENTAL_REQUEST_POSTGRES_READ_ENABLED: 'true',
  VITE_ADMIN_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED: 'true',
};
const requested = readAdminRentalRequestCutoverConfig({
  env,
  location: { search: '?adminRequestRead=postgres&adminRequestWrite=postgres' },
  storage,
});
assert.equal(requested.readRequested, true);
assert.equal(requested.writeRequested, true);
const latched = readAdminRentalRequestCutoverConfig({ env, location: { search: '' }, storage });
assert.equal(latched.readRequested, true);
assert.equal(latched.writeRequested, true);
const reset = readAdminRentalRequestCutoverConfig({
  env,
  location: { search: '?adminRequestRead=firestore&adminRequestWrite=firestore' },
  storage,
});
assert.equal(reset.readRequested, false);
assert.equal(reset.writeRequested, false);

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [controller, mutation, diagnostics, dashboard, guard, app, client] = await Promise.all([
  read('src/features/requests/useAdminRequestsController.js'),
  read('src/features/requests/useAdminRequestMutationController.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/hooks/useDashboardSummary.js'),
  read('src/features/requests/useSelectedRentalAssetAvailabilityGuard.js'),
  read('src/App.jsx'),
  read('src/clerk/clerkStagingClient.js'),
]);
for (const marker of [
  'bootstrapAdminRentalRequests', 'getAdminRentalRequests', "readSource: 'postgresql'",
  "readSource: 'firestore-fallback'", "firestoreWatcher: 'disabled'", 'postgresBootstrapRef.current = false', 'setPostgresFallbackActive(false)',
]) assert.ok(controller.includes(marker), `Missing Phase 17 admin read marker: ${marker}`);
for (const marker of [
  'changeAdminRentalRequestStatus', "writeSource: 'postgresql-authoritative'", 'firestoreMirror',
]) assert.ok(mutation.includes(marker), `Missing Phase 17 admin status marker: ${marker}`);
for (const marker of [
  'requestAdminRentalRequestBootstrap', 'requestAdminRentalRequests', 'requestAdminRentalDashboard', 'requestAdminRentalRequestStatusChange',
]) assert.ok(client.includes(marker), `Missing Phase 17 Clerk client marker: ${marker}`);
assert.match(diagnostics, /Clerk Staging Test · Phase (?:17|18|19|20|21|22|23|24|25|26)/);
assert.match(diagnostics, /Phase (?:17 admin rental request PostgreSQL cutover|18 admin rental request PostgreSQL mutation completion)/);
assert.match(dashboard, /rentalRequestMetricSource: 'postgresql-phase17'/);
assert.match(dashboard, /getAdminRentalDashboard/);

// Phase 16 false availability toast regression: do not clear the just-submitted asset while mirror snapshots arrive.
assert.match(guard, /if \(requestSubmitLoading \|\| !selectedLaptop/);
assert.match(app, /useSelectedRentalAssetAvailabilityGuard\(\{[\s\S]*requestSubmitLoading/);

console.log('[admin-rental-request-cutover-frontend-smoke] PASS (staging gates/latch, PostgreSQL admin read/status paths, Firestore fallback, dashboard counts, Phase16 false-toast suppression)');
