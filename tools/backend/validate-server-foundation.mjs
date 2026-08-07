import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'server/src/config/env.mjs',
  'server/src/db/pool.mjs',
  'server/src/app.mjs',
  'server/src/index.mjs',
  'server/scripts/check-config.mjs',
  'server/scripts/migrate.mjs',
  'tools/backend/prepare-server-dependencies.mjs',
  'tools/backend/smoke-server-handler.mjs',
  'tools/deployment/block-legacy-deploy.mjs',
  'tools/deployment/deploy-production.mjs',
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const procfile = readFileSync('Procfile', 'utf8');
if (!procfile.includes('release: npm --prefix server run db:migrate')) throw new Error('Procfile release migration command is missing.');
if (!procfile.includes('web: npm --prefix server start')) throw new Error('Procfile web command is missing.');
const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
if (rootPackage.engines?.node !== '22.x') throw new Error('Root package.json must pin Heroku Node to 22.x.');
const migration = readFileSync('server/migrations/001_phase2_platform_baseline.sql', 'utf8');
if (!migration.includes('CREATE TABLE app_runtime_metadata')) throw new Error('Phase 2 baseline migration is missing app_runtime_metadata.');
console.log(`[server-check] PASS (${files.length} JavaScript files + Procfile + Node engine + baseline migration)`);
