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
  'firestore-server-backend-full-domain',
  'skipCache: true',
  "result.response.status === 401 && result.payload?.error === 'unauthorized'",
  'site_content_sync_source_invalid',
  'site_content_sync_count_mismatch',
]) assert.ok(cutover.includes(marker), `missing Phase 24 cutover marker: ${marker}`);

assert.ok(cutover.includes("clerkStagingClient.initialize()"), 'site-content write-through must initialize ClerkJS before requesting a token');
assert.ok(!cutover.includes('globalThis.Clerk?.session'), 'site-content write-through must not read a not-yet-hydrated global Clerk session');

for (const marker of [
  'DOMAIN_CACHE_TTL_MS = 5_000',
  'rental:site-content-invalidated',
  'mk_site_content_invalidated_v2',
  'publishSiteContentInvalidation(domain)',
  'firestore-server-backend-full-domain',
]) assert.ok(cutover.includes(marker), `missing Phase 33 mutable public-content cache/write verification marker: ${marker}`);
const refreshHook = readFileSync('src/features/content/useSiteContentRefreshRevision.js', 'utf8');
for (const marker of ['subscribeSiteContentInvalidation', "window.addEventListener('focus'", "window.addEventListener('pageshow'", "document.addEventListener('visibilitychange'"]) {
  assert.ok(refreshHook.includes(marker), `missing public-content refresh hook marker: ${marker}`);
}


for (const marker of [
  '|| authorityEnabled',
  'queryWriteRollback',
  '(authorityEnabled && !queryRollback && !queryWriteRollback)',
]) assert.ok(cutover.includes(marker), `Phase 33 public authority must force site-content write-through: ${marker}`);
const adminAuthoritySync = readFileSync('src/features/content/useAdminPublicContentSynchronizationController.js', 'utf8');
for (const marker of ['syncAllSiteContentDomainsFromFirestore', 'syncAllPolicyContentDomainsFromFirestore', 'mk_phase33_public_content_authority_repair_20260812_0117']) {
  assert.ok(adminAuthoritySync.includes(marker), `missing Phase 33 content reconciliation marker: ${marker}`);
}

const siteSettings = readFileSync('src/features/settings/useSiteSettingsController.js', 'utf8');
assert.ok(siteSettings.includes('useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.SITE_SETTINGS)'), 'site settings must refresh PostgreSQL content after invalidation/focus');
for (const marker of ['requestSiteContentDomain', 'SITE_CONTENT_DOMAINS.SITE_SETTINGS', 'getDoc(SITE_SETTINGS_DOC_REF)']) assert.ok(siteSettings.includes(marker), `missing site settings cutover marker: ${marker}`);
const home = readFileSync('src/user/UserHomePanel.jsx', 'utf8');
assert.ok(home.includes('useSiteContentRefreshRevision(SITE_CONTENT_DOMAINS.HOME)'), 'user home must refresh PostgreSQL content after invalidation/focus');
for (const marker of ['SITE_CONTENT_DOMAINS.HOME', "item.key.startsWith('homeBanners/')", "item.key === 'homePage/config'", 'PostgreSQL home banner read fallback', 'getDocsFromServer', 'site_content_home_parity_mismatch', 'firestore-parity-fallback']) assert.ok(home.includes(marker), `missing home content cutover marker: ${marker}`);
const popupFooter = readFileSync('src/features/boards/usePopupFooterContentSubscriptionController.js', 'utf8');
assert.ok(popupFooter.includes('useSiteContentRefreshRevision(USER_SITE_CONTENT_REFRESH_DOMAINS)'), 'popup/footer content must refresh PostgreSQL content after invalidation/focus');
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
for (const marker of ['Clerk Staging Test · Phase 33', 'Phase 24 site shell content PostgreSQL read + write-through', 'Site content 전체 동기화', 'Site content PostgreSQL document count', 'Site content Firestore server document count', "top: '184px'"]) assert.ok(diagnostics.includes(marker), `missing Phase 24 diagnostics marker: ${marker}`);
const app = readFileSync('src/App.jsx', 'utf8');
assert.ok(!app.includes('siteContentCutover'), 'Phase 24 must not push site content cutover logic back into App.jsx.');
assert.ok(home.includes('homeActiveHeroCount'), 'user home must publish passive PostgreSQL banner activity diagnostics');
assert.ok(popupFooter.includes('popupActiveCount'), 'user popup loader must publish passive PostgreSQL popup activity diagnostics');
assert.ok(diagnostics.includes('Home active hero / promotion / quick-link'), 'diagnostics must show passive home rendering counts without test buttons');

for (const marker of ['publicVisibility', '__publicVisibility', 'item.enabled !== false']) {
  assert.ok(home.includes(marker) || popupFooter.includes(marker) || cutover.includes(marker), `missing Phase 33 public visibility marker: ${marker}`);
}
console.log('[site-content-frontend-smoke] PASS (site settings/home/popup/footer PostgreSQL preferred reads + admin Firestore write-through + diagnostics)');
