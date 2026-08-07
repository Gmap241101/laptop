import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'server/src/config/env.mjs',
  'server/src/db/pool.mjs',
  'server/src/auth/clerk-session.mjs',
  'server/src/app.mjs',
  'server/src/index.mjs',
  'server/scripts/check-config.mjs',
  'server/scripts/migrate.mjs',
  'tools/backend/smoke-server-handler.mjs',
  'tools/backend/smoke-clerk-auth.mjs',
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

const migration = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
if (!migration.includes('CREATE TABLE app_runtime_metadata')) {
  throw new Error('Phase 2 baseline migration is missing app_runtime_metadata.');
}

const app = readFileSync('server/src/app.mjs', 'utf8');
if (!app.includes("url.pathname === '/api/auth/session'")) {
  throw new Error('Phase 3 protected Clerk session endpoint is missing.');
}
if (!app.includes("'WWW-Authenticate': 'Bearer'")) {
  throw new Error('Phase 3 authentication failure response is missing WWW-Authenticate.');
}

const auth = readFileSync('server/src/auth/clerk-session.mjs', 'utf8');
for (const marker of ["parsed.header.alg !== 'RS256'", "requireNumericDate(parsed.payload, 'exp')", "requireNumericDate(parsed.payload, 'nbf')", 'clerkAuthorizedParties.includes', "parsed.payload.sts === 'pending'"]) {
  if (!auth.includes(marker)) throw new Error(`Phase 3 Clerk verification marker is missing: ${marker}`);
}

const configTemplate = readFileSync('docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt', 'utf8');
for (const variable of ['CLERK_JWT_KEY=', 'CLERK_AUTHORIZED_PARTIES=', 'CLERK_CLOCK_SKEW_SECONDS=', 'CLERK_REJECT_PENDING_SESSION=']) {
  if (!configTemplate.includes(variable)) throw new Error(`Phase 3 config template is missing ${variable}`);
}

console.log(`[server-check] PASS (${files.length} JavaScript files + Procfile + database/auth invariants)`);
