# Phase 34 P0 잔여 UX — 홈페이지 백업·복원 안전검증 개발·검증 보고

작성일: 2026-10-20 / 개발 환경: 로컬 압축 소스 검증 (Heroku 운영 DB·Clerk 실제 연결 없음)

## 1. 결론과 개발 기준선

- 유일 기준 Full ZIP: `rental-system-phase34-p0-json-restore-sql42p02-hotfix-20261019_deployment_package.zip`; SHA-256 `5c5d9306ebbb57cd4cfcce561faa3734a772d43f575bade619b6841e47e121a6`.
- 이전 Production 승격 기록: `gh-pages`/`gh-pages-3` commit `756a753a0064`, Heroku v18, Migration 039. 이번 패키지는 **운영에 미배포**이며 새 기준선 승격은 Staging 수용 후 별도로 한다.
- P0 A01(전용 검증 DB), A02(암호화 영속 백업), A03(최근 Clerk 재인증) 코드 및 공통 관리자 UI 흐름을 구현했다. **외부 인프라 실증 미완료**이므로 전체 기능 개발·운영 수용 완료라고 주장하지 않는다.
- 이메일 자동 발송, 전체 운영 DB 원클릭 교체/데이터 삭제·초기화 자동 실행, Clerk 계정/외부 첨부 원본 포함 통합 재해복구, JSON 선택 복원 범위 확대는 개발하지 않았다.

## 2. 구현한 코드

| 구성 | 작업 | 현재 테스트 |
|---|---|---|
| Migration 040 | 작업·상태·재인증 이력·증빙 메타데이터 및 단일 활성 작업 제약 | 정적 검증 |
| 서버 JWT | 서명 검증된 Clerk `fva`/`reverification_id` 조회 | 모의 인증 조건 PASS |
| 서버 API | 최고관리자 전용 작업 상태·시작(HTTP 202)·취소·최근 조회 | 계약 및 코드 검사 |
| Background Worker | Queue polling, lock, lease, heartbeat, 재시작/취소/실패 처리 | 구문·로컬 코드 검사, 실 DB 필요 |
| 격리 DB 보호 | 별도 연결·DB명·접속 사용자·resource ID·승인된 marker 확인 후 public만 자동 초기화 | 잘못된 marker/source 모의차단 PASS |
| 스냅샷 | repeatable-read·pg_export_snapshot·pg_dump --snapshot·같은 시점의 테이블 count | 구조 구현, pg_dump 실제 검증 필요 |
| 파일 보관 | AES-256-GCM, S3 SigV4, SHA-256 checksum PUT/HEAD/GET, 파일 읽기 복호화 | 모의 S3 송수신·암호화 왕복 PASS |
| 복원·증빙 | 다운로드 원본 pg_restore 및 테이블 검증 성공 후 v2 proof 발급 | 논리 연결, 실제 PostgreSQL E2E 필요 |
| 삭제/복원 게이트 | proof v2: 스토리지 메타데이터+provider SHA-256 checksum HEAD 재검사 | 코드 확인, 실제 S3 E2E 필요 |
| 관리자 UX | 이메일 재인증, 진행 상태, 중단, 재조회, 유효 기한, 장애 안내 | 프런트 소스·구문·회귀 모의 PASS |
| 안전 사전 점검 | 실행 파일/전용 DB marker/설정 확인용 읽기 전용 CLI | 구현; 실제 인프라 미연결 |

**보안 설계:** 검증 중 운영 데이터 수정 금지. 전용 DB는 원본 DB와 환경·호스트·DB 명·사용자 ID가 구별되고 승인된 `backup_guard.disposable_target`이 있어야만 초기화. 원본에 동일 마커가 있으면 즉시 차단. 원본 DB 연결 권한에 검증용 DDL 권한 추가 금지. 전체 백업 원본은 임시파일이 아니라 암호화 후 영속 저장소에 PUT하고 GET으로 재수령해 실제 격리 복원한다. Job과 증빙 성공은 DB 트랜잭션으로 기록한다.

**미해결 통합 의존성:** Heroku Worker dyno 비용/스케일, 검증 DB 권한·반복 DROP/CREATE, `pg_dump`/`pg_restore` 바이너리, S3 호환 암호화/체크섬/리전/접근제어, Clerk custom JWT claim과 session verification 이메일코드 플로우는 모두 실제 Staging 검증이 필요하다.

## 3. 사용자 제공 없이 개발환경에서 검증할 수 없는 항목

- Production DB 권한·자료·환경변수, 실제 Heroku CLI, S3 계정, Clerk Staging/Production 서명키나 이메일 코드가 제공되지 않았다. **추측으로 계정이나 리소스를 개설하지 않았고 추가 과금을 승인받지 않았다.**
- Staging/Production 클라우드 DB·스토리지 실 연결과 E2E `pg_dump`→Object Store→`pg_restore` **미실시**.
- Frontend `npm ci`/Vite Production 빌드: 이 실행환경은 의존성 패키지를 제공하지 않고 오프라인 npm 캐시가 불완전하여 **미검증**. JSX는 TypeScript transpileModule 구문 검사로 별도 확인.
- AC-V01~V56 가운데 실 DB/Clerk/저장소가 필요한 항목은 **검증 필요**. 로컬 스크립트 PASS만으로 운영 수용완료 처리하지 않는다.

## 4. 위험요소 및 안전 차단

1. 실제 사용 가능 스토리지 계정이 없거나 worker가 실행 중이지 않으면 **검증 시작 불가** (`BACKUP_VERIFY_ENABLED` 및 heartbeat 검사). 검증 성공을 위조하지 않는다.
2. 잘못된 격리 DB marker·host/name/resource ID, 대상이 source와 동일, PostgreSQL CLI 실패 시 **실패 처리**. 원본 DB로 fallback 금지.
3. 일부 업로드만 성공/암호문 변조/기존 원본 유실 시 검증 증빙 미발급. 검증된 v2 proof도 위험 작업 직전 스토리지 provider SHA-256 헤더를 HEAD 재검사하여 누락/변경은 차단한다.
4. 사용자 로그인만으로 시작 불가. 최근 `fva`와 고유 `reverification_id`가 없는 JWT는 서버에서 거부한다. 중복 Job·반복 재인증 ID는 DB unique/partial index로 차단한다.
5. Worker 재시작/연결 단절은 만료된 lease를 INTERRUPTED로 끝내며 실패를 성공으로 기록하지 않는다. 다음 작업은 전용 대상 DB를 다시 정리한다.
6. 암호화 키·DB URL·S3 자격증명·전체 백업 파일·JWT는 로그나 관리자 UI에 표시하지 않는다.
7. 현재 정책에서 보존기간·해외 개인정보 처리·추가 예산은 미확정. 자동 보관 삭제나 유료 리소스 증설은 구현하지 않는다.

## 5. 사용자 배포/검증 순서 (필수)

별도 제공한 `docs/phase34-p0-web-backup-restore-operator-runbook-20261020.md`에 상세 절차 기재.

1. **최초 승인/준비 (한 번):** Staging/Production 전용 검증 DB, 비공개 S3 및 비용·보존기간 승인, 대상 marker·접속 role 최소화, AES 키 안전 보관, PostgreSQL CLI 및 Clerk `reverification_id` session template 설정.
2. **소스 적용:** 신규 Full ZIP을 `deploy.ps1 v13.5`로 `gh-pages-3`에 반영; Firebase 0, 운영 직접 발행 N.
3. **Staging Backend 배포:** `git fetch origin` → `git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main`.
4. **Migration 040 확인:** Release Phase 적용 및 `schema_migrations` 기록 확인. 기존 038·039 변형 금지.
5. **Staging 서버 검증:** 환경변수를 안전하게 설정한 뒤 `node server/scripts/check-backup-verification-infrastructure.mjs`. Worker dyno scaling은 비용 승인 후에만 허용.
6. **Staging 브라우저 E2E:** 최고관리자 이메일 재인증 후 버튼 클릭, Job 단계·브라우저 재접속·실제 스토리지 파일·격리 복원, 2회 반복 자동 정리, 증빙 만료/소모/취소, 잘못된 DB·스토리지 실패, 실제 JSON 선택복원 및 Phase 34 핵심 8기능 회귀.
7. **Production 승인:** 모든 Staging 필수 AC PASS, Production 전체 DB 백업, Production 전용 인프라 준비, 비용·리전·보존 승인을 거친 후 별도 최종 승격 지시.

**현재 사용자가 실행할 필요가 없는 작업:** Production Heroku 배포, Production Migration 040, GitHub Pages 운영 승격, 운영 DB 초기화, 운영 데이터 복원, 임의의 결제·스토리지 계정 생성.

## 6. 이번에 변경하지 않은 정책

- 고유 Production 기준선과 기존 GitHub 브랜치 source=`gh-pages-3`, production=`gh-pages`, backup=`gh-pages-2` 유지.
- 백업 검증 60분, 1회성 proof, JSON read-only preview, 복원/초기화 별도 수동 승인 유지.
- 인증 Clerk, User/Asset/Rental PostgreSQL authority, Firebase Runtime retired, 기존 SQL 42P02 수정 유지.
- 사용자 화면 내부 구현 설명 노출 금지, 관리자 4:3 레이아웃 유지.
