# Phase 10 Manual Platform Actions

## 목적
Phase 10은 `gh-pages-3`/`mkrental.vercel.app` 테스트 환경에서만 로그인 회원의 `userAccounts/{uid}` Firestore realtime watcher를 끄고 PostgreSQL member shadow를 기본 프로필 읽기 소스로 사용합니다.

Production `gh-pages`와 `https://notebook.recruit.kro.kr`은 변경하지 않습니다.

## 1. Vercel에서 직접 해야 할 작업
Vercel Dashboard → `mkrental` → Settings → Environment Variables로 이동합니다.

Production environment에 다음 값을 추가합니다.

- Key: `VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED`
- Value: `true`

기존 값은 그대로 유지합니다.

- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_API_URL=https://<현재 Heroku staging app>`
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
- `VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true`

환경변수 변경은 기존 빌드에 소급 적용되지 않으므로 Phase 10 소스가 `gh-pages-3`에 올라간 뒤 Vercel 새 deployment가 생성되어야 합니다. 자동 배포가 되지 않으면 Deployments에서 최신 `gh-pages-3` commit을 Redeploy 하십시오.

## 2. Heroku
새 Config Var는 없습니다. 기존 값을 유지합니다.

Phase 10에는 신규 DB migration이 없으므로 Heroku Release Phase에서 `001`~`005`가 모두 `already applied`, `newly applied=0`이어야 합니다.

코드 배포가 성공한 뒤 `SERVICE_VERSION=phase10`으로 변경합니다.

확인:
- `/health/live` → `version=phase10`, `status=ok`
- `/health` → `version=phase10`, `status=ok`, `database.status=ok`

## 3. Phase 10 테스트 전에 Shadow 최신화
Watcher를 끈 세션에서는 Firestore 실시간 변경 감시가 없으므로 먼저 기존 Phase 9 URL에서 Shadow가 최신인지 확인합니다.

`https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres`

1. Firebase/Clerk 로그인 확인
2. `회원 Shadow 동기화`
3. `회원 Shadow 비교`
4. `Shadow equivalent: yes`, `Changed fields: -` 확인

## 4. 실제 watcher-off 테스트
다음 URL을 정확히 사용합니다.

`https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off`

정상 기대값:
- `Cutover requested: yes`
- `Active read source: postgresql-shadow`
- `Fallback reason: -`
- `Firestore member watcher: disabled`
- `One-time Firestore fallback reads: 0`
- `App read source: disabled`

이 상태에서는 `userAccounts/{uid}`의 client `onSnapshot`을 생성하지 않습니다.

## 5. 기능 회귀 테스트
같은 URL 상태에서 다음을 확인합니다.
- 로그인 상태 유지
- 사용자 이름/팀/회원상태 정상
- 홈 화면 정상
- 대여 화면/신청 화면 진입 정상
- 신청내역 정상
- 마이페이지 정상
- 로그아웃/재로그인 정상

프로필 수정이나 관리자가 회원 상태를 변경하는 시나리오는 아직 Firestore가 쓰기 원본이므로, 해당 변경 직후에는 Shadow가 최신이 아닐 수 있습니다. Phase 10은 watcher 제거 검증 단계이므로 이러한 쓰기 동기화 자동화는 다음 단계에서 다룹니다.

## 6. Fallback 검증
PostgreSQL candidate가 실패하는 경우에만 Backend가 Firebase ID Token으로 Firestore 문서 한 건을 읽어 `firestore-one-time-fallback`으로 복구합니다. 정상 PostgreSQL 경로에서는 이 fallback read는 0이어야 합니다.

## 7. 변경하지 말 것
- GitHub `gh-pages`
- `notebook.recruit.kro.kr`
- Firebase Rules
- Firebase Auth 설정
- Clerk Production instance
- Vercel의 `CLERK_SECRET_KEY`, `DATABASE_URL` 같은 backend secret
