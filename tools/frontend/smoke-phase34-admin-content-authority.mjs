import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [site, policy, repair, security, adminAccounts] = await Promise.all([
  read('src/features/content/siteContentCutover.js'),
  read('src/features/content/policyContentCutover.js'),
  read('src/features/content/useAdminPublicContentSynchronizationController.js'),
  read('src/admin/AdminAccountSecurityPanel.jsx'),
  read('src/features/auth/useAdminAccountManagementController.js'),
]);
for (const marker of ['adminAuthorityRequested', '/api/admin/site-content/', "method: 'PUT'", 'postgresql-admin-direct']) assert.ok(site.includes(marker), `site authority marker: ${marker}`);
assert.equal(site.includes("params.get('adminContent') === 'firestore'"), false, 'administrator content rollback must be removed');
assert.equal(policy.includes("params.get('policyContent') === 'firestore'"), false, 'policy rollback must be removed');
assert.equal(repair.includes('syncAllSiteContentDomainsFromFirestore'), false, 'legacy public-content repair must be removed');
assert.ok(security.includes("saveAdminSystemConfiguration('admin-security'"));
assert.ok(security.includes("saveAdminSystemConfiguration('user-session-policy'"));
assert.ok(adminAccounts.includes('createAdminAccountPostgresql'));
assert.ok(adminAccounts.includes('updateAdminAccountPostgresql'));
assert.ok(adminAccounts.includes('deleteAdminAccountPostgresql'));
console.log('[phase34-admin-content-authority-frontend-smoke] PASS (PostgreSQL admin content/security/account management; no legacy repair)');
