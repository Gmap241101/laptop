import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [mutation, detail, review, controller, diagnostics, client] = await Promise.all([
  read('src/features/requests/useAdminRequestMutationController.js'),
  read('src/features/requests/useAdminRequestDetailController.js'),
  read('src/features/requests/useAdminUserActionReviewController.js'),
  read('src/features/requests/useAdminRequestsController.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/clerk/clerkStagingClient.js'),
]);

for (const marker of [
  'editAdminRentalRequest', 'saveAdminRentalRequestMemo', 'restoreAdminRentalRequestStatus',
  "writeSource: 'postgresql-authoritative'", 'firestoreMirror',
]) assert.ok(mutation.includes(marker), `Missing Phase 18 admin mutation marker: ${marker}`);

for (const marker of [
  'readAdminRentalRequestCutoverConfig', 'getAdminRentalRequestEvents', 'firebaseAuth.currentUser',
  'PostgreSQL selected rental request events error', 'publishAdminRentalRequestCutoverObservation', "auditSource: 'postgresql'", 'mutationVersion', 'return onSnapshot(',
]) assert.ok(detail.includes(marker), `Missing Phase 18 audit-read marker: ${marker}`);

for (const marker of [
  'syncAdminRentalRequest', 'readAdminRentalRequestCutoverConfig', 'Admin rental request targeted PostgreSQL sync error:',
]) assert.ok(review.includes(marker), `Missing Phase 18 targeted legacy-review sync marker: ${marker}`);

// Full collection bootstrap must not be invalidated by every mutation anymore.
assert.match(controller, /postgresBootstrapRef\.current = false;\s*\n\s*\}, \[adminCutoverConfig\.readRequested\]\);/);
assert.doesNotMatch(controller, /postgresBootstrapRef\.current = false;\s*\n\s*\}, \[[^\]]*mutationVersion[^\]]*\]\);/);

for (const marker of [
  'syncAdminRentalRequest', 'getAdminRentalRequestEvents', 'editAdminRentalRequest',
  'saveAdminRentalRequestMemo', 'restoreAdminRentalRequestStatus',
]) assert.ok(client.includes(marker), `Missing Phase 18 Clerk client method: ${marker}`);

assert.match(diagnostics, /Clerk Staging Test · Phase (18|19)/);
assert.match(diagnostics, /Phase 18 admin rental request PostgreSQL mutation completion/);
assert.match(diagnostics, /Admin processing history source:/);
const adminPanel = await read('src/admin/AdminRequestsPanel.jsx');
assert.match(adminPanel, /mutationVersion: adminRequestsMutationVersion/);

console.log('[admin-rental-mutation-completion-frontend-smoke] PASS (authoritative edit/memo/restore, PostgreSQL detail events, targeted legacy review sync, no per-mutation full bootstrap reset)');
