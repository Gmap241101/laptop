# GitHub Education 전환 Phase 1 - 배포 안전장치

## 목적

GitHub Education 승인 이후 기존 저장소/운영 도메인을 유지하면서 `gh-pages-3` 테스트 작업이 실수로 운영 `gh-pages`를 덮어쓰지 않도록 배포 경로를 분리한다.

## 운영 기준

- 테스트 소스 브랜치: `gh-pages-3`
- 테스트 호스팅: 기존 Vercel staging 연결을 사용
- 운영 발행 브랜치: `gh-pages`
- 운영 도메인: `https://notebook.recruit.kro.kr`
- 기존 Firebase 데이터/Rules/Auth: Phase 1에서 변경하지 않음

## 변경 사항

1. `npm run deploy`를 차단했다.
   - 과거 명령은 `gh-pages -d dist`였으며 기본 대상이 `gh-pages`이므로 테스트 중 운영 오발행 가능성이 있었다.
2. `npm run build:staging`과 `npm run build:production`을 분리했다.
3. 운영 발행은 `npm run deploy:production`만 허용한다.
4. 운영 발행 전에 `CONFIRM_PRODUCTION_DEPLOY=notebook.recruit.kro.kr` 확인값을 요구한다.
5. 운영 빌드 후 `dist/CNAME`이 `notebook.recruit.kro.kr`인지 다시 검증한 뒤에만 `gh-pages`에 발행한다.
6. `package.json`의 `homepage`를 실제 운영 도메인으로 정정했다.
7. 향후 Heroku/Clerk 비밀값이 Git에 포함되지 않도록 `.env` 계열 파일을 모두 제외한다. 설정 예시는 `.env*`가 아닌 문서 파일로 관리한다.

## 테스트 배포

`gh-pages-3`에서는 운영 배포 명령을 사용하지 않는다.

```powershell
npm ci
npm run build:staging
```

빌드 검증 후 기존 Git 절차로 `gh-pages-3`에 push하면 Vercel staging에서 확인한다.

## 운영 발행

전체 staging 검증이 끝난 이후에만 PowerShell에서 다음과 같이 명시적으로 확인값을 설정한다.

```powershell
$env:CONFIRM_PRODUCTION_DEPLOY = "notebook.recruit.kro.kr"
npm run deploy:production
Remove-Item Env:CONFIRM_PRODUCTION_DEPLOY
```

확인값이 없거나 다르면 발행은 중단된다.

## Phase 1 비변경 영역

- `src/App.jsx`
- Firebase SDK 사용 코드 전체
- Firestore collection/document 구조
- Firestore Rules 및 indexes
- Firebase Authentication
- Vercel rewrite 설정
- `public/CNAME`
- 사용자 UI/문구/업무 로직

따라서 Phase 1은 기존 기능 및 DB 호환성에 영향을 주지 않는 배포 안전성 변경이다.
