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
  'server/src/legacy/firebase-link-repository.mjs',
  'server/src/legacy/firebase-link-service.mjs',
  'server/src/legacy/member-shadow-repository.mjs',
  'server/src/legacy/member-shadow-service.mjs',
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

const app = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of ["url.pathname === '/api/auth/session'", "url.pathname === '/api/users/me'", "url.pathname === '/api/users/me/sync'", "url.pathname === '/api/users/me/legacy/firebase'", "url.pathname === '/api/users/me/legacy/member-shadow'", "url.pathname === '/api/users/me/legacy/member-shadow/sync'", "url.pathname === '/api/users/me/legacy/member-shadow/compare'", "url.pathname === '/api/users/me/member-profile-candidate'", "url.pathname === '/api/legacy/member-profile-cutover-candidate'", "url.pathname === '/api/legacy/member-profile-firestore-fallback'", "source: 'postgresql-shadow'", "authoritative: false", "'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'", "X-Firebase-Authorization", "'WWW-Authenticate': 'Bearer'"]) {
  if (!app.includes(marker)) throw new Error(`Server route/security marker is missing: ${marker}`);
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
for (const marker of ['legacy_link_token_mismatch', 'member_source_email_mismatch', 'getCurrentByFirebaseIdentity', 'readCurrentSourceByFirebaseIdentity', 'identityKey', 'previousAccountUids', 'sourceHash', 'changedFields']) {
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

const configTemplate = readFileSync('docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt', 'utf8');
for (const variable of ['CLERK_JWT_KEY=', 'CLERK_AUTHORIZED_PARTIES=', 'CLERK_SECRET_KEY=sk_test_', 'CLERK_API_TIMEOUT_MS=8000', 'FIREBASE_PROJECT_ID=laptop-system-mk']) {
  if (!configTemplate.includes(variable)) throw new Error(`Phase 6 config template is missing ${variable}`);
}

console.log(`[server-check] PASS (${files.length} JavaScript files + Procfile + phase2/phase5/phase6/phase7/phase9 database/auth + phase8 parallel-read + phase9 opt-in cutover + phase10 watcher-disable/fallback invariants)`);
