import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PRODUCTION_DOMAIN = 'notebook.recruit.kro.kr';
const PRODUCTION_BRANCH = 'gh-pages';
const confirmation = process.env.CONFIRM_PRODUCTION_DEPLOY;

if (confirmation !== PRODUCTION_DOMAIN) {
  console.error('[BLOCKED] 운영 발행 확인값이 없습니다.');
  console.error('gh-pages-3 검증을 완료한 경우에만 아래 확인값을 설정한 뒤 다시 실행하십시오.');
  console.error(`CONFIRM_PRODUCTION_DEPLOY=${PRODUCTION_DOMAIN}`);
  process.exit(1);
}

const run = (name, args) => {
  const result = spawnSync(name, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log(`[1/3] 운영 빌드 시작: ${PRODUCTION_DOMAIN}`);
run('npm', ['run', 'build:production']);

let cname = '';
try {
  cname = readFileSync('dist/CNAME', 'utf8').trim();
} catch {
  console.error('[BLOCKED] 운영 빌드 결과에 dist/CNAME이 없습니다.');
  process.exit(1);
}

if (cname !== PRODUCTION_DOMAIN) {
  console.error(`[BLOCKED] dist/CNAME 불일치: expected=${PRODUCTION_DOMAIN}, actual=${cname || '(empty)'}`);
  process.exit(1);
}

console.log(`[2/3] CNAME 검증 완료: ${cname}`);
console.log(`[3/3] 운영 브랜치 ${PRODUCTION_BRANCH} 발행`);
run('gh-pages', ['-d', 'dist', '-b', PRODUCTION_BRANCH]);
