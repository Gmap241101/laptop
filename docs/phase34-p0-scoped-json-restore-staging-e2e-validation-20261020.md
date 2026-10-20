# Phase 34 P0 — JSON 선택 복원 Staging E2E 준비 및 실패 감사 기록 Hotfix 개발·검증 보고

## 코드 기준선
`rental-system-phase34-p0-single-db-reauth-hotfix-20261020_deployment_package.zip` Full ZIP에서만 파생. 기존 JSON 백업/복원, Clerk 재인증, 단일 DB 모드, 041 변경 전 기록, 전체 초기화 차단은 유지.

## 이번 코드 변경
1. `server/src/settings/system-data-restore.mjs`: `restoreId`를 실행 트랜잭션 `try` 바깥의 함수 범위로 이동. 기존 코드는 실패 후 감사 기록 작성에서 스코프 밖의 `restoreId`를 참조해 실패 감사 기록이 누락될 수 있었다. 실패 시 ROLLBACK 후 별도 감사 기록 INSERT가 동작하도록 수정.
2. `tools/backend/smoke-phase34-zero-cost-single-db.mjs`: 실패 주입 시 원본 롤백·변경 전 기록 롤백·실패 감사 기록 1건 생성을 함께 검사하도록 확장.
3. `tools/backend/create-phase34-scoped-restore-test-fixtures.mjs`: 실제 Staging 백업 JSON의 Migration 이름·해시 정보만 재사용해 시험 FAQ 1행 추가/덮어쓰기 JSON 2개 생성. 네트워크·DB 연결 없음. 기존 기록·개인정보는 포함하지 않음.
4. `tools/backend/smoke-phase34-scoped-restore-fixture.mjs`: 시험용 JSON의 허용 스키마, PII/기존 데이터 제외, 동일 PK 및 변경된 이름을 검증.
5. 별도 실행 절차서 제공.

## 안전성 및 데이터 보호
- 테이블 전체 백업이나 전체 복원 검증을 우회하지 않음.
- DB 1개/Basic web dyno 1개/Heroku 기존 백업만 사용.
- 시험 대상은 `app_faq_categories` 단일 신규 카테고리 한 행; 기존 117행은 JSON에서 완전히 제외.
- 다른 카테고리와 기존 자산·회원·게시글은 실행 대상 아님.
- 시험 성공 판정은 실제 Staging 브라우저에서 별도 수용 필요.

## 자동검증
- `smoke-phase34-zero-cost-single-db.mjs`: PASS (실패 감사 기록 회귀검증 포함)
- `smoke-phase34-scoped-restore.mjs`: PASS
- `smoke-phase34-scoped-restore-fixture.mjs`: PASS
- `smoke-phase34-scoped-restore.mjs` (frontend): PASS

## 미검증·남은 작업
- 실제 Clerk 인증·Staging JSON 추가·덮어쓰기 E2E 실행은 아직 미실시.
- 시험 파일 원본은 사용자 로컬 PC에 있으며 서버로 업로드·배포하지 않음.
- Staging 웹 동작/복원 감사 SQL 조회·시험 카테고리 삭제 완료를 사용자 결과로 확인해야 함.
- DB 전체 복원은 미실시이며 전체 초기화 차단 상태 유지.
