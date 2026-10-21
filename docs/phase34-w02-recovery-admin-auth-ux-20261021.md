# Phase 34 W02 | Device Trust 복구·관리자 인증 UX 구현 및 Staging 검증 안내

- 작성일: 2026-10-21
- 기준: `rental-system-phase34-w01-ac-s01-final-validation-20261021_deployment_package.zip` (`e4d10d34611e2b98fad08925a1a1416565bc4d3ab28c3044b2f68acc50fcbe3f`)
- 배포된 W01 Staging: GitHub `521a56d46f39c0818947f1bdaf80296146786dcd`, Heroku `v266`, Migration 001~042
- Production 안정본: `c772cb7b19bb8fff755f38318bc0a8db8db9707f` (이번 개발에서 변경 금지)
- 변경 목적: W02 AC-S02/AC-S03 + W02-UX01 관리자 로그인/로그아웃 불필요한 화면 전환 개선
- 상태: **코드·Mock 개발 후보 완료. Staging 배포/수용 검증 전, Production 변경 없음.**

## 1. 핵심 구현

1. 기존 단일 PostgreSQL 내 Migration 043 `app_device_trust_operations` 작업 체크포인트: 작업 UUID, 종류, 정책 개정, 원정책 존재 여부·원본 payload, 목표값, 대상 Clerk ID, 계정 처리 결과·실패 ID·오류 코드, 상태·시각.
2. 외부 Clerk 변경 시작 전에 작업 레코드를 기록. 첫 번째 API 적용 파동·권한값 독립 GET 검증 후 단계별 기록. 실패가 불확실할 때 성공으로 오인하지 않음.
3. 신규 정책 변경은 미해결 `applying/recovery_required` 작업이 존재하면 HTTP 409로 거부. 최고관리자의 기존 `기존 계정에 다시 적용` 기능에서 현 정책으로 재확인/수렴하고 기존 작업을 `recovered` 처리.
4. 원 정책 행이 없었던 보안 기본 ON: 실패 시 원본 상태 **행 부재**를 유지하고, `{}` 행을 생성하지 않음.
5. 보상 롤백 실패 원인과 계정별 조회/적용 실패 상태를 영속 기록. 정책·상태·감사 기록·복구 체크포인트 중 하나라도 확인되지 않으면 완료 표시 금지.
6. HTTP 429/503/408 및 네트워크 timeout/API 불가에 대해 제한 재시도, 지수 간격+Jitter, Retry-After 반영. 5초 초과 헤더는 조기 재시도하지 않고 회복 필요/실패 경로로 처리. 최대 동시 Clerk 처리 8개 유지.
7. 기존 Device Trust 정책·보안 감사 테이블 042, 사용자/관리자 계정 생성 Advisory Lock, 보안 기본값·ON Revision 정책 유지.
8. 관리자 로그인: 최신 관리자 보안 설정은 ref로 사용하되 세션 콜백 참조는 안정화. 로그인 후 경로 보정 타이머(150/600ms·microtask·rAF) 제거. 대시보드 탭은 **상호작용 로그인 성공 시 1회만** 선택.
9. 관리자 로그아웃: `signing_out` 표시를 데이터 확인 로딩에서 분리. 관리자 통계·대화상자·헤더 인증정보를 로그아웃 중 숨기고 로그인 입력 UI는 실제 로그아웃 완료 후 표시.
10. 사용자 UI에는 내부 PostgreSQL/Clerk 동작 설명 금지. 설정 오류 코드와 재시도 가능 여부만 최소한 표시.

## 2. 기존 DB/비용 영향

- 변경되는 Migration: **043 신규만 추가**, 001~042 불변.
- 새로운 DB, 외부 스토리지, Heroku worker, 추가 dyno, 추가 addon, 요금제 상향 **모두 없음**.
- 새로운 `app_device_trust_operations`는 기존 Essential-0 PostgreSQL 내부 테이블 한 개. `target_ids/account_results`에는 계정 ID가 있으므로 서버 DB에만 저장하고 API GET/토스트에 노출하지 않음.
- 모든 재동기화는 기존 web dyno 관리자 요청 내에서 수행. 장시간 운영 API 제한 시 관리자 재시도 전에 실제 결과를 반드시 조회한다.

## 3. 테스트 및 수용 범위

- AC-S02: 10개 중 일부 실패, 마지막 실패, 429/503/timeout, 실제 PATCH 성공 후 응답 유실, 활성 404, 롤백 이중 실패, 기본 정책 행 부재 복원, 프로세스 중단, 멱등 복구.
- AC-S03: 동일·상반된 최고관리자 동시 저장, 다중 충돌, 반대 정책 요청 중 timeout, owner-only 권한.
- AC-UX01: 최고관리자 5회+일반관리자 5회 로그인 후 가짜 재로딩 0회, 로그아웃 10회 데이터 확인 화면 0회, 인증 만료·재인증·직접 URL 접속·타 탭 로그아웃·세션 오류.
- 위험 기능: 전체 DB 초기화·실제 1,000개 Clerk 실계정 생성·Production 테스트 금지. Mock은 별도 테스트 환경에서만.

## 4. 운영자가 별도로 할 일 (Staging에만 적용)

1. 새 Full ZIP+`.sha256`의 해시 검사. 프로젝트 경로 `E:\project\rental-system\test_new`.
2. `git status --short`를 확인해 미처리 소스가 있는 경우 보존 후 진행. `./deploy.ps1` 실행: 패키지 선택 `2` 직접 ZIP 지정; Firebase `0`; `START`; 운영 `gh-pages` 발행은 `N`. `npm run build`가 실 Windows 환경에서 **반드시 PASS**해야 함.
3. `git fetch origin`, `git rev-parse origin/gh-pages-3`, `git status --short`로 신규 커밋과 소스 무결성 확인. Vercel Staging가 신규 커밋을 배포했는지도 확인.
4. Staging DB 백업: `heroku pg:backups -a notebook-rental-api-staging-01`에서 Completed 백업 확인. 최신 백업이 없으면 기존 허용된 백업 기능으로 안전성 확인 전 서버 배포 중단.
5. `git remote -v`에서 `heroku-staging`이 `https://git.heroku.com/notebook-rental-api-staging-01.git`인지 확인. **그 후에만** `git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main`. 실 배포 시 자동 Release Phase `npm --prefix server run db:migrate`가 Migration 043을 적용.
6. `heroku releases -a notebook-rental-api-staging-01`, `heroku ps -a notebook-rental-api-staging-01`, `Invoke-RestMethod -Uri "https://notebook-rental-api-staging-01-8302cb90b98c.herokuapp.com/health" -Method Get` 점검.
7. Migration/복구 테이블 읽기 전용 확인:

```powershell
heroku pg:psql -a notebook-rental-api-staging-01 --command "SELECT name, applied_at FROM schema_migrations WHERE name LIKE '043_%';"
heroku pg:psql -a notebook-rental-api-staging-01 --command "SELECT to_regclass('public.app_device_trust_operations') AS operation_table;"
```

8. 현재 정책 상태 보존 확인 (기존 ON, revision 2가 예상되나 최신값 기준으로 평가):

```powershell
heroku pg:psql -a notebook-rental-api-staging-01 --command "SELECT config_key, payload->>'deviceTrustEmailVerificationEnabled' AS enabled, payload->>'status' AS sync_status, payload->>'policyRevision' AS revision FROM app_system_configuration WHERE config_key IN ('device-trust-policy','device-trust-sync-state') ORDER BY config_key;"
```

9. Staging 관리자 로그인·로그아웃 UX: 최고관리자 5회 + 일반관리자 5회 로그인, 총 10회 로그아웃. 전환 중 불필요한 데이터 확인 화면 0회, 대시보드 수치 유지, 탭 선택 150/600ms 후 복귀 없음. F12 콘솔/Network 오류 포함.
10. Device Trust 정책 적용·재동기화, 실제 소수 Staging 테스트 계정, 401/403/200 권한 및 기존 8개 영역 회귀. 실패 주입·1,000명 업데이트·전체 DB 초기화는 Staging에서 실행하지 말고 로컬 Mock 증빙 활용.
11. 클라이언트/서버 정책 충돌 또는 `recovery_required`가 발생하면 반복 클릭하지 말고 오류 코드·일시·동기화 상태/감사 기록을 확인. 복구 동작은 최고관리자만 승인하여 실행.
12. Staging 수용 PASS 및 별도 **Production 승격 승인 전** `heroku`/`heroku-production`·GitHub `gh-pages`·Production Actions 승격 일절 금지.

## 5. 출력 보고 양식

- ZIP SHA: PASS/FAIL
- Windows Vite Build: PASS/FAIL
- Staging GitHub SHA:
- Heroku Staging Release:
- Migration 043: PASS/FAIL
- `/health`/DB: PASS/FAIL
- W02 AC-S02 로컬·Staging: PASS/FAIL/미실행
- W02 AC-S03 로컬·Staging: PASS/FAIL/미실행
- W02-UX01 로그인 10회: 0회 깜빡임 여부
- W02-UX01 로그아웃 10회: 0회 데이터확인 화면 여부
- 기존 8개 영역: 8/8 PASS 또는 각 항목 결과
- Device Trust 기존 정책: ON/Revision/동기화 상태
- Production 변경: 미실행
