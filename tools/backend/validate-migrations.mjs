import { readFileSync } from 'node:fs';

const phase2 = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
const phase6 = readFileSync('server/migrations/003_phase6_firebase_identity_bridge.sql', 'utf8');
const phase7 = readFileSync('server/migrations/004_phase7_member_profile_shadow.sql', 'utf8');
const phase9 = readFileSync('server/migrations/005_phase9_member_profile_runtime_contract.sql', 'utf8');
const phase12 = readFileSync('server/migrations/006_phase12_rental_restriction_shadow.sql', 'utf8');

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

console.log('[migration-static-check] PASS (Phase 6 identity bridge + Phase 7 member shadow + Phase 9 runtime contract + Phase 12 rental restriction shadow migrations are type-safe)');
