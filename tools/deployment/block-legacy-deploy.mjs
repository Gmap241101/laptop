console.error('[BLOCKED] `npm run deploy`는 운영 gh-pages 오발행 방지를 위해 비활성화되었습니다.');
console.error('테스트는 gh-pages-3 브랜치를 Vercel staging에 push하여 진행하십시오.');
console.error('운영 발행은 전체 검증 후 `npm run deploy:production`만 사용하십시오.');
process.exit(1);
