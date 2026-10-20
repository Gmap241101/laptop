> **사용 중지된 이전 문서**: 이 문서는 추가 격리 DB/S3/Worker가 필요한 이전 개발안이다. 사용자가 2026-10-20에 **추가 비용 0원 및 단일 DB**로 변경 지시하였다. 현재 작업에는 `docs/phase34-p0-single-db-zero-cost-runbook-20261020.md`를 사용할 것. 이 문서의 자원 생성·Worker 활성화 명령 실행 금지.

# Phase 34 P0 | 사이트 내 전체 DB 백업·격리 복원 검증 — 개발/운영 절차

기준 Full ZIP: `rental-system-phase34-p0-json-restore-sql42p02-hotfix-20261019_deployment_package.zip` (SHA-256 `5c5d9306ebbb57cd4cfcce561faa3734a772d43f575bade619b6841e47e121a6`). 이 문서는 후속 변경 사양이다.

## 0. 현재 판정과 운영 안전 원칙

- **현재 소스 코드 구현 및 로컬 모의 검사 가능. 실제 Heroku Staging/Production, Clerk, 검증 DB, object storage의 접속·과금·리전·권한 검증은 이 개발 환경에서 미실시.** 자동화 코드의 존재가 실증 완료를 뜻하지 않는다.
- 프로덕션에 직접 배포하거나 DB 초기화/전체 복원 검증을 실행하지 않는다. 별도 Staging PoC를 선행한다.
- 전체 백업 검증은 운영 DB에 `pg_dump` 읽기 전용 작업을 수행한다. **격리 DB만 폐기·복원**한다. 검증 성공은 운영 데이터 복원/초기화 명령을 자동 실행하지 않는다.
- 관리자용 JSON 선택 복원/초기화, 대여/회원/문의/사이트 설정 기존 정책을 변경하지 않는다. v2 백업 증빙(60분 유효·1회용)은 기존 app_runtime_metadata key를 통해 적용된다.
- 민감 URL, 스토리지 키, 암호화 키, 파일 원본 및 사용자의 JWT를 소스·로그·스크린샷·채팅에 붙여넣지 않는다.

## 1. 최초 인프라 준비 — 각 환경에 별도로, 추가 비용 사전 승인 필수

1. `Staging`과 `Production`에 **서로 다른** 격리 복원용 PostgreSQL 데이터베이스/자격증명 확보. 원본 DB와 호스트·DB 이름·DB 접속 사용자 이름이 모두 달라야 한다. 별도 유료 add-on이 필요할 수 있다. 기존 `DATABASE_URL`은 변경/Promote하지 않는다.
2. 대상 DB 초기화 권한은 **격리 데이터베이스 한정**. 타 운영 DB에 `DROP SCHEMA`가 허용되면 보안 테스트 실패로 간주한다. 대상 DB에 `backup_guard.disposable_target` 마커를 격리 DB 소유자의 별도 승인 절차로 만든다. `backup_guard` 스키마는 public 밖에 두고 Worker role은 marker 조회 권한만 갖도록 제한한다. `marker_id` UUID는 환경마다 고유하게 생성하며 해당 대상 리소스 ID와 함께 기록한다.
3. 예시 초기 마커 생성 (확인된 격리 DB에서만 운영자가 수동 승인 후 실행; 운영 DB에서는 절대 실행 금지):

```sql
CREATE SCHEMA IF NOT EXISTS backup_guard;
CREATE TABLE IF NOT EXISTS backup_guard.disposable_target (
  marker_id UUID PRIMARY KEY,
  environment TEXT NOT NULL,
  resource_id TEXT NOT NULL
);
-- INSERT INTO backup_guard.disposable_target(marker_id, environment, resource_id)
-- VALUES ('<생성한 UUID>', 'staging', '<실제 검증 DB 리소스 ID>');
-- Worker 접속 사용자에는 backup_guard에 SELECT만 부여하며 INSERT/UPDATE/DELETE/DROP 권한을 부여하지 않는다.
```

4. 각 환경에 비공개 S3 또는 *S3 Signature V4 및 SHA-256 오브젝트 체크섬 HEAD 조회 호환* Object Storage를 준비한다. 버킷/리전/비용/외부 위탁과 개인정보 보관 정책을 확정하고, 서버용 최소 권한 자격증명을 생성한다. 버킷 접근은 공개 금지, HTTPS만 사용, 버전 관리 또는 Object Lock/보존 보호 검토. **앱은 임시 파일을 클라이언트 측 AES-256-GCM으로 암호화한 후 스토리지 서버측 SSE-AES256 저장**한다. 저장한 바로 그 오브젝트를 GET·복호화하고 격리 DB에 복원한다.
5. 암호화 키(`BACKUP_ENCRYPTION_KEY_HEX`: 안전한 무작위 32바이트의 64자리 16진수)는 비밀 관리로 보존하고 키 유실·키 회전 계획을 마련한다. 이 키를 분실하면 백업이 복원 불가하므로 별도 안전 장소에 복구 사본을 보관한다. 기존 키로 암호화된 아카이브에 대한 복호화 가능성을 확보하기 전에는 키를 바꾸지 않는다.
6. Worker dyno에 **실제 서버 PostgreSQL과 호환되는 버전의 `pg_dump`/`pg_restore` 실행 파일**을 마련한다. Node buildpack만으로 자동 포함되는 것으로 가정하지 않는다. `server/scripts/check-backup-verification-infrastructure.mjs`를 사용해 검증하되 실패 시 배포 차단.
7. Heroku 자원 사용량은 DB 용량, Worker 실행 시간, Object Storage, 전송비 및 키 관리비를 합산한다. 자동 유료 자원 생성, 플랜 승격, 프로덕션 배포는 구현하지 않는다.

## 2. 앱 환경변수 — Web + Worker 동일 환경별 안전값

아래는 이름 목록이며 **값을 채팅에 붙여넣지 않는다.**

| 환경변수 | 의미 |
|---|---|
| `APP_ENV` | `staging` 또는 `production` |
| `DATABASE_URL` | 기존 서비스 DB. 변경·교체 금지 |
| `BACKUP_VERIFY_ENABLED` | `true`로 할 때만 새 검증 시작 허용 |
| `BACKUP_VERIFY_TARGET_DATABASE_URL` | 전용 격리 DB, 운영 DB URL과 달라야 함 |
| `BACKUP_VERIFY_TARGET_MARKER_ID` | 대상 `backup_guard.disposable_target.marker_id` |
| `BACKUP_SOURCE_RESOURCE_ID` | 실제 운영 DB 자원 ID (비밀 아님) |
| `BACKUP_TARGET_RESOURCE_ID` | 실제 격리 DB 자원 ID |
| `BACKUP_S3_ENDPOINT` | HTTPS S3 SigV4 주소 (쿼리/사용자정보 금지) |
| `BACKUP_S3_BUCKET` | 비공개 bucket 이름 |
| `BACKUP_S3_REGION` | SigV4 region |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | 최소 권한 개별 저장 자격증명 |
| `BACKUP_ENCRYPTION_KEY_HEX` | 클라이언트 AES-256-GCM 비밀 키 (64 hex) |
| `BACKUP_MAX_ARCHIVE_BYTES` | 최대 허용 백업 아카이브 크기 (십진수 바이트) |
| `PG_DUMP_BIN`, `PG_RESTORE_BIN` | 필요한 경우 정확한 경로; 지정 안 하면 PATH 사용 |

`BACKUP_VERIFY_ENABLED=false` 또는 인프라 미구성 시 웹 검증 버튼은 활성화되지 않는다. `true`로 활성화했으나 일부 환경변수가 빠지면 작업이 시작되지 않고, 안전한 복원·초기화 역시 차단된다.

## 3. Clerk 재인증

1. Clerk Production/Development 각각에서 session token customization에 **`reverification_id`: `{{session.reverification_id}}`** custom claim을 추가하고 기존 기본 claims를 제거하지 않는다.
2. 커스텀 React 앱에서는 `session.startVerification({level:'first_factor'})` → 이메일 코드 준비/입력/검증 → 세션 토큰 새로 발급 → Backend에서 서명 검증된 `fva[0] < 5`와 `reverification_id` 재사용 여부 검사 순으로 진행한다.
3. 관리자 `owner`만 작업 시작·조회·취소 가능. 프런트 로컬 플래그, 단순 새 JWT 발급, 만료된 세션, 다른 사용자의 재인증 ID는 통과할 수 없다.
4. Clerk 커스텀 JS 연동은 CDN SDK 버전/인스턴스 환경에서 반드시 실제 재인증 PoC를 실행해야 한다. 재인증 수단을 사용할 수 없으면 Job 시작을 차단하고 임의로 로그인만 허용하지 않는다.

## 4. 배포 및 스테이징 검증 순서

1. 첨부 Full ZIP의 SHA-256과 파일 목록 검증 후 `deploy.ps1 v13.5`로 `gh-pages-3`에 소스 적용. Firebase 0, Production 직접 발행 N. **현재 운영 기준선을 즉시 덮어쓰지 않는다.**
2. Staging Heroku Backend 배포(기존 작업 폴더에서):

```powershell
cd E:\project\rental-system\test_new
git fetch origin
git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main
```

3. Release Phase에서 **Migration 040** 적용을 확인한다. 기존 001~039는 변경하지 않는다. Schema 변경 실패 시 진행 중단.
4. 전용 격리 DB 마커, Worker 바이너리, 암호화 저장소를 Staging 전용으로 준비. Read-only preflight:

```powershell
node server/scripts/check-backup-verification-infrastructure.mjs
```

5. Staging에서 `heroku ps:scale worker=1 -a notebook-rental-api-staging-01`는 추가 요금이 발생할 수 있으므로 **비용 승인 후에만** 실행한다. Procfile에 `worker:` 엔트리가 추가되어 있다. Worker heartbeat가 기록된 다음 관리자 화면 상태가 준비됨으로 변경되는지 확인한다.
6. Staging 최고관리자로 로그인해 `시스템 > 데이터 관리 > 백업·복원 안전검증`을 열고 이메일 코드 재인증 후 버튼을 실행한다. 단계/중단/브라우저 재접속/결과·유효기간을 확인한다.
7. Staging 실제 DB에 대한 백업 파일 다운로드·복호화·격리 DB 복원·테이블 정합성·증빙 생성까지 확인한다. **같은 대상에서 2회 이상 반복** 검증해 이전 public schema가 안전하게 정리되는지 검증한다.
8. 시험용 데이터로 JSON 선택 복원과 확인·증빙 1회 소모를 확인. 실패 트랜잭션은 증빙이 보존되어야 한다. Proof 60분 경계·오브젝트 삭제/변조·동시 시작·잘못된 URL·롤백·취소·Worker 중단 복구·Clerk fva 만료 및 재인증 ID 재사용을 검증한다.
9. 기존 Phase 34 P0 관리자/회원 로그인, Device Trust, 대여/자산/문의·게시판/사이트 설정/데이터 관리 보안 8개 회귀 모두 통과해야 한다.
10. 이 테스트를 모두 통과한 뒤 Production 배포 **별도 승인**. Production 별도 격리 DB/스토리지 설정과 전체 운영 DB 백업 확보를 먼저 확인한다.

## 5. 기존 수동 스크립트와 호환성

- 기존 `server/scripts/verify-full-backup-restore.mjs`는 **v1 단독 운영자 검증** 용도다. `BACKUP_VERIFY_ENABLED=true`가 설정된 환경은 v2 영속 오브젝트 검증을 필수화하므로 v1 증빙으로 데이터 삭제/복원이 허용되지 않는다.
- 신규 증빙은 `phase34_verified_full_db_backup` runtime metadata에서 파싱된다. 신규 `type='full-pg-dump-isolated-restore-v2'`, 필수 `objectKey`/`objectSha256`/`jobId`/환경 필드가 추가되며 유효시간은 60분, 실제 초기화/선택복원 성공 시 일회 소모 유지.
- JSON 미리보기는 종전대로 읽기 전용이므로 별도 증빙 없이 사용할 수 있다.
- Worker 백업 스토리지 파일의 자동 보존 기간은 정책 확정 전 임의로 줄이지 않는다. 비용과 개인정보 보존 정책이 확정될 때까지 운영 삭제 정책을 별도로 승인받아야 한다.

## 6. 검증 상태 구분

로컬 `npm run verify:phase34`, 패키지 가드·해시·암호화 왕복·클레임 파서 검사를 통과하더라도 **INF-01~INF-16, AC-V37~AC-V56의 실제 DB/스토리지/Clerk 통합 수용**은 수행하지 않은 상태다. 실제 Production 승격은 허용하지 않는다.

## 7. 비밀정보 및 장애 보고 규칙

- 서버 로그는 작업 ID와 안전한 범주 코드만 출력한다. SQL 파라미터·API 키·파일 원문/암호화 키·Clerk JWT를 기록하지 않는다.
- 시스템 장애 시 브라우저 Network의 응답 HTTP status·오류 코드 및 Job ID, Heroku 로그의 `[backup-verify]` 부분만 공유한다.
- 표면상 `검증 완료`여도 증빙이 소모됐거나 파일이 사라졌다면 위험 작업을 차단해야 한다.
