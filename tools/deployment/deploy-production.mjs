import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PRODUCTION_DOMAIN = 'notebook.recruit.kro.kr';
const confirmation = process.env.CONFIRM_PRODUCTION_DEPLOY?.trim();

if (confirmation !== PRODUCTION_DOMAIN) {
  console.error(`[deploy] BLOCKED: set CONFIRM_PRODUCTION_DEPLOY=${PRODUCTION_DOMAIN} to publish production.`);
  process.exit(1);
}

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('npm', ['run', 'build:production']);

let cname;
try {
  cname = readFileSync('dist/CNAME', 'utf8').trim();
} catch {
  console.error('[deploy] BLOCKED: dist/CNAME is missing after the production build.');
  process.exit(1);
}

if (cname !== PRODUCTION_DOMAIN) {
  console.error(`[deploy] BLOCKED: dist/CNAME must be exactly ${PRODUCTION_DOMAIN}; received ${JSON.stringify(cname)}.`);
  process.exit(1);
}

console.log(`[deploy] production CNAME verified: ${cname}`);
run('gh-pages', ['-d', 'dist', '-b', 'gh-pages']);
