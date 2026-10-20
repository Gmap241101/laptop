# Phase 34 P0 JSON 선택 복원 SQLSTATE 42P02 핫픽스 및 수용 절차

개발 기준선: `rental-system-phase34-p0-integrated-json-restore-20261019_deployment_package.zip` (SHA-256 `a640648041fea9409c60c822fde4c62c59b60ce88e754c922839e70a3d648978`).

## 1. 장애와 원인

- Staging JSON 선택 복원 **미리보기** 실행 시 `복원 대상을 확인하지 못했습니다. 오류 코드: 42P02`.
- `server/src/settings/system-data-restore.mjs`의 `existingCounts()` 및 `insertRows()`가 템플릿 SQL 파라미터 인덱스를 0부터 만들어, 각각 `$0, $1, ...`을 생성함. PostgreSQL의 번호 있는 SQL 매개변수는 **`$1`부터** 시작하므로 SQLSTATE `42P02`가 발생.
- 구버전 mock smoke 테스트가 유효하지 않은 바인드 번호를 검사하지 않아 이를 탐지하지 못함.
- 기존 API 예외 핸들러가 상세 오류를 서버에 로깅하지 않고 코드만 응답했기 때문에 Heroku 로그에는 오류 지점이 없었음.
- `pg` 라이브러리의 `client.query()` concurrent query deprecation 경고는 별도 조사 대상이며 이번 `$0` 문제와 동일 원인이라고 단정하지 않음.

## 2. 최소 수정 범위

1. `existingCounts`의 1/2/다중 컬럼 키 바인드 번호를 `$1`부터 생성.
2. `insertRows`의 다중 행 INSERT/UPSERT 바인드 번호를 `$1`부터 생성.
3. mock 테스트가 `$0`, 파라미터 누락/불연속을 즉시 실패 처리하고 두 행 이상 미리보기/복원 테스트 포함.
4. 미리보기/실행에서 예상하지 못한 DB 오류가 발생하면 **서버 로그**에 `requestId`, `operation`, `SQLSTATE(code)`, `error.name`만 남김. 업로드 JSON·SQL 원문·SQL 매개변수·개인정보·접속정보는 기록하지 않음. 사용자 응답은 안전한 `system_data_restore_failed`로 통일하고, 사용자 검증 오류는 기존 도메인 코드 유지.
5. 로컬 격리 DB만 대상으로 실제 PostgreSQL SQL 검증 가능한 **읽기 전용** 스크립트 추가: `server/scripts/verify-scoped-restore-preview-on-isolated-db.mjs`. 각 범위 `site`/`boards`/`assets`/`organization`에 대해 두 모드의 Preview API 내부 SQL을 실제 PostgreSQL 엔진에서 검증하며 **INSERT/UPDATE/DELETE 없음**.

Backend SQL와 진단만 수정하며 현재 프론트엔드 UI·다른 데이터 도메인·기존 Migration 039 등은 변경하지 않음. Migration 신규 추가 없음.

## 3. 운영자가 해야 할 작업

### 준비 확인

- 기존 테스트 DB `rental_staging_restore_20261019`에 전체 Staging 백업을 실제 복원 완료: 32 일반 테이블+4 뷰, SHA-256 `a7bc8c1e7e8549489aec8b2050617b3c708db5ce4586a952eee725274d79b6fb`.
- 위 DB는 **Staging 서버가 사용하는 DB가 아닌 로컬 격리 DB**여야 함.

### Staging 배포 (Production 금지)

1. 이 Full ZIP을 `deploy.ps1 v13.5`로 로컬 `test_new`에 적용. Firebase 발행 0, 직접 Production 발행 N. 로컬 git 빌드/Push 통과.
2. Backend 코드가 변경되었으므로 다음 명령으로 Staging Heroku만 갱신:

   ```powershell
   git fetch origin
   git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main
   ```

3. Heroku Release에서 기존 Migration 039 적용 상태만 확인. 신규 Migration 없음. `/health` 200 응답 확인.
4. Vercel Staging은 기존 UI 유지, 소스 변경 후 최신 `gh-pages-3` 반영 여부 확인.

### 진짜 PostgreSQL 격리 Preview SQL 테스트

**DB 접속 URL 전체를 타인이나 공개 로그에 출력하지 말 것.** 기존 PowerShell 세션의 `RESTORE_TEST_DATABASE_URL` 환경변수가 남아 있다면 다시 설정할 필요 없음. 이미 만들어 둔 **로컬 격리 복원 DB**를 대상으로 다음 명령 수행:

```powershell
node server/scripts/verify-scoped-restore-preview-on-isolated-db.mjs
```

정상 시 각 네 범위의 `addMissing` 및 `overwrite` Preview SQL이 PASS를 출력함. 로컬 서버의 인증정보를 요구하는 경우 현재 세션의 `RESTORE_TEST_DATABASE_URL`을 확인. 비밀번호는 채팅으로 공유하지 말 것.

### Staging 브라우저 검증

1. 최고관리자 로그인 후 Staging 데이터 관리 화면에서 JSON 백업 파일 선택.
2. `사이트·설정` 범위, `없는 데이터만 추가` 모드에서 **복원 미리보기** 확인.
3. `게시판`, `자산`, `부서·사용자 명부`는 실제 저장된 JSON의 범위 및 개인정보 포함 여부에 맞춰 각각 미리보기 테스트.
4. 기존 데이터에 영향이 없는 안전한 시험용 범위에서만 `백업 데이터 복원` 실행. 기존 데이터를 덮어쓰는 시험은 별도 사용자 승인 후 진행.
5. SQL 오류 발생 시 `heroku logs -a notebook-rental-api-staging-01 --source app --tail`에서 `[system-data-restore]` 라인을 확인. DB 비밀번호/데이터 내용은 로깅하지 않음.
6. 복원 실행에는 **최근 60분 이내에 발급한 전체 DB 격리 복원 증빙**이 필요. 이전 증빙이 만료되면 새 빈 테스트 DB를 준비해 백업·복원 검증을 다시 수행해야 함. **이미 복원한 DB에 pg_restore를 반복하면 안 됨.**

### Production

사용자 실제 Staging 수용 검증이 완료되고 명시적 승인을 제공하기 전까지 `promote-github-pages-actions-production-v1.1.ps1` **실행 금지**, `heroku-production` 배포 금지.
