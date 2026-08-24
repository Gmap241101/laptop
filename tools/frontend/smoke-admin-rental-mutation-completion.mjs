import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [mutation, detail, review, controller, diagnostics, client, adminPanel] = await Promise.all([
  read('src/features/requests/useAdminRequestMutationController.js'),
  read('src/features/requests/useAdminRequestDetailController.js'),
  read('src/features/requests/useAdminUserActionReviewController.js'),
  read('src/features/requests/useAdminRequestsController.js'),
  read('src/clerk/ClerkStagingDiagnostics.jsx'),
  read('src/clerk/clerkStagingClient.js'),
  read('src/admin/AdminRequestsPanel.jsx'),
]);

for (const marker of [
  'editAdminRentalRequest', 'saveAdminRentalRequestMemo', 'restoreAdminRentalRequestStatus',
  "writeSource: 'postgresql-authoritative'", 'firestoreMirror',
]) assert.ok(mutation.includes(marker), `Missing Phase 18 admin mutation marker: ${marker}`);

for (const marker of [
  'readAdminRentalRequestCutoverConfig', 'getAdminRentalRequestEvents',
  'PostgreSQL selected rental request events error', 'publishAdminRentalRequestCutoverObservation', "auditSource: 'postgresql'", 'mutationVersion', 'return onSnapshot(',
]) assert.ok(detail.includes(marker), `Missing Phase 18 audit-read marker: ${marker}`);
assert.equal(
  detail.includes('firebaseAuth.currentUser'),
  false,
  'PostgreSQL administrator processing-history reads must not depend on retired Firebase currentUser state',
);
assert.match(client, /requestAdminRentalRequestEvents[\s\S]*void firebaseIdToken;[\s\S]*Rental request ID is required/);
assert.match(adminPanel, /if \(status === STATUS\.APPROVED\) return '대여승인'/);
assert.match(adminPanel, /if \(status === STATUS\.DENIED\) return '대여불허'/);
assert.match(adminPanel, /getAdminRequestAuditActionLabel\(log\)/);
assert.doesNotMatch(adminPanel, /: '사용자 요청 검토'\}/, 'unknown audit actions must not be mislabeled as a user-request review');
assert.match(adminPanel, /RENTAL_REQUEST_AUDIT_ACTION\.REQUEST_CREATED/);
assert.match(adminPanel, /\? '신청자'\s*:\s*'처리 관리자'/);
assert.match(detail, /신청 상태 복구 사유를 입력해주세요\./);
assert.match(mutation, /신청 상태 복구 사유를 입력해주세요\./);
assert.match(detail, /if \(!String\(restoreReason \|\| ''\)\.trim\(\)\)/);

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

assert.match(diagnostics, /Clerk Staging Test · Phase (18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34)/);
assert.match(diagnostics, /Admin authentication: clerk-postgresql/);
assert.match(diagnostics, /Rental transaction source:/);
assert.match(adminPanel, /mutationVersion: adminRequestsMutationVersion/);

console.log('[admin-rental-mutation-completion-frontend-smoke] PASS (authoritative edit/memo/restore, PostgreSQL detail events, targeted legacy review sync, no per-mutation full bootstrap reset)');
