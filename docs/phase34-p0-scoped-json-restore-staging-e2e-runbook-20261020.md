# Phase 34 P0 — Staging JSON 선택 복원 안전 E2E 실행 절차

## 범위·금지사항
- 오직 Staging (`mkrental.vercel.app`, `notebook-rental-api-staging-01`)에서만 실행한다.
- 기존 사이트·자산·명부·게시글 117건을 수정하지 않는다.
- 시험용 FAQ 카테고리 단 **1건**의 신규 추가, 그 1건의 동일 ID 덮어쓰기만 실행한다.
- 전체 초기화, Heroku `pg:backups:restore`, 운영 Production 승격은 이 시험에 포함하지 않는다.
- 기존 PostgreSQL Essential-0, Basic web dyno를 유지한다. 별도 비용·신규 DB·Worker·S3 없음.
- 사용자 개인정보 원문 JSON을 Git/공유 채팅에 첨부하지 않는다.

## 선행조건
1. Heroku `b003` 전체 DB 백업 완료 및 로컬 백업 파일 SHA-256 확보.
2. Migration 039·040·041 적용, `BACKUP_VERIFY_MODE=single-db` 설정 확인.
3. 최신 Phase 34 P0 재인증 및 논리 검사 Staging 완료.
4. 관리자 홈페이지에서 받은 Staging PostgreSQL JSON 백업 원본 파일이 로컬 PC에 존재.
5. 다음 Full ZIP 배포는 **원본 최신 배포 기준선**을 사용; Firebase `0`, Production `N`.

## 절차 1 — Staging JSON에서 PII 없는 검증용 JSON 2개 생성
최신 Full ZIP을 `deploy.ps1`로 로컬 소스에 반영하고, 필요 시 Staging backend 배포를 완료한 뒤 PowerShell:

```powershell
cd E:\project\rental-system\test_new

node tools/backend/create-phase34-scoped-restore-test-fixtures.mjs `
  "D:\Users\user\Downloads\실제_Staging_백업파일명.json"
```

원본 JSON 파일 경로는 **실제 로컬 파일 경로**로 교체한다. 기본 출력 위치는:

`E:\project\rental-system\backups\restore-test\`

도구는 외부 통신이나 DB 접속을 하지 않는다. 원본 JSON의 `schemaMigrations` 메타데이터만 사용하고 기존 테이블의 데이터는 복사하지 않는다. 두 JSON 각각은 FAQ 시험 행 1건만 포함한다. 출력에서 `ADD_FILE`, `OVERWRITE_FILE`, `TEST_CATEGORY_ID`, `TEST_CATEGORY_NAME_BEFORE`, `TEST_CATEGORY_NAME_AFTER`, `FIXTURE_CREATE=PASS`를 확인한다.

`FIXTURE_CREATE=FAIL`이면 진행하지 말고 오류를 보고한다.

## 절차 2 — 없는 데이터만 추가
1. Staging 관리자 `시스템 > 데이터 관리 > 백업 JSON 선택 복원`으로 이동.
2. `ADD_FILE`의 JSON을 선택한다. 파일명이 아래 `선택한 파일:`에 표시되는지 확인한다. 파일 입력란 자체는 동일 파일 재선택을 위해 초기화된다.
3. **복원 범위는 오직 `공지사항·FAQ`만 선택.** 기본으로 켜지는 `사이트·디자인 문서`를 반드시 해제한다. `자산·카테고리`, `부서·사용자 명부`도 해제한다.
4. `없는 데이터만 추가`를 선택하고 `복원 미리보기` 클릭.
5. 반드시 다음과 같아야 한다.
   - 복원 예정: **추가 1건 · 덮어쓰기 0건 · 유지 0건**
   - `app_faq_categories`: 백업 1 / 기존 0 / 신규 1
   - `app_board_configs`, `app_board_posts`: 백업 0, 기존 0, 신규 0
   - **다른 모든 복원 대상 테이블에는 백업 행 0건**
6. 위 조건이 하나라도 다르면 **복원 실행 금지**. 이유 조사 후 재시도.
7. 조건 충족 시 확인 문구 `백업 데이터 복원`을 정확히 입력하고 선택 복원 실행. 추가 확인창도 확인.
8. **변경 1건** 성공을 확인. 관리자 FAQ 구분 관리에서 출력된 시험 카테고리 ID/명칭 확인.

## 절차 3 — 동일 ID 덮어쓰기
1. 시험 카테고리가 실제로 1건 존재함을 확인한 다음 `OVERWRITE_FILE` JSON을 선택한다.
2. 복원 범위는 다시 **오직 `공지사항·FAQ`** 선택. 파일 재선택 시 기본 범위가 초기화될 수 있다.
3. `동일 ID 덮어쓰기 (행 삭제 없음)` 선택 → `복원 미리보기`.
4. 반드시 다음과 같아야 한다.
   - 복원 예정: **추가 0건 · 덮어쓰기 1건 · 유지 0건**
   - `app_faq_categories`: 백업 1 / 기존 1 / 신규 0
   - 다른 모든 테이블: 0건
5. 위 조건이 다르면 실행 금지.
6. 실행 확인 문구 입력 후 복원 실행 → **변경 1건** 확인.
7. FAQ 구분 관리에서 시험 카테고리의 이름이 `TEST_CATEGORY_NAME_AFTER`로 변경되었는지 확인.

## 절차 4 — 감사·복구 기록 점검 (읽기 전용)
Staging DB에 다음 조회 SQL을 실행한다. 이 명령은 데이터를 변경하지 않는다.

```powershell
heroku pg:psql -a notebook-rental-api-staging-01 --command "SELECT a.restore_id, a.action, a.mode, a.affected_rows, (p.restore_id IS NOT NULL) AS has_preimage, a.created_at FROM app_system_data_restore_audit a LEFT JOIN app_system_data_restore_preimages p ON p.restore_id::text = a.restore_id WHERE a.action = 'apply' ORDER BY a.created_at DESC LIMIT 5;"
```

합격 기준: 최근 2건이 `addMissing`, `overwrite` 각각 `affected_rows=1`, `has_preimage=true`. 성공 복원 기록에는 동일 DB 변경 전 데이터 스냅샷이 존재해야 한다.

개인정보가 포함된 `preimage` JSON 원문은 CLI로 조회하거나 공유하지 않는다.

## 절차 5 — 시험 데이터 정리
- 관리자 `FAQ > FAQ 구분 관리`에서 **시험용 카테고리 1건만** 삭제한다. 아무 게시글도 연결되어 있지 않아야 한다.
- 원래 FAQ 카테고리는 절대 삭제하지 않는다.
- 삭제가 되지 않는다면 무리하게 SQL DELETE를 실행하지 말고 증빙과 함께 보고한다.
- 시험을 마친 뒤 관리 화면 FAQ 기능과 데이터 논리 검사를 다시 확인한다.
- 감사 및 변경 전 기록은 보안 증빙이므로 함부로 삭제하지 않는다.

## 오류 발생 시
- `system_restore_preview_stale`: 대상 데이터가 바뀌었으므로 미리보기부터 재실행. 1건 조건이 깨지면 중단.
- `system_restore_migration_mismatch`: 원본 JSON이 현 DB Migration과 다름. Staging 관리자에서 백업 JSON을 다시 내려받고 생성기를 재실행.
- `system_restore_unknown_column`: JSON 형식 또는 DB 구조 불일치. 실행 중단.
- 기타 오류: 해당 화면의 오류 코드와 시간, Staging Heroku 로그의 비밀정보를 제외한 오류 부분을 보고.

## 완료 판정
- 구조·무결성: 별도 완료.
- 논리 검사: Staging 완료.
- 추가 복원: 성공 1행 및 변경 전 데이터 기록.
- 덮어쓰기: 성공 1행 및 변경 전 데이터 기록.
- 시험 데이터 정리: 완료.
- 전체 DB 실제 복원 검증: **여전히 미실시**, 절대 성공으로 표시하지 않는다.
