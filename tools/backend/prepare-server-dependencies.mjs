import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const expectedVersion = JSON.parse(readFileSync('server/package.json', 'utf8')).dependencies.pg;
let installedVersion = null;

try {
  installedVersion = JSON.parse(readFileSync('server/node_modules/pg/package.json', 'utf8')).version;
} catch {
  installedVersion = null;
}

if (installedVersion !== expectedVersion) {
  console.log(`[heroku] installing server dependencies (pg ${expectedVersion})`);
  const install = spawnSync(
    'npm',
    ['--prefix', 'server', 'ci', '--omit=dev', '--no-audit', '--no-fund'],
    {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    },
  );

  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
} else {
  console.log(`[heroku] server dependencies already prepared (pg ${installedVersion})`);
}

const check = spawnSync(process.execPath, ['tools/backend/validate-server-foundation.mjs'], {
  stdio: 'inherit',
  env: process.env,
});
if (check.error) throw check.error;
if (check.status !== 0) process.exit(check.status ?? 1);
