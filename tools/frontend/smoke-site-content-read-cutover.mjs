import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/content/siteContentCutover.js', 'utf8');
for (const marker of [
  "SITE_SETTINGS: 'site-settings'",
  "HOME: 'home'",
  "POPUP: 'popup'",
  "FOOTER: 'footer'",
  '/api/site-content/',
  '/api/admin/site-content/',
  "authorityEnabled = Boolean(apiBaseUrl)",
  'fallbackAllowed: false',
  "sourceMode !== 'postgresql-admin-direct'",
  'publishSiteContentInvalidation(domain)',
]) assert.ok(cutover.includes(marker), `missing Phase 34 PostgreSQL site-content marker: ${marker}`);

for (const forbidden of [
  'FromFirestore',
  'firestore-parity-fallback',
  'getDocsFromServer',
  'X-Firebase-Authorization',
]) assert.equal(cutover.includes(forbidden), false, `site-content authority must not contain legacy marker: ${forbidden}`);

const home = readFileSync('src/user/UserHomePanel.jsx', 'utf8');
for (const marker of [
  'requestSiteContentDomain',
  'SITE_CONTENT_DOMAINS.HOME',
  "item.key.startsWith('homeBanners/')",
  "item.key === 'homePage/config'",
  "readSource: 'postgresql'",
]) assert.ok(home.includes(marker), `user home PostgreSQL marker missing: ${marker}`);
for (const forbidden of ['retiredLegacyDataCompat', 'appDataRefs', 'getDocsFromServer', 'getDocs(', 'getDoc(', 'firestore-parity-fallback']) {
  assert.equal(home.includes(forbidden), false, `user home must not retain Firestore path: ${forbidden}`);
}

const popupFooter = readFileSync('src/features/boards/usePopupFooterContentSubscriptionController.js', 'utf8');
for (const marker of [
  'requestSiteContentDomain',
  'SITE_CONTENT_DOMAINS.POPUP',
  'SITE_CONTENT_DOMAINS.FOOTER',
  "item.key.startsWith('popupPosts/')",
  "item.key.startsWith('footerPages/')",
  "item.key === 'siteFooter/config'",
]) assert.ok(popupFooter.includes(marker), `popup/footer PostgreSQL marker missing: ${marker}`);
for (const forbidden of ['retiredLegacyDataCompat', 'appDataRefs', 'getDocsFromServer', 'getDocs(', 'getDoc(', 'onSnapshot(', 'Firestore Rules']) {
  assert.equal(popupFooter.includes(forbidden), false, `popup/footer must not retain Firestore path: ${forbidden}`);
}

const settings = readFileSync('src/features/settings/useSiteSettingsController.js', 'utf8');
for (const marker of ['requestSiteContentDomain', 'SITE_CONTENT_DOMAINS.SITE_SETTINGS', "item.key === 'siteSettings/config'"]) {
  assert.ok(settings.includes(marker), `site settings PostgreSQL marker missing: ${marker}`);
}

for (const file of [
  'src/admin/AdminSettingsPanel.jsx',
  'src/admin/AdminHomeBannerPanel.jsx',
  'src/features/boards/useAdminPopupPostController.js',
  'src/features/boards/useAdminFooterContentController.js',
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('replaceSiteContentDomainInPostgresql'), `PostgreSQL admin content write missing: ${file}`);
  assert.equal(source.includes('syncSiteContentDomainFromFirestore'), false, `legacy Firestore sync must be removed: ${file}`);
}

const signupTerms = readFileSync('src/user/UserSignupTermsSection.jsx', 'utf8');
assert.ok(signupTerms.includes('loadSignupTermsPolicy'), 'signup terms must load from PostgreSQL policy service');
for (const forbidden of ['onSnapshot', 'SIGNUP_TERMS_POLICY_DOC_REF', 'retiredLegacyDataCompat']) {
  assert.equal(signupTerms.includes(forbidden), false, `signup terms must not use Firestore: ${forbidden}`);
}

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
assert.ok(diagnostics.includes("top: '184px'"), 'diagnostics toast-safe top offset must remain 184px');
assert.ok(diagnostics.includes('phase34-rental-config-postgresql-bootstrap-hotfix-20260812-1545'));

console.log('[site-content-frontend-smoke] PASS (Phase 34 PostgreSQL-only settings/home/popup/footer/terms runtime)');
