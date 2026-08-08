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

console.log('[migration-static-check] PASS (Phase 6/7/9/12/14/16 migrations + Phase 17/18 admin rental-request cutover/mutation completion + Phase 19 user-action lifecycle + Phase 20 asset-domain cutover are type-safe)');
