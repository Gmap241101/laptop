import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'server/src/config/env.mjs',
  'server/src/db/pool.mjs',
  'server/src/auth/clerk-session.mjs',
  'server/src/clerk/clerk-api.mjs',
  'server/src/users/user-repository.mjs',
  'server/src/users/user-service.mjs',
  'server/src/firebase/firebase-id-token.mjs',
  'server/src/firestore/firestore-user-account.mjs',
  'server/src/firestore/firestore-rental-restriction.mjs',
  'server/src/firestore/firestore-rental-requests.mjs',
  'server/src/legacy/firebase-link-repository.mjs',
  'server/src/legacy/firebase-link-service.mjs',
  'server/src/legacy/member-shadow-repository.mjs',
  'server/src/legacy/member-shadow-service.mjs',
  'server/src/restrictions/rental-restriction-repository.mjs',
  'server/src/restrictions/rental-restriction-service.mjs',
  'server/src/rentals/rental-request-repository.mjs',
  'server/src/rentals/rental-request-service.mjs',
  'server/src/rentals/rental-request-write-policy.mjs',
  'server/src/rentals/rental-request-write-repository.mjs',
  'server/src/rentals/rental-request-write-service.mjs',
  'server/src/firestore/firestore-rental-request-write.mjs',
  'server/src/firestore/firestore-admin-rental-requests.mjs',
  'server/src/rentals/admin-rental-request-repository.mjs',
  'server/src/rentals/admin-rental-request-service.mjs',
  'server/src/members/member-authority-repository.mjs',
  'server/src/members/member-authority-service.mjs',
  'server/src/accounts/account-recovery-repository.mjs',
  'server/src/accounts/account-recovery-service.mjs',
  'server/src/auth/admin-identity-repository.mjs',
  'server/src/auth/admin-clerk-auth-service.mjs',
  'server/src/firestore/firestore-members.mjs',
  'server/src/app.mjs',
  'server/src/index.mjs',
  'server/scripts/check-config.mjs',
  'server/scripts/migrate.mjs',
  'tools/backend/smoke-server-handler.mjs',
  'tools/backend/smoke-clerk-auth.mjs',
  'tools/backend/smoke-clerk-user-sync.mjs',
  'tools/backend/smoke-firebase-identity-bridge.mjs',
  'tools/backend/smoke-member-profile-shadow.mjs',
  'tools/backend/smoke-member-profile-cutover.mjs',
  'tools/backend/smoke-member-profile-write-through.mjs',
  'tools/backend/smoke-rental-restriction-shadow.mjs',
  'tools/backend/smoke-rental-request-shadow.mjs',
  'tools/backend/smoke-rental-request-authoritative-write.mjs',
  'tools/backend/smoke-admin-rental-request-cutover.mjs',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const procfile = readFileSync('Procfile', 'utf8');
if (!procfile.includes('release: npm --prefix server run db:migrate')) {
  throw new Error('Procfile release migration command is missing.');
}
if (!procfile.includes('web: npm --prefix server start')) {
  throw new Error('Procfile web command is missing.');
}

const phase2Migration = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
if (!phase2Migration.includes('CREATE TABLE app_runtime_metadata')) {
  throw new Error('Phase 2 baseline migration is missing app_runtime_metadata.');
}

const phase5Migration = readFileSync('server/migrations/002_phase5_clerk_user_identity.sql', 'utf8');
for (const marker of ['CREATE TABLE app_user_identities', 'clerk_user_id TEXT NOT NULL UNIQUE', 'primary_email_verified BOOLEAN', 'ON CONFLICT (key) DO UPDATE']) {
  if (!phase5Migration.includes(marker)) throw new Error(`Phase 5 identity migration marker is missing: ${marker}`);
}

const phase6Migration = readFileSync('server/migrations/003_phase6_firebase_identity_bridge.sql', 'utf8');
for (const marker of ['CREATE TABLE IF NOT EXISTS app_user_firebase_links', 'firebase_uid TEXT NOT NULL UNIQUE', 'app_user_id BIGINT PRIMARY KEY', "jsonb_build_object('phase', 6, 'bridge', 'firebase-auth')"]) {
  if (!phase6Migration.includes(marker)) throw new Error(`Phase 6 Firebase bridge migration marker is missing: ${marker}`);
}

const phase7Migration = readFileSync('server/migrations/004_phase7_member_profile_shadow.sql', 'utf8');
for (const marker of ['CREATE TABLE IF NOT EXISTS app_user_member_shadows', 'source_hash TEXT NOT NULL', "'authoritative', 'firestore'"]) {
  if (!phase7Migration.includes(marker)) throw new Error(`Phase 7 member shadow migration marker is missing: ${marker}`);
}

const phase9Migration = readFileSync('server/migrations/005_phase9_member_profile_runtime_contract.sql', 'utf8');
for (const marker of ['identity_key TEXT', 'recovery_key TEXT', 'previous_account_uids JSONB', "'mode', 'postgresql-preferred-with-firestore-guard'"]) {
  if (!phase9Migration.includes(marker)) throw new Error(`Phase 9 runtime contract migration marker is missing: ${marker}`);
}

const phase12Migration = readFileSync('server/migrations/006_phase12_rental_restriction_shadow.sql', 'utf8');
for (const marker of ['CREATE TABLE IF NOT EXISTS app_user_rental_restriction_shadows', 'firebase_uid TEXT PRIMARY KEY', 'restriction_payload JSONB NOT NULL', 'source_hash TEXT NOT NULL']) {
  if (!phase12Migration.includes(marker)) throw new Error(`Phase 12 rental restriction migration marker is missing: ${marker}`);
}

const phase14Migration = readFileSync('server/migrations/007_phase14_rental_request_foundation.sql', 'utf8');
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_shadows',
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_item_shadows',
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_shadow_syncs',
  'source_request_id TEXT NOT NULL UNIQUE',
  "'mode', 'normalized-shadow-parallel-read'",
  "'authoritative', 'firestore'",
]) {
  if (!phase14Migration.includes(marker)) throw new Error(`Phase 14 rental request migration marker is missing: ${marker}`);
}


const phase16Migration = readFileSync('server/migrations/008_phase16_rental_request_authoritative_write.sql', 'utf8');
const phase17Migration = readFileSync('server/migrations/009_phase17_admin_rental_request_cutover.sql', 'utf8');
const phase18Migration = readFileSync('server/migrations/010_phase18_admin_rental_mutation_completion.sql', 'utf8');
const phase19Migration = readFileSync('server/migrations/011_phase19_user_action_lifecycle.sql', 'utf8');
const phase20Migration = readFileSync('server/migrations/012_phase20_asset_domain_cutover.sql', 'utf8');
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_rental_requests',
  'CREATE TABLE IF NOT EXISTS app_rental_request_items',
  'CREATE TABLE IF NOT EXISTS app_rental_asset_reservation_guards',
  'CREATE TABLE IF NOT EXISTS app_rental_request_events',
  "'authority', 'postgresql'",
  "'firestoreMirror', 'required-before-postgresql-commit'",
]) {
  if (!phase16Migration.includes(marker)) throw new Error(`Phase 16 rental request migration marker is missing: ${marker}`);
}

for (const marker of [
  'ALTER COLUMN app_user_id DROP NOT NULL',
  'ADD COLUMN IF NOT EXISTS admin_memo',
  'ADD COLUMN IF NOT EXISTS user_action_request JSONB',
  'app_rental_requests_status_created_idx',
  "'readAuthority', 'postgresql'",
  "'statusWriteAuthority', 'postgresql'",
]) {
  if (!phase17Migration.includes(marker)) throw new Error(`Phase 17 admin rental request migration marker is missing: ${marker}`);
}

for (const marker of [
  'ADD COLUMN IF NOT EXISTS source_event_id',
  'ADD COLUMN IF NOT EXISTS source_mode',
  'app_rental_request_events_source_event_unique',
  "'admin_rental_request_mutation_phase'",
  "'postMutationBootstrap', 'targeted-request-sync'",
]) {
  if (!phase18Migration.includes(marker)) throw new Error(`Phase 18 admin rental mutation migration marker is missing: ${marker}`);
}

for (const marker of [
  'app_rental_requests_user_action_pending_idx',
  "'rental_request_user_action_phase'",
  "'phase', 19",
  "'adminUserActionReviewAuthority', 'postgresql'",
]) {
  if (!phase19Migration.includes(marker)) throw new Error(`Phase 19 user action lifecycle migration marker is missing: ${marker}`);
}
for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_asset_categories',
  'CREATE TABLE IF NOT EXISTS app_rental_assets',
  'CREATE TABLE IF NOT EXISTS app_asset_catalog_syncs',
  "'asset_domain_phase'",
  "'phase', 20",
]) {
  if (!phase20Migration.includes(marker)) throw new Error(`Phase 20 asset domain migration marker is missing: ${marker}`);
}

const app = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of [
  "url.pathname === '/api/auth/session'",
  "url.pathname === '/api/users/me'",
  "url.pathname === '/api/users/me/sync'",
  "url.pathname === '/api/users/me/legacy/firebase'",
  "url.pathname === '/api/users/me/legacy/member-shadow'",
  "url.pathname === '/api/users/me/legacy/member-shadow/sync'",
  "url.pathname === '/api/users/me/legacy/member-shadow/compare'",
  "url.pathname === '/api/users/me/member-profile-candidate'",
  "url.pathname === '/api/legacy/member-profile-cutover-candidate'",
  "url.pathname === '/api/legacy/member-profile-firestore-fallback'",
  "url.pathname === '/api/legacy/member-shadow/write-through'",
  "url.pathname === '/api/legacy/rental-restriction-candidate'",
  "url.pathname === '/api/legacy/rental-restriction-firestore-fallback'",
  "url.pathname === '/api/legacy/rental-restriction-shadow/write-through'",
  "url.pathname === '/api/users/me/rental-requests'",
  "url.pathname === '/api/users/me/legacy/rental-request-shadows/sync'",
  "url.pathname === '/api/users/me/legacy/rental-request-shadows/compare'",
  "url.pathname === '/api/admin/rental-requests/bootstrap'",
  "url.pathname === '/api/admin/rental-requests'",
  "url.pathname === '/api/admin/rental-dashboard'",
  "url.pathname === '/api/assets/catalog'",
  "url.pathname === '/api/admin/assets/bootstrap'",
  "url.pathname === '/api/admin/assets'",
  "url.pathname === '/api/admin/assets/bulk'",
  "url.pathname === '/api/admin/assets/categories'",
  "source: 'postgresql-shadow'",
  'authoritative: false',
  "'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'",
  'X-Firebase-Authorization',
  "'WWW-Authenticate': 'Bearer'",
]) {
  if (!app.includes(marker)) throw new Error(`Server route/security marker is missing: ${marker}`);
}


if (!app.includes("request.method === 'POST' && url.pathname === '/api/users/me/rental-requests'")) {
  throw new Error('Phase 16 rental request create route is missing.');
}
for (const marker of ['readJsonBody', 'rentalRequestWriteService.createCurrent', "authority: result.authority", 'firestoreMirror: result.firestoreMirror']) {
  if (!app.includes(marker)) throw new Error(`Phase 16 rental request create API marker is missing: ${marker}`);
}


const auth = readFileSync('server/src/auth/clerk-session.mjs', 'utf8');
for (const marker of ["parsed.header.alg !== 'RS256'", "requireNumericDate(parsed.payload, 'exp')", "requireNumericDate(parsed.payload, 'nbf')", 'clerkAuthorizedParties.includes', "parsed.payload.sts === 'pending'"]) {
  if (!auth.includes(marker)) throw new Error(`Phase 3 Clerk verification marker is missing: ${marker}`);
}

const clerkApi = readFileSync('server/src/clerk/clerk-api.mjs', 'utf8');
for (const marker of ['Authorization: `Bearer ${secretKey}`', '/users/${encodeURIComponent(userId.trim())}', 'normalizeClerkBackendUser']) {
  if (!clerkApi.includes(marker)) throw new Error(`Phase 5 Clerk Backend API marker is missing: ${marker}`);
}

const repository = readFileSync('server/src/users/user-repository.mjs', 'utf8');
for (const marker of ['ON CONFLICT (clerk_user_id) DO UPDATE', 'WHERE clerk_user_id = $1']) {
  if (!repository.includes(marker)) throw new Error(`Phase 5 user repository marker is missing: ${marker}`);
}

const firebaseVerifier = readFileSync('server/src/firebase/firebase-id-token.mjs', 'utf8');
for (const marker of ["header.alg !== 'RS256'", 'payload.aud !== normalizedProjectId', 'https://securetoken.google.com/${normalizedProjectId}', 'x-firebase-authorization']) {
  if (!firebaseVerifier.includes(marker)) throw new Error(`Phase 6 Firebase verification marker is missing: ${marker}`);
}

const firebaseRepository = readFileSync('server/src/legacy/firebase-link-repository.mjs', 'utf8');
for (const marker of ['firebase_link_user_conflict', 'firebase_link_uid_conflict', 'findByFirebaseUid', 'ON CONFLICT (app_user_id) DO UPDATE']) {
  if (!firebaseRepository.includes(marker)) throw new Error(`Phase 6 Firebase repository marker is missing: ${marker}`);
}

const firestoreUserAccount = readFileSync('server/src/firestore/firestore-user-account.mjs', 'utf8');
for (const marker of ['firestore.googleapis.com/v1/projects/', 'Authorization: `Bearer ${token}`', 'decodeFirestoreDocument']) {
  if (!firestoreUserAccount.includes(marker)) throw new Error(`Phase 7 Firestore REST marker is missing: ${marker}`);
}

const memberShadowService = readFileSync('server/src/legacy/member-shadow-service.mjs', 'utf8');
for (const marker of ['legacy_link_token_mismatch', 'member_source_email_mismatch', 'getCurrentByFirebaseIdentity', 'readCurrentSourceByFirebaseIdentity', 'syncLinkedFirebaseUid', 'identityKey', 'previousAccountUids', 'sourceHash', 'changedFields']) {
  if (!memberShadowService.includes(marker)) throw new Error(`Phase 7 member shadow service marker is missing: ${marker}`);
}

const memberReadObservation = readFileSync('src/features/members/memberProfileReadObservation.js', 'utf8');
for (const marker of ['firestore-onSnapshot', 'compareMemberProfileReads', 'VITE_CLERK_STAGING_ENABLED', "get('clerkTest') === '1'"]) {
  if (!memberReadObservation.includes(marker)) throw new Error(`Phase 8 member read observation marker is missing: ${marker}`);
}

const subscription = readFileSync('src/features/auth/useAuthIdentityPolicySubscriptionController.js', 'utf8');
if (!subscription.includes('publishMemberProfileReadObservation')) {
  throw new Error('Phase 8 actual app Firestore subscription observation hook is missing.');
}

const memberReadCutover = readFileSync('src/features/members/memberProfileReadCutover.js', 'utf8');
for (const marker of ['VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED', "get('memberRead') === 'postgres'", 'postgresql-shadow', 'firestore-onSnapshot', 'profile-mismatch']) {
  if (!memberReadCutover.includes(marker)) throw new Error(`Phase 9 member cutover marker is missing: ${marker}`);
}
for (const marker of ['requestMemberProfileCutoverCandidate', 'chooseMemberProfileReadSource', 'Firestore fallback remains active']) {
  if (!subscription.includes(marker)) throw new Error(`Phase 9 auth subscription cutover marker is missing: ${marker}`);
}

for (const marker of ['VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED', "get('memberWatcher') === 'off'", 'requestMemberProfileFirestoreFallback', 'loadMemberProfileWithoutFirestoreWatcher', 'firestore-one-time-fallback']) {
  if (!memberReadCutover.includes(marker)) throw new Error(`Phase 10 watcher-disable marker is missing: ${marker}`);
}
for (const marker of ['shouldUseMemberProfileFirestoreWatcher', 'loadMemberProfileWithoutFirestoreWatcher', 'requestMemberProfileFirestoreFallback', 'firestoreWatcherDisabled', 'firestoreFallbackReads']) {
  if (!subscription.includes(marker)) throw new Error(`Phase 10 auth subscription watcher-disable marker is missing: ${marker}`);
}

const memberWriteThrough = readFileSync('src/features/members/memberProfileWriteThrough.js', 'utf8');
for (const marker of ['VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED', "get('memberWriteThrough') === 'on'", '/api/legacy/member-shadow/write-through', 'syncMemberProfileWriteThroughBestEffort', 'syncMemberProfilesWriteThroughBestEffort']) {
  if (!memberWriteThrough.includes(marker)) throw new Error(`Phase 11 member write-through marker is missing: ${marker}`);
}

for (const sourceFile of [
  'src/features/members/useUserMyPageAccountController.js',
  'src/features/members/useUserMembershipStatusController.js',
  'src/features/members/useAdminMemberAccountStatusActions.js',
  'src/features/members/useAdminMemberDirectoryAuditActions.js',
  'src/features/members/memberDirectorySaveService.js',
  'src/user/UserTermsConsentPanel.jsx',
]) {
  const source = readFileSync(sourceFile, 'utf8');
  if (!/syncMemberProfile(?:s)?WriteThroughBestEffort/.test(source)) {
    throw new Error(`Phase 11 write-through hook is missing: ${sourceFile}`);
  }
}

const restrictionClient = readFileSync('server/src/firestore/firestore-rental-restriction.mjs', 'utf8');
for (const marker of ['rentalRestrictions/', 'Authorization: `Bearer ${token}`', 'firestore_rental_restriction_forbidden']) {
  if (!restrictionClient.includes(marker)) throw new Error(`Phase 12 restriction Firestore client marker is missing: ${marker}`);
}

const restrictionService = readFileSync('server/src/restrictions/rental-restriction-service.mjs', 'utf8');
for (const marker of ['getCurrentByFirebaseIdentity', 'readCurrentSourceByFirebaseIdentity', 'syncLinkedFirebaseUid', 'sourceHash']) {
  if (!restrictionService.includes(marker)) throw new Error(`Phase 12 rental restriction service marker is missing: ${marker}`);
}

const restrictionCutover = readFileSync('src/features/requests/rentalRestrictionReadCutover.js', 'utf8');
for (const marker of ['VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED', "get('restrictionRead') === 'postgres'", "get('restrictionWatcher') === 'off'", '/api/legacy/rental-restriction-candidate', '/api/legacy/rental-restriction-firestore-fallback', '/api/legacy/rental-restriction-shadow/write-through']) {
  if (!restrictionCutover.includes(marker)) throw new Error(`Phase 12 rental restriction cutover marker is missing: ${marker}`);
}
for (const marker of ['readRentalRestrictionCutoverConfig', 'requestRentalRestrictionCandidate', 'requestRentalRestrictionFallback', 'setInterval(() => void refreshRestriction(), 15000)']) {
  if (!subscription.includes(marker)) throw new Error(`Phase 12 restriction subscription marker is missing: ${marker}`);
}

const rentalRequestClient = readFileSync('server/src/firestore/firestore-rental-requests.mjs', 'utf8');
for (const marker of ['documents:runQuery', "collectionId: 'rentalRequests'", 'Authorization: `Bearer ${token}`', "fieldPath: 'requesterUid'", "fieldPath: 'requesterEmail'"]) {
  if (!rentalRequestClient.includes(marker)) throw new Error(`Phase 14 rental request Firestore client marker is missing: ${marker}`);
}

const rentalRequestRepository = readFileSync('server/src/rentals/rental-request-repository.mjs', 'utf8');
for (const marker of ['app_user_rental_request_shadows', 'app_user_rental_request_item_shadows', 'app_user_rental_request_shadow_syncs', 'BEGIN', 'COMMIT', 'ROLLBACK']) {
  if (!rentalRequestRepository.includes(marker)) throw new Error(`Phase 14 rental request repository marker is missing: ${marker}`);
}

const rentalRequestService = readFileSync('server/src/rentals/rental-request-service.mjs', 'utf8');
for (const marker of ['previousAccountUids', 'requesterEmail', 'listOwnRentalRequests', 'rental_request_shadow_not_synced', 'compareCurrent', 'sourceHash']) {
  if (!rentalRequestService.includes(marker)) throw new Error(`Phase 14 rental request service marker is missing: ${marker}`);
}

const rentalRequestParity = readFileSync('src/features/requests/rentalRequestReadParity.js', 'utf8');
for (const marker of ['VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED', "get('rentalRequestParity') === '1'", 'firestore-onSnapshot', 'compareRentalRequestReads', 'requestOrder']) {
  if (!rentalRequestParity.includes(marker)) throw new Error(`Phase 14 rental request parity marker is missing: ${marker}`);
}

const rentalSubscription = readFileSync('src/features/requests/useRentalDataSubscriptionController.js', 'utf8');
if (!rentalSubscription.includes('publishRentalRequestReadObservation')) {
  throw new Error('Phase 14 actual Firestore rental request subscription observation hook is missing.');
}


const rentalRequestWriteRepository = readFileSync('server/src/rentals/rental-request-write-repository.mjs', 'utf8');
for (const marker of ['pg_advisory_xact_lock', 'app_rental_asset_reservation_guards', 'BEGIN', 'beforeCommit', 'firestore_mirror_status', 'ROLLBACK']) {
  if (!rentalRequestWriteRepository.includes(marker)) throw new Error(`Phase 16 rental request write repository marker is missing: ${marker}`);
}

const rentalRequestWriteService = readFileSync('server/src/rentals/rental-request-write-service.mjs', 'utf8');
for (const marker of ['syncLinkedFirebaseUid', 'syncCurrent', 'validateRequestedPeriod', 'commitRentalRequestCreate', "authority: 'postgresql'"]) {
  if (!rentalRequestWriteService.includes(marker)) throw new Error(`Phase 16 rental request write service marker is missing: ${marker}`);
}

const rentalRequestWriteClient = readFileSync('server/src/firestore/firestore-rental-request-write.mjs', 'utf8');
for (const marker of [':commit', 'currentDocument: { exists: false }', 'currentDocument: { updateTime: assetUpdateTime }', "Authorization: `Bearer ${token}`"]) {
  if (!rentalRequestWriteClient.includes(marker)) throw new Error(`Phase 16 Firestore compatibility mirror marker is missing: ${marker}`);
}

const adminRentalRepository = readFileSync('server/src/rentals/admin-rental-request-repository.mjs', 'utf8');
for (const marker of ['app_rental_requests', 'pg_advisory_xact_lock', 'allowNonOverlappingSameAssetRequests', 'relatedRequestUpdates', "source_mode = 'postgresql-authoritative-admin'", 'upsertImportedEvents', 'listEvents', 'async editRequest', 'async saveMemo']) {
  if (!adminRentalRepository.includes(marker)) throw new Error(`Phase 17 admin rental repository marker is missing: ${marker}`);
}
const adminRentalService = readFileSync('server/src/rentals/admin-rental-request-service.mjs', 'utf8');
for (const marker of ['verifyAdmin', 'listAllRentalRequests', 'findBlockingReservation', 'getPublicConfig', 'commitStatusChange', "authority: 'postgresql'", 'syncRequest', 'getEvents', 'editRequest', 'saveMemo', 'restoreStatus']) {
  if (!adminRentalService.includes(marker)) throw new Error(`Phase 17 admin rental service marker is missing: ${marker}`);
}
const adminRentalFirestore = readFileSync('server/src/firestore/firestore-admin-rental-requests.mjs', 'utf8');
for (const marker of ["adminAccounts/", ':runQuery', ':commit', 'Authorization: `Bearer ${token}`', 'currentDocument', 'listAllRentalRequestLogs', 'listRentalRequestLogs', 'commitRequestEdit', 'commitMemo', 'commitStatusRestore']) {
  if (!adminRentalFirestore.includes(marker)) throw new Error(`Phase 17 admin Firestore compatibility marker is missing: ${marker}`);
}


const rentalRequestUserActionRepository = readFileSync('server/src/rentals/rental-request-user-action-repository.mjs', 'utf8');
for (const marker of ['countCurrentOverdue', 'pg_advisory_xact_lock', 'editAuthoritative', 'cancelAuthoritative', 'submitManualExtension', 'autoExtendAuthoritative']) {
  if (!rentalRequestUserActionRepository.includes(marker)) throw new Error(`Phase 19 user action repository marker is missing: ${marker}`);
}
const rentalRequestUserActionService = readFileSync('server/src/rentals/rental-request-user-action-service.mjs', 'utf8');
for (const marker of ['editCurrent', 'cancelCurrent', 'extendCurrent', 'countCurrentOverdue', 'commitUserRequestEdit', 'commitUserRequestCancel', 'commitUserExtension']) {
  if (!rentalRequestUserActionService.includes(marker)) throw new Error(`Phase 19 user action service marker is missing: ${marker}`);
}
for (const marker of ['commitUserRequestEdit', 'commitUserRequestCancel', 'commitUserExtension']) {
  if (!rentalRequestWriteClient.includes(marker)) throw new Error(`Phase 19 Firestore user action mirror marker is missing: ${marker}`);
}
for (const marker of ['reviewUserAction', 'commitUserActionReview']) {
  if (!(adminRentalService.includes(marker) || adminRentalFirestore.includes(marker))) throw new Error(`Phase 19 admin user-action review marker is missing: ${marker}`);
}

const assetRepository = readFileSync('server/src/assets/asset-repository.mjs', 'utf8');
for (const marker of ['app_asset_categories', 'app_rental_assets', 'app_rental_asset_reservation_guards', 'pg_advisory_xact_lock', 'bulkCreateAuthoritative', 'saveCategoriesAuthoritative']) {
  if (!assetRepository.includes(marker)) throw new Error(`Phase 20 asset repository marker is missing: ${marker}`);
}
const assetService = readFileSync('server/src/assets/asset-service.mjs', 'utf8');
for (const marker of ['getPublicCatalog', 'bootstrap(firebaseIdentity)', 'create(firebaseIdentity', 'edit(firebaseIdentity', 'delete(firebaseIdentity', 'bulkCreate(firebaseIdentity', 'saveCategories(firebaseIdentity']) {
  if (!assetService.includes(marker)) throw new Error(`Phase 20 asset service marker is missing: ${marker}`);
}
const assetFirestore = readFileSync('server/src/firestore/firestore-assets.mjs', 'utf8');
for (const marker of ['rentalAssets', 'rentalAssetNumbers', "documentName('publicCatalog/main')", 'mirrorCreate', 'mirrorEdit', 'mirrorDelete', 'mirrorBulkCreate', 'mirrorCategories']) {
  if (!assetFirestore.includes(marker)) throw new Error(`Phase 20 asset Firestore compatibility marker is missing: ${marker}`);
}
const assetCutover = readFileSync('src/features/assets/assetDomainCutover.js', 'utf8');
for (const marker of ['VITE_ASSET_POSTGRES_READ_ENABLED', 'VITE_ASSET_POSTGRES_WRITE_ENABLED', "get('assetRead') === 'postgres'", "get('assetWrite') === 'postgres'"]) {
  if (!assetCutover.includes(marker)) throw new Error(`Phase 20 frontend asset cutover marker is missing: ${marker}`);
}


const phase22Migration = readFileSync('server/migrations/014_phase22_account_recovery_admin_clerk_auth.sql', 'utf8');
for (const marker of [
  'app_admin_identity_registry_clerk_user_uidx',
  'app_member_accounts_active_recovery_key_uidx',
  "'account_recovery_read', 'postgresql-preferred-staging-opt-in'",
  "'admin_authentication', 'clerk-authoritative-firebase-compatibility-session'",
]) {
  if (!phase22Migration.includes(marker)) throw new Error(`Phase 22 migration marker is missing: ${marker}`);
}

const accountRecoveryRepository = readFileSync('server/src/accounts/account-recovery-repository.mjs', 'utf8');
for (const marker of ['app_member_accounts', 'recovery_key = $1', "status <> 'retired'"]) {
  if (!accountRecoveryRepository.includes(marker)) throw new Error(`Phase 22 account recovery repository marker is missing: ${marker}`);
}
const accountRecoveryService = readFileSync('server/src/accounts/account-recovery-service.mjs', 'utf8');
for (const marker of ['findEmail(input)', 'verifyPasswordReset(input)', "source: 'postgresql'", "join(\'\\u001f\')"]) {
  if (!accountRecoveryService.includes(marker)) throw new Error(`Phase 22 account recovery service marker is missing: ${marker}`);
}
const adminClerkAuthService = readFileSync('server/src/auth/admin-clerk-auth-service.mjs', 'utf8');
for (const marker of ['getCurrent({ clerkUserId })', 'migrateCurrent({ firebaseIdentity, password })', 'provisionTarget({ actorClerkUserId, firebaseIdentity, targetFirebaseUid, password })', "authority: 'clerk'", 'admin_owner_required', 'skipPasswordChecks: migration']) {
  if (!adminClerkAuthService.includes(marker)) throw new Error(`Phase 22 admin Clerk auth service marker is missing: ${marker}`);
}
const adminIdentityRepository = readFileSync('server/src/auth/admin-identity-repository.mjs', 'utf8');
for (const marker of ['findByFirebaseUid', 'findByClerkUserId', 'linkClerkIdentity', 'markVerifiedLogin', "auth_authority_mode = 'clerk-authoritative-firebase-compatibility'"]) {
  if (!adminIdentityRepository.includes(marker)) throw new Error(`Phase 22 admin identity repository marker is missing: ${marker}`);
}
const accountAuthCutover = readFileSync('src/features/auth/accountAuthCutover.js', 'utf8');
for (const marker of ['VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED', 'VITE_ADMIN_CLERK_AUTH_ENABLED', "get('accountRecovery') === 'postgres'", "get('adminAuth') === 'clerk'", 'rental:account-auth-cutover']) {
  if (!accountAuthCutover.includes(marker)) throw new Error(`Phase 22 frontend account/auth cutover marker is missing: ${marker}`);
}

const configTemplate = readFileSync('docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt', 'utf8');
for (const variable of ['CLERK_JWT_KEY=', 'CLERK_AUTHORIZED_PARTIES=', 'CLERK_SECRET_KEY=sk_test_', 'CLERK_API_TIMEOUT_MS=8000', 'FIREBASE_PROJECT_ID=laptop-system-mk']) {
  if (!configTemplate.includes(variable)) throw new Error(`Phase 6 config template is missing ${variable}`);
}

console.log(`[server-check] PASS (${files.length} JavaScript files + Procfile + phase2/phase5/phase6/phase7/phase9/phase12/phase14 migrations + phase8 parallel-read + phase9 cutover + phase10 watcher-disable + phase11 write-through + phase12 restriction shadow + phase14 rental-request shadow/parity + phase16 authoritative write + phase17 admin rental-request cutover + phase18 mutation/audit completion + phase19 user-action lifecycle + phase20 asset-domain + phase21 member/restriction/admin identity authority + phase22 account recovery/admin Clerk auth invariants)`);
