import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readRentalRequestUserActionCutoverConfig } from '../../src/features/requests/rentalRequestUserActionCutover.js';

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
const config = readRentalRequestUserActionCutoverConfig({
  env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED: 'true' },
  location: { search: '?rentalRequestActionWrite=postgres' }, storage,
});
assert.equal(config.requested, true);
assert.equal(readRentalRequestUserActionCutoverConfig({ env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED: 'true' }, location: { search: '' }, storage }).requested, true);
assert.equal(readRentalRequestUserActionCutoverConfig({ env: { VITE_CLERK_STAGING_ENABLED: 'true', VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED: 'false' }, location: { search: '?rentalRequestActionWrite=postgres' }, storage }).requested, false);

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [userController, adminReview, client, diagnostics, serverApp, repo, firestore] = await Promise.all([
  read('src/features/requests/useUserRequestHistoryActionController.js'),
  read('src/features/requests/useAdminUserActionReviewController.js'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('server/src/app.mjs'),
  read('server/src/rentals/rental-request-user-action-repository.mjs'),
  read('server/src/firestore/firestore-rental-request-write.mjs'),
]);
for (const marker of [
  'readRentalRequestUserActionCutoverConfig', 'extendRentalRequest', 'cancelRentalRequest', 'editRentalRequest',
  "source: 'postgresql-authoritative'", 'updatePostgresUserActionState',
  '조기 반납 요청 기능은 제공하지 않습니다.',
]) assert.ok(userController.includes(marker), `Missing Phase 19 user lifecycle marker: ${marker}`);
for (const marker of ['reviewAdminRentalUserAction', "operation: 'user-action-review'", "writeSource: 'postgresql-authoritative'"]) {
  assert.ok(adminReview.includes(marker), `Missing Phase 19 admin review marker: ${marker}`);
}
for (const marker of ['requestRentalRequestUserEdit', 'requestRentalRequestUserCancel', 'requestRentalRequestUserExtend', 'reviewAdminRentalUserAction']) {
  assert.ok(client.includes(marker), `Missing Phase 19 Clerk client marker: ${marker}`);
}
for (const marker of ['/rental-requests/:id/edit', '/rental-requests/:id/cancel', '/rental-requests/:id/extend', '/user-action-review']) {
  assert.ok(serverApp.includes(marker), `Missing Phase 19 API marker: ${marker}`);
}
assert.match(diagnostics, /Clerk Staging Test · Phase 19/);
assert.match(diagnostics, /Phase 19 rental request user action lifecycle/);
assert.match(diagnostics, /User action write source:/);
assert.match(repo, /countCurrentOverdue/);
assert.match(repo, /pg_advisory_xact_lock/);
assert.match(firestore, /commitUserRequestEdit/);
assert.match(firestore, /commitUserRequestCancel/);
assert.match(firestore, /commitUserExtension/);
console.log('[rental-request-user-action-lifecycle-frontend-smoke] PASS (opt-in latch, direct edit/cancel/extension PostgreSQL authority, admin review cutover, early return remains disabled)');
