import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cutover = readFileSync('src/features/content/siteContentCutover.js', 'utf8');
for (const marker of [
  'VITE_SITE_CONTENT_POSTGRES_READ_ENABLED',
  'VITE_SITE_CONTENT_WRITE_THROUGH_ENABLED',
  "params.get('siteContent') === 'postgres'",
  "params.get('siteContentWrite') === 'postgres'",
  "SITE_SETTINGS: 'site-settings'",
  "HOME: 'home'",
  "POPUP: 'popup'",
  "FOOTER: 'footer'",
  '/api/site-content/',
  '/api/admin/site-content/',
  'syncAllSiteContentDomainsFromFirestore',
  'getDocFromServer',
  'getDocsFromServer',
  'site_content_sync_count_mismatch',
]) assert.ok(cutover.includes(marker), `missing Phase 24 cutover marker: ${marker}`);


for (const marker of [
  '|| authorityEnabled',
  'queryWriteRollback',
  '(authorityEnabled && !queryRollback && !queryWriteRollback)',
]) assert.ok(cutover.includes(marker), `Phase 33 public authority must force site-content write-through: ${marker}`);
const adminAuthoritySync = readFileSync('src/features/content/useAdminPublicContentSynchronizationController.js', 'utf8');
for (const marker of ['syncAllSiteContentDomainsFromFirestore', 'syncAllPolicyContentDomainsFromFirestore', 'mk_phase33_public_content_authority_repair_20260811_2355']) {
  assert.ok(adminAuthoritySync.includes(marker), `missing Phase 33 content reconciliation marker: ${marker}`);
}

const siteSettings = readFileSync('src/features/settings/useSiteSettingsController.js', 'utf8');
for (const marker of ['requestSiteContentDomain', 'SITE_CONTENT_DOMAINS.SITE_SETTINGS', 'getDoc(SITE_SETTINGS_DOC_REF)']) assert.ok(siteSettings.includes(marker), `missing site settings cutover marker: ${marker}`);
const home = readFileSync('src/user/UserHomePanel.jsx', 'utf8');
for (const marker of ['SITE_CONTENT_DOMAINS.HOME', "item.key.startsWith('homeBanners/')", "item.key === 'homePage/config'", 'PostgreSQL home banner read fallback', 'getDocsFromServer', 'site_content_home_parity_mismatch', 'firestore-parity-fallback']) assert.ok(home.includes(marker), `missing home content cutover marker: ${marker}`);
const popupFooter = readFileSync('src/features/boards/usePopupFooterContentSubscriptionController.js', 'utf8');
for (const marker of ['SITE_CONTENT_DOMAINS.POPUP', 'SITE_CONTENT_DOMAINS.FOOTER', "item.key.startsWith('popupPosts/')", "item.key.startsWith('footerPages/')", "item.key === 'siteFooter/config'", 'getDocsFromServer', 'site_content_popup_parity_mismatch', 'site_content_footer_parity_mismatch']) assert.ok(popupFooter.includes(marker), `missing popup/footer cutover marker: ${marker}`);
for (const file of [
  'src/admin/AdminSettingsPanel.jsx',
  'src/admin/AdminHomeBannerPanel.jsx',
  'src/features/boards/useAdminPopupPostController.js',
  'src/features/boards/useAdminFooterContentController.js',
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('syncSiteContentDomainFromFirestore'), `missing Phase 24 write-through in ${file}`);
}
const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
for (const marker of ['Clerk Staging Test · Phase 33', 'Phase 24 site shell content PostgreSQL read + write-through', 'Site content 전체 동기화', 'Site content PostgreSQL enabled count', 'Site content Firestore server enabled count', "top: '184px'"]) assert.ok(diagnostics.includes(marker), `missing Phase 24 diagnostics marker: ${marker}`);
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('siteContentCutover'), 'Phase 24 must not push site content cutover logic back into App.jsx.');
console.log('[site-content-frontend-smoke] PASS (site settings/home/popup/footer PostgreSQL preferred reads + admin Firestore write-through + diagnostics)');
