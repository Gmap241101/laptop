import { readFileSync } from 'node:fs';

const phase2 = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
const phase6 = readFileSync('server/migrations/003_phase6_firebase_identity_bridge.sql', 'utf8');
const phase7 = readFileSync('server/migrations/004_phase7_member_profile_shadow.sql', 'utf8');
const phase9 = readFileSync('server/migrations/005_phase9_member_profile_runtime_contract.sql', 'utf8');
const phase12 = readFileSync('server/migrations/006_phase12_rental_restriction_shadow.sql', 'utf8');
const phase14 = readFileSync('server/migrations/007_phase14_rental_request_foundation.sql', 'utf8');
const phase16 = readFileSync('server/migrations/008_phase16_rental_request_authoritative_write.sql', 'utf8');
const phase17 = readFileSync('server/migrations/009_phase17_admin_rental_request_cutover.sql', 'utf8');
const phase18 = readFileSync('server/migrations/010_phase18_admin_rental_mutation_completion.sql', 'utf8');
const phase19 = readFileSync('server/migrations/011_phase19_user_action_lifecycle.sql', 'utf8');
const phase20 = readFileSync('server/migrations/012_phase20_asset_domain_cutover.sql', 'utf8');
const phase21 = readFileSync('server/migrations/013_phase21_member_restriction_admin_identity_authority.sql', 'utf8');
const phase22 = readFileSync('server/migrations/014_phase22_account_recovery_admin_clerk_auth.sql', 'utf8');
const phase23 = readFileSync('server/migrations/015_phase23_user_clerk_auth_lifecycle.sql', 'utf8');
const phase24 = readFileSync('server/migrations/016_phase24_site_content_read_cutover.sql', 'utf8');
const phase25 = readFileSync('server/migrations/017_phase25_policy_terms_read_cutover.sql', 'utf8');
const phase26 = readFileSync('server/migrations/018_phase26_notice_faq_board_authority.sql', 'utf8');
const phase28 = readFileSync('server/migrations/019_phase28_asset_board_write_mirror_retirement.sql', 'utf8');
const phase29 = readFileSync('server/migrations/020_phase29_rental_transaction_postgresql_authority.sql', 'utf8');
const phase29ConstraintHotfix = readFileSync('server/migrations/021_phase29_rental_mirror_status_retired_constraint.sql', 'utf8');

if (!/value\s+JSONB\s+NOT\s+NULL/i.test(phase2)) {
  throw new Error('app_runtime_metadata.value must remain JSONB NOT NULL.');
}

const invalidPhase6Literal = /VALUES\s*\(\s*['"]identity_bridge_phase['"]\s*,\s*['"]phase6['"]\s*,/is;
if (invalidPhase6Literal.test(phase6)) {
  throw new Error("Phase 6 migration attempts to write plain SQL text 'phase6' into a JSONB metadata column.");
}

if (!phase6.includes("jsonb_build_object('phase', 6, 'bridge', 'firebase-auth')")) {
  throw new Error('Phase 6 migration must write structured JSONB metadata via jsonb_build_object().');
}

if (!phase6.includes('CREATE TABLE IF NOT EXISTS app_user_firebase_links')) {
  throw new Error('Phase 6 Firebase link table migration is missing.');
}

for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_user_member_shadows',
  'source_hash TEXT NOT NULL',
  'app_user_member_shadows_uid_matches_source',
  "'authoritative', 'firestore'",
]) {
  if (!phase7.includes(marker)) throw new Error(`Phase 7 member shadow migration marker is missing: ${marker}`);
}

for (const marker of [
  'ADD COLUMN IF NOT EXISTS identity_key',
  'ADD COLUMN IF NOT EXISTS recovery_key',
  'ADD COLUMN IF NOT EXISTS previous_account_uids JSONB',
  "'mode', 'postgresql-preferred-with-firestore-guard'",
]) {
  if (!phase9.includes(marker)) throw new Error(`Phase 9 member runtime-contract migration marker is missing: ${marker}`);
}

for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_user_rental_restriction_shadows',
  'firebase_uid TEXT PRIMARY KEY',
  'restriction_payload JSONB NOT NULL',
  'source_hash TEXT NOT NULL',
]) {
  if (!phase12.includes(marker)) throw new Error(`Phase 12 rental restriction shadow migration marker is missing: ${marker}`);
}

for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_shadows',
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_item_shadows',
  'CREATE TABLE IF NOT EXISTS app_user_rental_request_shadow_syncs',
  'source_request_id TEXT NOT NULL UNIQUE',
  "'mode', 'normalized-shadow-parallel-read'",
  "'authoritative', 'firestore'",
]) {
  if (!phase14.includes(marker)) throw new Error(`Phase 14 rental request migration marker is missing: ${marker}`);
}


for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_rental_requests',
  'CREATE TABLE IF NOT EXISTS app_rental_request_items',
  'CREATE TABLE IF NOT EXISTS app_rental_asset_reservation_guards',
  'CREATE TABLE IF NOT EXISTS app_rental_request_events',
  'CONSTRAINT app_rental_requests_user_idempotency_unique UNIQUE (app_user_id, idempotency_key)',
  "'authority', 'postgresql'",
  "'firestoreMirror', 'required-before-postgresql-commit'",
]) {
  if (!phase16.includes(marker)) throw new Error(`Phase 16 authoritative rental-request migration marker is missing: ${marker}`);
}

for (const marker of [
  'ALTER COLUMN app_user_id DROP NOT NULL',
  'ADD COLUMN IF NOT EXISTS admin_memo',
  'ADD COLUMN IF NOT EXISTS extension_history JSONB',
  'ADD COLUMN IF NOT EXISTS user_action_request JSONB',
  'app_rental_requests_status_created_idx',
  "'readAuthority', 'postgresql'",
  "'statusWriteAuthority', 'postgresql'",
  "'dashboardRequestCounts', 'postgresql'",
]) {
  if (!phase17.includes(marker)) throw new Error(`Phase 17 admin rental-request migration marker is missing: ${marker}`);
}


for (const marker of [
  'ADD COLUMN IF NOT EXISTS source_event_id',
  'ADD COLUMN IF NOT EXISTS source_mode',
  'app_rental_request_events_source_event_unique',
  'app_rental_request_events_request_created_desc_idx',
  "'admin_rental_request_mutation_phase'",
  "'directEditAuthority', 'postgresql'",
  "'memoAuthority', 'postgresql'",
  "'statusRestoreAuthority', 'postgresql'",
  "'auditReadAuthority', 'postgresql'",
  "'postMutationBootstrap', 'targeted-request-sync'",
]) {
  if (!phase18.includes(marker)) throw new Error(`Phase 18 admin rental mutation migration marker is missing: ${marker}`);
}


for (const marker of [
  'app_rental_requests_user_action_pending_idx',
  "'rental_request_user_action_phase'",
  "'phase', 19",
  "'adminUserActionReviewAuthority', 'postgresql'",
  "'earlyReturnRequest', 'disabled-by-existing-product-policy'",
]) {
  if (!phase19.includes(marker)) throw new Error(`Phase 19 user action lifecycle migration marker is missing: ${marker}`);
}

for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_asset_categories',
  'CREATE TABLE IF NOT EXISTS app_rental_assets',
  'CREATE TABLE IF NOT EXISTS app_asset_catalog_syncs',
  "'asset_domain_phase'",
  "'phase', 20",
  "'readAuthority', 'postgresql'",
  "'writeAuthority', 'postgresql'",
  "'firestoreCompatibilityMirror', true",
]) {
  if (!phase20.includes(marker)) throw new Error(`Phase 20 asset domain migration marker is missing: ${marker}`);
}


for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_member_accounts',
  'CREATE TABLE IF NOT EXISTS app_member_profile_events',
  'CREATE TABLE IF NOT EXISTS app_admin_identity_registry',
  'authority_mode TEXT NOT NULL DEFAULT',
  "'phase', 21",
  "'member_profile_write', 'postgresql-authoritative-firestore-mirror'",
  "'rental_restriction_write', 'postgresql-authoritative-firestore-mirror'",
  "'admin_authentication', 'firebase-auth-compatibility-retained'",
]) {
  if (!phase21.includes(marker)) throw new Error(`Phase 21 member/restriction/admin identity migration marker is missing: ${marker}`);
}

for (const marker of [
  'ADD COLUMN IF NOT EXISTS auth_authority_mode',
  'ADD COLUMN IF NOT EXISTS clerk_linked_at TIMESTAMPTZ',
  'app_admin_identity_registry_clerk_user_uidx',
  'app_member_accounts_active_recovery_key_uidx',
  "'phase', 22",
  "'account_recovery_read', 'postgresql-preferred-staging-opt-in'",
  "'admin_authentication', 'clerk-authoritative-firebase-compatibility-session'",
  "'admin_provisioning', 'existing-admin-only-clerk-plus-firebase-compatibility'",
]) {
  if (!phase22.includes(marker)) throw new Error(`Phase 22 account recovery/admin Clerk auth migration marker is missing: ${marker}`);
}

for (const marker of [
  'ADD COLUMN IF NOT EXISTS auth_authority_mode TEXT NOT NULL',
  'ADD COLUMN IF NOT EXISTS lifecycle_authority_mode TEXT NOT NULL',
  'ADD COLUMN IF NOT EXISTS clerk_account_state TEXT NOT NULL',
  'app_member_accounts_auth_authority_idx',
  "'phase', 23",
  "'user_authentication', 'clerk-authoritative-firebase-compatibility-session'",
  "'password_change', 'clerk-authoritative-firebase-compatibility-mirror'",
  "'withdrawal', 'postgresql-member-state-clerk-account-retirement-firebase-cleanup'",
]) {
  if (!phase23.includes(marker)) throw new Error(`Phase 23 user Clerk auth/lifecycle migration marker is missing: ${marker}`);
}

for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_site_content_documents',
  'CREATE TABLE IF NOT EXISTS app_site_content_syncs',
  'app_site_content_documents_domain_order_idx',
  "'phase', 24",
  "'public_read', 'postgresql-preferred-staging-opt-in'",
  "'admin_write', 'firestore-authoritative-postgresql-write-through'",
]) {
  if (!phase24.includes(marker)) throw new Error(`Phase 24 site content migration marker is missing: ${marker}`);
}

for (const marker of [
  "'phase', 25",
  "'rentalSystem/publicConfig'",
  "'signupTermsPolicy/current'",
  "'transaction_authority', 'firestore-preserved'",
  "'terms_consent_state', 'firestore-authoritative'",
  "'admin_post_login_route', 'stabilized'",
]) {
  if (!phase25.includes(marker)) throw new Error(`Phase 25 policy/terms migration marker is missing: ${marker}`);
}


for (const marker of [
  'CREATE TABLE IF NOT EXISTS app_board_configs',
  'CREATE TABLE IF NOT EXISTS app_faq_categories',
  'CREATE TABLE IF NOT EXISTS app_board_posts',
  'CREATE TABLE IF NOT EXISTS app_board_syncs',
  "'phase', 26",
  "'publicReadAuthority', 'postgresql-preferred-staging-opt-in'",
  "'adminWriteAuthority', 'postgresql-authoritative'",
  "'firestoreCompatibilityMirror', true",
  "'noticeViewCountAuthority', 'postgresql-with-client-firestore-compatibility-mirror'",
]) {
  if (!phase26.includes(marker)) throw new Error(`Phase 26 notice/FAQ board migration marker is missing: ${marker}`);
}


for (const marker of [
  "'phase', 28",
  "jsonb_build_array('assets','notice','faq')",
  "'firestoreWriteMirror', 'retired-staging-opt-in'",
  "'firebaseAdminCompatibilityIdentity', 'preserved'",
  "'memberRentalWriteMirrors', 'preserved'",
]) {
  if (!phase28.includes(marker)) throw new Error(`Phase 28 asset/board write mirror retirement marker is missing: ${marker}`);
}

if (!/INSERT\s+INTO\s+app_runtime_metadata\s*\(\s*key\s*,\s*value\s*,\s*updated_at\s*\)/is.test(phase29)) {
  throw new Error('Phase 29 migration must use app_runtime_metadata(key, value, updated_at).');
}
if (/metadata_key|metadata_value/i.test(phase29)) {
  throw new Error('Phase 29 migration must not reference nonexistent metadata_key/metadata_value columns.');
}
if (!/ON\s+CONFLICT\s*\(\s*key\s*\)\s+DO\s+UPDATE\s+SET\s+value\s*=\s*EXCLUDED\.value/is.test(phase29)) {
  throw new Error('Phase 29 migration must upsert app_runtime_metadata using key/value columns.');
}

for (const marker of [
  "'phase', 29",
  "'rentalTransactionSource', 'postgresql-authoritative'",
  "'rentalRequestFirestoreWriteMirror', 'retired-staging-opt-in'",
  "jsonb_build_array('rental-request-create','rental-request-user-actions','admin-rental-request-mutations')",
  "'firebase-admin-identity'",
  "'legacy-bootstrap-sync'",
]) {
  if (!phase29.includes(marker)) throw new Error(`Phase 29 rental transaction PostgreSQL authority marker is missing: ${marker}`);
}


if (!/DROP\s+CONSTRAINT\s+app_rental_requests_mirror_status/is.test(phase29ConstraintHotfix)) {
  throw new Error('Phase 29 constraint hotfix must replace app_rental_requests_mirror_status.');
}
if (!/firestore_mirror_status\s+IN\s*\([^)]*'retired'/is.test(phase29ConstraintHotfix)) {
  throw new Error("Phase 29 constraint hotfix must allow firestore_mirror_status='retired'.");
}
for (const marker of [
  "'phase29_rental_mirror_status_retired_constraint'",
  "'firestoreMirrorStatusRetired', true",
  "'authoritativeReadLegacySyncBypass', true",
]) {
  if (!phase29ConstraintHotfix.includes(marker)) throw new Error(`Phase 29 runtime hotfix marker is missing: ${marker}`);
}

console.log('[migration-static-check] PASS (Phase 6/7/9/12/14/16 migrations + Phase 17/18 admin rental-request cutover/mutation completion + Phase 19 user-action lifecycle + Phase 20 asset-domain + Phase 21 member/restriction/admin identity authority + Phase 22 account recovery/admin Clerk auth + Phase 23 user Clerk auth/lifecycle + Phase 24 site content + Phase 25 policy/terms + Phase 26 notice/FAQ board authority + Phase 28 asset/board write mirror retirement + Phase 29 rental transaction PostgreSQL authority + runtime constraint hotfix are type-safe)');
