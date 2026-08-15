import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['server/src', 'src'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);
const RETIRED_PHYSICAL_STORES = Object.freeze([
  'app_user_member_shadows',
  'app_user_rental_request_shadows',
  'app_user_rental_request_item_shadows',
  'app_user_rental_request_shadow_syncs',
  'app_user_rental_restriction_shadows',
  'app_asset_catalog_syncs',
  'app_site_content_syncs',
  'app_board_syncs',
]);

const walk = (root) => {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) files.push(path);
  }
  return files;
};

const sourceFiles = ROOTS.flatMap(walk);

// Exhaustively inventory every historical table whose physical name encoded a
// shadow/sync compatibility role. Every such store must be accounted for by the
// Phase 34 retirement list so a forgotten legacy table cannot silently survive.
const historicalMigrationSources = readdirSync('server/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(join('server/migrations', name), 'utf8'))
  .join('\n');
const historicalCompatibilityStores = [...historicalMigrationSources.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1])
  .filter((name) => /(?:_shadows?|_syncs?)$/.test(name))
  .sort();
assert.deepEqual(
  historicalCompatibilityStores,
  [...RETIRED_PHYSICAL_STORES].sort(),
  'every historical shadow/sync physical store must be explicitly retired by Phase 34',
);

const violations = [];
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const store of RETIRED_PHYSICAL_STORES) {
    if (source.includes(store)) violations.push(`${relative('.', file)} -> ${store}`);
  }
}
assert.deepEqual(
  violations,
  [],
  `active runtime must not reference physically retired duplicate stores:\n${violations.join('\n')}`,
);

const migration028 = readFileSync('server/migrations/028_phase34_canonical_data_consolidation.sql', 'utf8');
for (const store of [
  'app_user_member_shadows',
  'app_user_rental_request_shadows',
  'app_user_rental_request_item_shadows',
  'app_user_rental_request_shadow_syncs',
]) {
  assert.ok(migration028.includes(`DROP TABLE IF EXISTS ${store}`), `migration 028 must physically remove ${store}`);
}

const migration029 = readFileSync('server/migrations/029_phase34_retired_store_physical_removal.sql', 'utf8');
for (const store of RETIRED_PHYSICAL_STORES) {
  assert.ok(migration029.includes(`DROP TABLE IF EXISTS ${store}`), `migration 029 must physically finalize removal of ${store}`);
}
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_rental_restrictions',
  'INSERT INTO app_rental_restrictions',
  'legacyRentalRestrictionRowsVerified',
  "source_mode = 'postgresql-canonical'",
  'legacy reservation snapshot guards remain without canonical rental requests',
  "payload->'borrowers'",
  'INSERT INTO app_member_directory_entries',
  'legacyRentalConfigBorrowerRowsVerified',
  "payload - 'assetCategories' - 'borrowers'",
  "- 'signupTermsEnabled'",
  "- 'signupTermsRequireReconsentOnChange'",
  "- 'signupTermsApplyToExistingMembers'",
  "'rentalConfigBorrowerCopyRemoved', TRUE",
  "'rentalConfigDuplicateFieldsRemoved', TRUE",
  'CREATE OR REPLACE VIEW app_asset_catalog_status',
  'CREATE OR REPLACE VIEW app_board_status',
  "DELETE FROM app_runtime_metadata WHERE key='phase30_member_accounts_full_bootstrap'",
  "'physicalDropCompleted', TRUE",
  "'signupTermsPolicyContentCopiesRemoved', TRUE",
  "entry.value - 'contentHtml' - 'contentText'",
  'at least one retired physical store still exists after cleanup',
]) {
  assert.ok(migration029.includes(marker), `migration 029 missing canonicalization marker: ${marker}`);
}

for (const protectedStore of [
  'app_user_firebase_links',
  'app_user_identities',
  'app_member_accounts',
  'app_member_directory_entries',
  'app_rental_requests',
  'app_user_term_consent_states',
  'app_user_term_consent_logs',
]) {
  const dropPattern = new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${protectedStore}`, 'i');
  assert.equal(dropPattern.test(migration029), false, `migration 029 must preserve non-duplicate canonical/identity/history store ${protectedStore}`);
}

const boardService = readFileSync('server/src/boards/board-service.mjs', 'utf8');
assert.equal(boardService.includes('firestoreClient'), false, 'board runtime must not retain a Firestore mirror client');
assert.equal(boardService.includes('writeMirrorEnabled'), false, 'board runtime must not retain write-mirror switching');

const siteContentRepository = readFileSync('server/src/content/site-content-repository.mjs', 'utf8');
assert.equal(siteContentRepository.includes('app_site_content_syncs'), false, 'site-content runtime must derive metadata from canonical documents');

const assetRepository = readFileSync('server/src/assets/asset-repository.mjs', 'utf8');
assert.equal(assetRepository.includes('app_asset_catalog_syncs'), false, 'asset runtime must not persist duplicate catalog sync state');
assert.ok(assetRepository.includes('app_asset_catalog_status'), 'asset runtime must use canonical derived catalog status');


const rentalWriteRepository = readFileSync('server/src/rentals/rental-request-write-repository.mjs', 'utf8');
assert.equal(rentalWriteRepository.includes('firestore-snapshot'), false, 'rental-request writes must not recreate legacy reservation snapshot rows');
assert.equal(rentalWriteRepository.includes('sourceReservations'), false, 'rental-request repository must not accept legacy reservation snapshots');

assert.equal(assetRepository.includes('firestore-imported-legacy'), false, 'asset repository must not retain the retired source-import bootstrap path');
assert.equal(assetRepository.includes('async bootstrap({ categories, assets'), false, 'asset repository must not expose legacy source replacement bootstrap');

const boardRepository = readFileSync('server/src/boards/board-repository.mjs', 'utf8');
assert.equal(boardRepository.includes('app_board_syncs'), false, 'board runtime must not persist duplicate board sync state');
assert.ok(boardRepository.includes('app_board_status'), 'board runtime must use canonical derived board status');

const restrictionRepository = readFileSync('server/src/restrictions/rental-restriction-repository.mjs', 'utf8');
assert.ok(restrictionRepository.includes('app_rental_restrictions'), 'rental restriction runtime must use canonical restriction table');
assert.equal(restrictionRepository.includes('app_user_rental_restriction_shadows'), false, 'rental restriction runtime must not use legacy shadow table');


const restrictionService = readFileSync('server/src/restrictions/rental-restriction-service.mjs', 'utf8');
assert.equal(restrictionService.includes('firestoreRentalRestrictionClient'), false, 'rental restriction service must not retain a legacy source client');
assert.equal(restrictionService.includes('syncLinkedFirebaseUid'), false, 'rental restriction service must not retain shadow synchronization');
assert.equal(restrictionService.includes('readCurrentSourceByFirebaseIdentity'), false, 'rental restriction service must not expose retired source reads');

const appSource = readFileSync('server/src/app.mjs', 'utf8');
assert.ok(appSource.includes("error: 'legacy_rental_restriction_source_retired'"), 'legacy restriction fallback endpoint must be a 410 tombstone');
assert.ok(appSource.includes("error: 'legacy_rental_restriction_write_through_retired'"), 'legacy restriction write-through endpoint must be a 410 tombstone');
assert.equal(appSource.includes('seededPostgresShadow'), false, 'HTTP runtime must not report newly seeded restriction shadows');


const siteContentService = readFileSync('server/src/content/site-content-service.mjs', 'utf8');
for (const marker of [
  'assetCategories: _assetCategories',
  'borrowers: _borrowers',
  'signupTermsEnabled: _signupTermsEnabled',
  'signupTermsRequireReconsentOnChange: _signupTermsRequireReconsentOnChange',
  'signupTermsApplyToExistingMembers: _signupTermsApplyToExistingMembers',
]) assert.ok(siteContentService.includes(marker), `rental-config writes must strip retired duplicate field: ${marker}`);

const memberAuthorityRepository = readFileSync('server/src/members/member-authority-repository.mjs', 'utf8');
assert.equal(memberAuthorityRepository.includes('bootstrapMemberAccounts'), false, 'member repository must not retain legacy member-account bootstrap');
assert.equal(memberAuthorityRepository.includes('getFullBootstrapState'), false, 'member repository must not retain full-bootstrap runtime gating');

const adminRentalRepository = readFileSync('server/src/rentals/admin-rental-request-repository.mjs', 'utf8');
for (const retiredMarker of ['upsertImportedRequests', 'upsertImportedEvents', 'beforeCommit', 'markMirrorRetired']) {
  assert.equal(adminRentalRepository.includes(retiredMarker), false, `admin rental repository must not retain ${retiredMarker}`);
}

assert.equal(assetRepository.includes('beforeCommit'), false, 'asset repository must not retain external mirror commit hooks');
assert.equal(boardRepository.includes('beforeCommit'), false, 'board repository must not retain external mirror commit hooks');
assert.equal(boardRepository.includes("mirror_state='pending'"), false, 'board repository must not recreate pending mirror state');
assert.equal(rentalWriteRepository.includes('beforeCommit'), false, 'rental-request repository must not retain external mirror commit hooks');

const rentalUserActionRepository = readFileSync('server/src/rentals/rental-request-user-action-repository.mjs', 'utf8');
assert.equal(rentalUserActionRepository.includes('beforeCommit'), false, 'rental user-action repository must not retain external mirror commit hooks');

const termsConstants = readFileSync('src/features/terms/termsConstants.js', 'utf8');
assert.ok(termsConstants.includes('normalizeActiveTermMetadata'), 'terms policy normalization must have a metadata-only active-term projection');
assert.ok(termsConstants.includes('.map(normalizeActiveTermMetadata)'), 'terms policy persistence must not copy rich term bodies into activeTerms');

const rentalWriteService = readFileSync('server/src/rentals/rental-request-write-service.mjs', 'utf8');
for (const retiredMarker of ['writeMirrorEnabled', 'firestoreRentalRequestWriteClient', 'firestore-compatibility-source', 'syncLinkedFirebaseUid', 'beforeCommit']) {
  assert.equal(rentalWriteService.includes(retiredMarker), false, `rental request create runtime must not retain ${retiredMarker}`);
}

const rentalUserActionService = readFileSync('server/src/rentals/rental-request-user-action-service.mjs', 'utf8');
for (const retiredMarker of ['writeMirrorEnabled', 'firestoreClient', 'firestore-compatibility-source', 'syncLinkedFirebaseUid', 'beforeCommit']) {
  assert.equal(rentalUserActionService.includes(retiredMarker), false, `rental user-action runtime must not retain ${retiredMarker}`);
}

const adminRentalService = readFileSync('server/src/rentals/admin-rental-request-service.mjs', 'utf8');
for (const retiredMarker of ['writeMirrorEnabled', 'firestoreClient', 'firestore-compatibility-source', 'upsertImportedRequests', 'beforeCommit']) {
  assert.equal(adminRentalService.includes(retiredMarker), false, `admin rental runtime must not retain ${retiredMarker}`);
}

const memberAuthorityService = readFileSync('server/src/members/member-authority-service.mjs', 'utf8');
for (const retiredMarker of ['writeMirrorEnabled', 'profileWriteMirrorEnabled', 'firestoreClient']) {
  assert.equal(memberAuthorityService.includes(retiredMarker), false, `member authority runtime must not retain ${retiredMarker}`);
}
console.log('[phase34-canonical-store-cleanup-backend-smoke] PASS', {
  scannedRuntimeFiles: sourceFiles.length,
  retiredPhysicalStoreReferences: violations.length,
  protectedStoresPreserved: true,
});
