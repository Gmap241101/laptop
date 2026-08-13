import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = readFileSync('package-lock.json', 'utf8');
assert.equal(pkg.dependencies?.firebase, undefined, 'firebase npm dependency must be removed');
assert.equal(lock.includes('node_modules/firebase'), false, 'firebase package must be absent from lockfile');
assert.equal(lock.includes('node_modules/@firebase/'), false, '@firebase packages must be absent from lockfile');
assert.equal(existsSync('src/firebase.js'), false, 'legacy src/firebase.js must be removed');

const dashboard = readFileSync('src/hooks/useDashboardSummary.js', 'utf8');
for (const marker of ['getAdminRentalDashboard', 'getAdminMembers', 'getAdminRentalRequests', 'getAssetCatalog', "authority: 'postgresql'"]) {
  assert.ok(dashboard.includes(marker), `PostgreSQL dashboard marker missing: ${marker}`);
}
for (const forbidden of ['onSnapshot', 'DASHBOARD_SUMMARY_DOC_REF', 'firebaseAuth', 'dashboardSummaryService']) {
  assert.equal(dashboard.includes(forbidden), false, `dashboard must not use ${forbidden}`);
}

const client = readFileSync('src/clerk/clerkStagingClient.js', 'utf8');
assert.equal(client.includes('X-Firebase-Authorization'), false, 'frontend API client must not send Firebase authorization');

const config = readFileSync('src/features/auth/firebaseRuntimeRetirement.js', 'utf8');
assert.ok(config.includes("mode: 'removed'"));
assert.ok(config.includes('requested: true'));


const postgresOnlyRuntimeFiles = [
  'src/user/UserHomePanel.jsx',
  'src/user/UserSignupTermsSection.jsx',
  'src/features/boards/usePopupFooterContentSubscriptionController.js',
  'src/features/assets/useAssetBulkUpload.js',
  'src/features/settings/useSiteSettingsController.js',
  'src/features/terms/termsService.js',
];
for (const file of postgresOnlyRuntimeFiles) {
  const source = readFileSync(file, 'utf8');
  for (const forbidden of ['retiredLegacyDataCompat', 'appDataRefs', 'onSnapshot(', 'getDocsFromServer', 'X-Firebase-Authorization']) {
    assert.equal(source.includes(forbidden), false, `${file} must not retain legacy Firebase/Firestore runtime marker: ${forbidden}`);
  }
}
const bulkUpload = readFileSync('src/features/assets/useAssetBulkUpload.js', 'utf8');
assert.ok(bulkUpload.includes("bulkCreateAdminAssets('', parsedCandidates)"), 'asset bulk upload must use Clerk/PostgreSQL without Firebase ID token');
assert.equal(bulkUpload.includes('firebaseAuth'), false, 'asset bulk upload must not require a Firebase administrator session');

const vite = readFileSync('vite.config.js', 'utf8');
assert.equal(vite.includes('firebase/'), false, 'Vite configuration must not import Firebase');

console.log('[phase34-external-runtime-removal-frontend-smoke] PASS (retired external SDK removed, dashboard PostgreSQL-only, Clerk headers only)');
