import { spawnSync } from 'node:child_process';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
} from './production-domain-contract.mjs';

const PRODUCTION_DOMAIN = new URL(PRODUCTION_FRONTEND_ORIGIN).hostname;
const confirmation = process.env.CONFIRM_PRODUCTION_DEPLOY;

if (confirmation !== PRODUCTION_DOMAIN) {
  console.error('[BLOCKED] 운영 발행 확인값이 없습니다.');
  console.error(`CONFIRM_PRODUCTION_DEPLOY=${PRODUCTION_DOMAIN}`);
  process.exit(1);
}

const run = (name, args) => {
  const result = spawnSync(name, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`[preflight] Production frontend: ${PRODUCTION_FRONTEND_ORIGIN}`);
console.log(`[preflight] Production API: ${PRODUCTION_API_ORIGIN}`);
console.log('[1/2] 운영 GitHub Pages artifact 로컬 검증');
run('npm', ['run', 'build:production:pages']);

console.log('[2/2] 로컬 검증 완료');
console.log('운영 원격 발행은 gh-pages source push 이후 .github/workflows/pages-production.yml 이 수행합니다.');
console.log('이 명령은 gh-pages 브랜치에 dist를 직접 force-push하지 않습니다.');
