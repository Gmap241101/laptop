import { readFileSync } from 'node:fs';

const phase2 = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
const phase6 = readFileSync('server/migrations/003_phase6_firebase_identity_bridge.sql', 'utf8');

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

console.log('[migration-static-check] PASS (Phase 6 JSONB metadata write is type-safe)');
