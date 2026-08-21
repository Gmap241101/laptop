import { spawnSync } from 'node:child_process';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_BRANCH,
  PRODUCTION_FRONTEND_ORIGIN,
} from './production-domain-contract.mjs';

const PRODUCTION_DOMAIN = new URL(PRODUCTION_FRONTEND_ORIGIN).hostname;
const confirmation = process.env.CONFIRM_PRODUCTION_DEPLOY;

if (confirmation !== PRODUCTION_DOMAIN) {
  console.error('[BLOCKED] 운영 발행 확인값이 없습니다.');
  console.error('gh-pages-3 검증을 완료하고 Production Clerk/API/DNS 전환을 승인한 경우에만 아래 확인값을 설정한 뒤 다시 실행하십시오.');
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
console.log(`[1/4] 운영 빌드 시작: ${PRODUCTION_DOMAIN}`);
run('npm', ['run', 'build:production']);

console.log('[2/4] 운영 빌드 결과의 CNAME/API origin 검증');
run('npm', ['run', 'production:build-artifacts:check']);

console.log('[3/4] 운영 API 도메인 검증 완료');
console.log(`[4/4] 운영 브랜치 ${PRODUCTION_BRANCH} 발행`);
run('gh-pages', ['-d', 'dist', '-b', PRODUCTION_BRANCH]);
