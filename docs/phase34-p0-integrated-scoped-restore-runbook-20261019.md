# Phase 34 P0 통합 백업·복원·Device Trust 운영 수용 절차

작성일: 2026-10-19. **이메일 자동 발송 미개발.** 소스 기준선: Phase34 P0 Device Trust Backup Guard Full ZIP(2026-10-19). 이 패키지는 해당 기준선에 JSON 선택 복원 기능을 추가한 Full 배포물이다.

## A. 구현 범위와 제한

- 관리자 `시스템 > 데이터 관리 > 백업·초기화 > 백업 JSON 선택 복원`에서 JSON 파일을 선택하고 범위/모드를 정한 뒤 미리보기·확인·복원을 실행한다. 최고관리자(owner)만 접근 가능하며 서버에서 재확인한다.
- 지원 복원 범위: 사이트·디자인 문서(`app_site_content_documents`에서 site-settings/rental-config/home/popup/footer/terms), 공지·FAQ(`app_board_configs`, `app_faq_categories`, `app_board_posts`), 자산(`app_asset_categories`, `app_rental_assets`), 부서·사용자 명부(`app_member_directory_entries`).
- 지원 모드: `없는 데이터만 추가(addMissing)` 또는 `동일 기본키 데이터 덮어쓰기(overwrite)`. **없어진 항목을 삭제하지 않는다.** UI의 전체 교체·자동 병합/삭제 모드 및 이전 버전 JSON(Firebase 데이터 형식)은 미지원.
- 회원 계정·약관 동의·대여/예약/연체 기록·1:1 문의·첨부파일 원본·Clerk 계정·Device Trust/계정 보안 설정은 이 JSON 선택 복원에서 **제외**. 전체 데이터베이스 재해복구가 필요하면 `pg_dump`/`pg_restore`를 운영자 주도로 진행해야 한다. 외부 Clerk/첨부파일 저장소는 별개 복구 계획이 필요하다.
- 백업 파일 형식은 `mk-rental-postgresql-backup-v1`이며 소스 Migration 038 이상을 요구한다. 039가 적용된 서버에서 복원할 수 있다. 백업에 기록된 각 마이그레이션 체크섬이 현재 DB와 일치해야 한다. 개인정보 마스킹된 데이터를 복원하지 않는다.
- 복원할 파일은 7MiB 이하, 선택된 합계 행은 2,500개 이하. 새 데이터가 기존 외래키·유니크 제약을 위반하면 전체 롤백한다.
- 먼저 서버에서 **전체 DB 백업을 별도의 빈 격리 DB에 실제 복원한 증빙**이 있어야 한다. 증빙은 60분 동안 유효하며 복원/초기화 중 한 번에만 소모한다. 개인정보·백업 원문은 복원 감사 테이블에 기록하지 않는다.
- PostgreSQL Migration 039(`app_system_data_restore_audit`)가 새로 추가됨. 기존 001–038은 그대로 유지한다.

## B. 첫 배포 전 준비: 사용자 PC / Staging

1. Full ZIP을 `E:\project\rental-system\test_new`의 `deploy.ps1 v13.5`로 적용. Firebase 배포 `0`, Production 즉시 발행 `N`. `gh-pages-3` push 성공을 확인한다.
2. Backend가 변경됐으므로 먼저 **Staging Heroku** 앱 `notebook-rental-api-staging-01`에 현재 `gh-pages-3` 커밋을 배포한다. Staging remote가 `heroku-staging`인 경우 PowerShell:

   ```powershell
   git fetch origin
   git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main
   ```

   remote가 없다면 `heroku git:remote -a notebook-rental-api-staging-01 -r heroku-staging`을 한 번 수행한다. 실패한 경우 중단한다. 운영 `heroku-production`으로 실수로 push하지 말 것.
3. Heroku release phase에서 `npm --prefix server run db:migrate`가 실행됐는지 확인. 추가 Migration 039 적용이 **필수**다. 예시 확인 명령:

   ```powershell
   heroku pg:psql -a notebook-rental-api-staging-01 --command "SELECT name FROM schema_migrations WHERE name LIKE '038_%' OR name LIKE '039_%' ORDER BY name;"
   ```

4. Staging Frontend `https://mkrental.vercel.app`이 변경한 `gh-pages-3` 기준으로 배포됐는지 Vercel 프로젝트의 커밋/빌드 상태를 확인한다. Vercel이 이 브랜치를 자동 배포하는지는 운영 프로젝트 설정에 따라 다르므로 별도 확인 필요.
5. 로그인 검증: 관리자·회원 각각 로그인/새로고침/페이지 이동/로그아웃 후 재접속. Device Trust ON/OFF, 이전/신규 계정 재동기화. 외부 이메일 OTP 로그인과 새 기기 인증은 다른 기능이므로 구별한다.

## C. 격리 PostgreSQL 백업·복원 검증 (Staging에서 먼저)

**아래 스크립트는 복원 대상으로 지정한 DB에 `pg_restore`를 실행한다. 반드시 비어 있고 삭제해도 되는 별도의 격리 DB만 입력한다. 운영 DB를 RESTORE_TEST_DATABASE_URL로 절대 지정하지 않는다.**

1. PostgreSQL 클라이언트 도구 `pg_dump`, `pg_restore`를 설치하고 `PATH`에 등록한다. 이 버전들은 PostgreSQL 서버 버전과 호환돼야 한다.
2. Staging DB URL과 **새로 생성한 비어 있는 독립 테스트 DB URL**을 안전한 환경변수로 준비한다. URL/비밀번호를 채팅·스크린샷·저장소에 넣지 않는다. `BACKUP_FILE`은 새 파일 경로이며 기존 파일에 덮어쓰지 않는다.
3. 프로젝트 폴더에서 `npm --prefix server ci`(최초 1회) 이후 PowerShell에서 아래를 실행한다.

   ```powershell
   $env:DATABASE_URL = "<STAGING_DATABASE_URL_FROM_SECURE_SOURCE>"
   $env:RESTORE_TEST_DATABASE_URL = "<NEW_EMPTY_DISPOSABLE_TEST_DATABASE_URL>"
   $env:BACKUP_FILE = "C:\rental-secure-backups\staging-before-restore.dump"
   $env:CONFIRM_DISPOSABLE_RESTORE_DB = "YES"
   node server/scripts/verify-full-backup-restore.mjs
   ```

   예시 플레이스홀더를 실제 인증값으로 바꾸되 사용자 PC의 안전한 세션 안에서만 관리한다. 성공 결과 `success: true`, `tableCount`, `backupSha256`, `validForMinutes: 60`을 확인한다. 실패하면 복원을 실행하지 않는다. 이후 환경변수에서 비밀번호를 제거한다.
4. **Staging 관리자 데이터 관리 화면**으로 접속한다. JSON 백업을 만든 뒤 파일을 선택하고 복원 범위를 선택한다. `없는 데이터만 추가`로 시작하며 미리보기에서 추가·유지 건수와 `서버 전체 백업·복원 검증 확인됨`을 확인한다.
5. `백업 데이터 복원` 입력 후 실행. 이후 실제 대상의 건수/상세/정렬을 확인한다. 덮어쓰기를 실험할 때는 **Staging의 시험용 문서에 한정**하고 새로운 격리 백업 증빙을 다시 발급한다. 미리보기 이후 DB 수정 시 `system_restore_preview_stale`가 발생해야 한다.
6. 저장소의 모든 데이터가 복구된 것처럼 처리하지 않는다. JSON 선택 복원과 DB 전체 복구는 구분한다.

## D. Production 승격 게이트

- Staging Backend migration 039 및 테스트 PASS, Frontend 배포 상태 확인, `npm run verify:phase34` 및 Vite `npm ci`/`npm run build` PASS (Windows/CI).
- 실제 Staging PostgreSQL에서 백업/격리복원 및 JSON 선택 복원 미리보기·실행·롤백 테스트 통과. 백업 증빙 발급과 복원 증빙 소모 확인.
- Production Clerk Publishable Key, Secret, JWT Public Key가 동일 Production Instance인지 검증하고, 관리자·회원 실제 JWT 로그인 PASS.
- Production DB 사용 전 새로운 Production 전용 복원 증빙을 발급할 필요가 있을 때만 별도 생산 DB 백업·격리복원 진행. Staging의 증빙을 Production에 복제하지 않음.
- 사용자 승인 후 Backend Production `git push heroku-production refs/remotes/origin/gh-pages-3:refs/heads/main` 배포 → Migration 039 확인 → `promote-github-pages-actions-production-v1.1.ps1`로 GitHub Pages Production 프론트 승격.
- 운영 검증이 끝나기 전에는 Phase34 P0 전체 과업을 '운영 수용 완료'로 보고하지 않는다.

## E. 운영·백업 안전성 주의사항

- 초기화는 이전 P0 패키지와 동일하게 최근 격리복원 증빙을 반드시 요구한다. 새 JSON 선택 복원도 동일한 증빙을 요구하며 성공 시 1회 소모한다.
- `app_system_data_restore_audit`에는 실행 계정 ID, 범위, 모드, SHA-256, 행 수, 오류 코드만 기록한다. JSON 내용·DB 비밀번호·이메일 주소는 감사 테이블에 저장하지 않는다.
- DB 및 Clerk 보안 설정, 관리자 계정/로그인 Identity는 JSON 복원 대상이 아니다. Migration은 절대 되돌리거나 기존 적용 파일을 수정하지 않는다.
- 복원 도중 FK/유니크/스키마 오류, 버전 불일치, 용량 상한, 누락된 백업 필드, 마스킹 데이터, 미리보기 값 변동이 있으면 DB 트랜잭션을 롤백한다.
- 현재 운영환경 실측, Vite build, 실제 PostgreSQL 격리복원, 실제 Clerk Device Trust 테스트는 이 개발환경에서 실행하지 못했으므로 **Staging 승인 전 필수**다.

## F. 기존 전체 PostgreSQL 덤프를 새 DB에 복구하는 경우 (서버 운영자 전용)

이 단계는 선택 JSON 복원과 다른 **전체 DB 복구**다. 서비스에 연결된 DB를 직접 덮어쓰지 않는다. 기존의 `pg_dump --format=custom` 파일을 새 **빈 데이터베이스**에 복구하고 확인한 다음, 별도 변경 승인 절차를 통해 애플리케이션 DB 전환을 검토한다.

1. 데이터베이스 공급자에서 새 DB를 생성한다. 연결 URL의 역할과 대상이 올바른지 확인한다. PostgreSQL 클라이언트 `pg_restore`와 Node 패키지 `pg`가 설치되어 있어야 한다.
2. 백업 파일의 SHA-256을 최초 생성할 때 기록한 값과 비교한다. 값이 없다면 신뢰할 수 있는 원본 자료로부터 확보하기 전까지 진행하지 않는다.
3. PowerShell 명령 (플레이스홀더를 사용자 PC에서만 안전하게 치환):

   ```powershell
   $env:EMPTY_RESTORE_DATABASE_URL = "<NEW_EMPTY_RESTORE_DB_URL>"
   $env:BACKUP_FILE = "C:\rental-secure-backups\known-backup.dump"
   $env:EXPECTED_DUMP_SHA256 = "<64_CHARACTER_VERIFIED_SHA256>"
   $env:CONFIRM_EMPTY_DATABASE_RESTORE = "YES"
   node server/scripts/restore-full-db-to-empty-target.mjs
   ```

4. 파일 해시 불일치, 대상 DB의 기존 public 테이블 발견, 복원 명령 오류, 주요 스키마 검사 오류는 모두 실패 처리한다. 스크립트가 `DATABASE_URL`이나 기존 운영 DB 설정을 자동으로 변경하지 않는다.
5. 복원된 새 DB에서 스키마, 실제 데이터 건수, 관리자·사용자 Identity 연결, 앱 기능, Clerk 및 외부 스토리지 연동을 **별도로** 검증해야 한다. 전체 DB 교체는 별도 승인 및 서비스 중지/전환 계획이 필요하다.
