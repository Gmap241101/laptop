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
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(source.includes('replaceSiteContentDomainInPostgresql'), `PostgreSQL admin content write missing: ${file}`);
  assert.equal(source.includes('syncSiteContentDomainFromFirestore'), false, `legacy Firestore sync must be removed: ${file}`);
}

const footerAdmin = readFileSync('src/features/boards/useAdminFooterContentController.js', 'utf8');
assert.ok(footerAdmin.includes('patchSiteContentDomainInPostgresql'), 'footer administration must use PostgreSQL document-level partial writes');
assert.equal(footerAdmin.includes('replaceSiteContentDomainInPostgresql'), false, 'footer administration must not resend every rich-content page for ordinary mutations');
assert.equal(footerAdmin.includes('syncSiteContentDomainFromFirestore'), false, 'legacy Firestore sync must remain removed from footer administration');
assert.ok(footerAdmin.includes('addressClaims'), 'footer content-page writes must submit public address uniqueness claims');
assert.ok(footerAdmin.includes('normalizeFooterPageAddressId'), 'footer address IDs must be normalized client-side before PostgreSQL writes');

const signupTerms = readFileSync('src/user/UserSignupTermsSection.jsx', 'utf8');
assert.ok(signupTerms.includes('loadSignupTermsPolicy'), 'signup terms must load from PostgreSQL policy service');
for (const forbidden of ['onSnapshot', 'SIGNUP_TERMS_POLICY_DOC_REF', 'retiredLegacyDataCompat']) {
  assert.equal(signupTerms.includes(forbidden), false, `signup terms must not use Firestore: ${forbidden}`);
}

const diagnostics = readFileSync('src/clerk/ClerkStagingDiagnostics.jsx', 'utf8');
assert.ok(diagnostics.includes("top: '184px'"), 'diagnostics toast-safe top offset must remain 184px');
assert.ok(diagnostics.includes('phase34-rental-config-postgresql-bootstrap-hotfix-20260812-1545'));
assert.ok(diagnostics.includes('phase34-postgresql-payload-mapping-hotfix-20260812-1635'));

console.log('[site-content-frontend-smoke] PASS (Phase 34 PostgreSQL-only settings/home/popup/footer/terms runtime)');

// Execute the successful PostgreSQL response mapping path so undefined legacy helpers
// such as reviveValue cannot pass a static marker-only smoke.
const cutoverModule = await import('../../src/features/content/siteContentCutover.js');
const mapped = await cutoverModule.requestSiteContentDomain({
  domain: 'rental-config',
  config: {
    readRequested: true,
    apiBaseUrl: 'https://example.invalid',
  },
  useCache: false,
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        siteContent: {
          domain: 'rental-config',
          source: 'postgresql',
          documents: [{
            key: 'rentalSystem/publicConfig',
            payload: {
              storageVersion: 1,
              assetCategories: ['노트북'],
              teams: ['테스트팀'],
              settings: { maxRentalDays: 14 },
            },
          }],
        },
      };
    },
  }),
  observationPublisher: () => {},
});
assert.equal(mapped?.documents?.[0]?.key, 'rentalSystem/publicConfig');
assert.equal(mapped?.documents?.[0]?.payload?.settings?.maxRentalDays, 14);
assert.equal(cutover.includes('reviveValue('), false, 'Phase 34 PostgreSQL payload mapping must not call removed Firestore reviveValue helper');
console.log('[site-content-frontend-runtime-mapping-smoke] PASS');
