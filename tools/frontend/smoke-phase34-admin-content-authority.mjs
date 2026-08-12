import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [site, policy, repair, home, settings, popup, footer, terms, signupPolicy, rentalSettings, rentalSubscription] = await Promise.all([
  read('src/features/content/siteContentCutover.js'),
  read('src/features/content/policyContentCutover.js'),
  read('src/features/content/useAdminPublicContentSynchronizationController.js'),
  read('src/admin/AdminHomeBannerPanel.jsx'),
  read('src/admin/AdminSettingsPanel.jsx'),
  read('src/features/boards/useAdminPopupPostController.js'),
  read('src/features/boards/useAdminFooterContentController.js'),
  read('src/admin/AdminSignupTermsManager.jsx'),
  read('src/features/members/useAdminSignupPolicyActions.js'),
  read('src/features/settings/useAdminSystemSettingsController.js'),
  read('src/features/requests/useRentalDataSubscriptionController.js'),
]);
for (const marker of ['VITE_ADMIN_CONTENT_POSTGRES_AUTHORITY_ENABLED', 'adminAuthorityRequested', '/api/admin/site-content/', "method: 'PUT'", 'postgresql-admin-direct']) {
  assert.ok(site.includes(marker), `site authority marker: ${marker}`);
}
for (const marker of ["params.get('adminContent') === 'postgres'", "params.get('adminContent') === 'firestore'", 'queryAdminRollback']) {
  assert.ok(site.includes(marker), `admin authority switch marker: ${marker}`);
}
assert.ok(policy.includes('replacePolicyContentDomainInPostgresql'));
assert.ok(repair.includes('if (siteConfig.adminAuthorityRequested || policyConfig.adminAuthorityRequested) return undefined'));
for (const source of [home, settings, popup, footer]) {
  assert.ok(source.includes('adminAuthorityRequested'));
  assert.ok(source.includes('replaceSiteContentDomainInPostgresql'));
}
for (const source of [terms, signupPolicy, rentalSettings]) {
  assert.ok(source.includes('adminAuthorityRequested'));
  assert.ok(source.includes('replacePolicyContentDomainInPostgresql'));
}
assert.ok(terms.includes('requestPolicyContentDomain'));
assert.ok(rentalSubscription.includes("view !== 'admin' || policyContentConfig.adminAuthorityRequested"));
console.log('[phase34-admin-content-authority-frontend-smoke] PASS (flagged PostgreSQL admin reads/writes, rollback, Firestore repair suppression)');
