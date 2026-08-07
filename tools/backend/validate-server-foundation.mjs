import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'server/src/config/env.mjs',
  'server/src/db/pool.mjs',
  'server/src/auth/clerk-session.mjs',
  'server/src/clerk/clerk-api.mjs',
  'server/src/users/user-repository.mjs',
  'server/src/users/user-service.mjs',
  'server/src/app.mjs',
  'server/src/index.mjs',
  'server/scripts/check-config.mjs',
  'server/scripts/migrate.mjs',
  'tools/backend/smoke-server-handler.mjs',
  'tools/backend/smoke-clerk-auth.mjs',
  'tools/backend/smoke-clerk-user-sync.mjs',
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

const app = readFileSync('server/src/app.mjs', 'utf8');
for (const marker of ["url.pathname === '/api/auth/session'", "url.pathname === '/api/users/me'", "url.pathname === '/api/users/me/sync'", "'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'", "'WWW-Authenticate': 'Bearer'"]) {
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

const configTemplate = readFileSync('docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt', 'utf8');
for (const variable of ['CLERK_JWT_KEY=', 'CLERK_AUTHORIZED_PARTIES=', 'CLERK_SECRET_KEY=sk_test_', 'CLERK_API_TIMEOUT_MS=8000']) {
  if (!configTemplate.includes(variable)) throw new Error(`Phase 5 config template is missing ${variable}`);
}

console.log(`[server-check] PASS (${files.length} JavaScript files + Procfile + phase2/phase5 database/auth invariants)`);
