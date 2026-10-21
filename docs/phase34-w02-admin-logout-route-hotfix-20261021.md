# Phase 34 W02 — 관리자 로그아웃 `/admin` 경로 유지 핫픽스

- 작성: 2026-10-21
- 기준: W02 관리자 로그아웃 전환 핫픽스 Full ZIP (`2cc21cabb3734606e8304ff0ad551b40d800aa9d`, Staging Frontend 기준)
- 증상: 관리자 로그아웃 → 잠깐 관리자 로그인 화면 → 사용자 초기화면 `/`으로 자동 이동
- 원인: 이전 핫픽스의 `clerkStagingClient.signOut()`이 ClerkJS의 기본 로그아웃 후 이동 주소를 사용함. 관리자 `/admin` 경로가 명시되지 않아 기본 `/` 이동 가능.
- 근거: ClerkJS `signOut({ redirectUrl })` 공식 API 및 `Clerk.load({ afterSignOutUrl })` 공식 설정.

## 변경

1. `src/features/auth/adminClerkSignOutPolicy.js` 신규: 관리자 모드일 때 `redirectUrl: '/admin'`을 명시하고, 사용자 모드의 기본값은 그대로 유지.
2. `src/features/auth/useAdminAuthenticationController.js`: 관리자 로그인, 로그아웃 및 세션 정리 경로에서 위 정책을 재사용. 사용자의 마이페이지로 이동하는 별도 버튼은 변경하지 않음.
3. `src/clerk/clerkStagingClient.js`: `/admin` 문서에서 ClerkJS 초기화 시 `afterSignOutUrl` 및 `afterMultiSessionSingleSignOutUrl`을 `/admin`으로 설정. 사용자 문서에서는 이 값을 주입하지 않음.
4. `tools/frontend/smoke-phase34-w02-admin-auth-transition.mjs`: 순수 정책 함수와 실제 Clerk 어댑터에 대한 가짜 `signOut` 호출 결과, 사용자 모드 미변경, 관리자/사용자 Clerk 초기화 경로를 검증.
5. `tools/frontend/smoke-phase34-runtime-regressions.mjs`: 기존의 잘못된 `'/admin' 리디렉션 금지` 검증을 제거하고 관리자 로그아웃 경로 보존 계약으로 교체.

## 수용기준

- AC-UX01-R01: 최고관리자·일반관리자 각 5회 로그아웃 후 주소가 `/admin`으로 유지되고 관리자 로그인 폼이 표시됨.
- AC-UX01-R02: 로그아웃 중 또는 종료 후 사용자 홈페이지 `/`로 이동하지 않음.
- AC-UX01-R03: 중간에 `관리자 데이터를 확인 중입니다.` 화면이 다시 나타나지 않음.
- AC-UX01-R04: 최고관리자·일반관리자 로그인 시 대시보드 한 번 표시, 다른 메뉴 자동 강제 이동 없음.
- AC-UX01-R05: 사용자 모드 정상 로그인·로그아웃과 관리자 보안·재인증·RBAC 불변.
- AC-UX01-R06: 로그아웃 시 Clerk 서버 세션이 실제로 종료되어 보호 관리자 화면·API에 접근할 수 없음.

## Staging 적용 지침

- 이번 변경은 프런트엔드만 적용. Staging `deploy.ps1`에서 Full ZIP 경로 직접 지정(2), Firebase 배포 생략(0), 운영 `gh-pages` 발행 N.
- `gh-pages-3` 커밋 푸시 후 Vercel Staging 배포가 Ready인지 확인.
- Heroku v268 / Migration 043 / Device Trust Revision 4는 유지. Heroku 재배포, 정책 토글, 신규 Migration, 추가 DB/Worker/스토리지 불필요.
- Staging에서 10회 반복 후 AC-UX01 판정. 자동검증만으로 실브라우저 PASS 처리하지 않음.

## 로컬 검증 결과 (작성 시점)

- `npm run verify:phase34`: PASS, 종료 코드 0.
- 관리자 인증·경로 전환: 45 checks PASS.
- 기존 관리자 인증 회귀: PASS.
- Clerk 사용자 인증 smoke: PASS.
- W02 Device Trust 복구: 40 assertions PASS.
- React Hooks 감사: 222개 소스 검사 PASS.
- 앱 흐름 계약: 139개 PASS.
- Windows의 실제 Vite 빌드 및 수정 후 Staging 로그아웃 반복 수용시험은 아직 미실행.
