# Phase 34 P1-08 G6-C — 기존 로컬 PostgreSQL 18 수용시험 (Staging 미배포)

**상태:** 새 검증도구 개발 / 로컬 PostgreSQL 실제 실행 미완료 / DB Migration 050 미승인·미적용 / Brevo 네트워크 호출 0.

## 배경과 수정
- G6-C SQL DRAFT의 상태/결과/해시 결합 CHECK 조건 보강, `IS TRUE` 사용. 이전 CHECK는 `NULL` 평가가 PASS될 수 있는 상태가 있었음.
- 예약 및 감사 테이블은 기존 UPDATE/DELETE 차단 이외에 `TRUNCATE` 차단 트리거 추가. SQL DRAFT는 계속 **NOT DEPLOY**.
- 기존 G6-C 모의 101개 테스트를 대체하지 않는 실제 로컬 PostgreSQL 18 DDL 실행 및 두 DB 연결의 동시 UNIQUE 테스트 추가.

## 고정 규칙
- 기존 `rental_restore_YYYYMMDD_HHMMSS` 로컬 DB만 허용. DB 추가 생성 없음.
- 접속 서버 실주소는 `127.0.0.1` 또는 `::1`, 포트 5432, PostgreSQL 서버 18.x 검증.
- 별도 난수로 생성한 `p34g6c_...` 스키마 내에서만 DRAFT SQL·합성 fixture 실행. 기존 public 데이터, 운영 Outbox 불변.
- 정상/오류 종료 모두 scratch schema 제거 및 부재 확인. 정리 실패라면 에러 로그의 scratch schema 이름을 DBA가 점검할 것.
- JWT·최고관리자·Brevo 증빙은 합성 fixture. 실제 Clerk/실제 Brevo/실제 이메일 공급자 호출 없음.
- 독립 승인 증빙은 합성 콜백만 사용: 실제 공급자 콘솔 독립검증이 아님.

## 실행 (PowerShell 5.1 / Node 22 권장)
1. 이번 ZIP을 **새로운 빈 폴더**에 압축 해제한 뒤 폴더의 루트로 이동.
2. 필요 시 한 번만 `npm --prefix server ci`로 기존 pg 8.22.0 의존성을 설치. 다른 의존성이나 DB, Worker, Heroku를 생성하지 않음.
3. `npm run package:guard`, `npm run server:phase34:g6c-pg18-local:smoke`, `npm run server:phase34:g6c-schema-guard:smoke` 확인.
4. 계획 확인: `.\tools\ops\Test-G6C-Local-PG18.ps1`
5. 기존 로컬 복원 DB가 있고, 테스트용 임시 스키마 생성·제거에 동의하는 경우에만 아래 수행:

```powershell
.\tools\ops\Test-G6C-Local-PG18.ps1 `
  -Database rental_restore_20261020_112826 `
  -ExecuteLocal `
  -ApproveTemporaryScratchSchema
```

- 로컬 PostgreSQL 암호는 숨김 입력되며 명령 기록/출력에 기록되지 않음.
- 실제 기존 복원 DB 이름이 다르면 `-Database`를 해당 이름으로 변경.
- 데이터베이스 `CREATE SCHEMA` 권한이 없어 실패할 수 있음. 임의 권한 상향이나 `postgres` DB/Heroku DB에서 시도 금지.
- 예상 성공: `"stage":"G6C_LOCAL_PG18_ACTUAL_DDL","result":"PASS","scratchSchemaDropped":true,"stagingDatabaseTouched":false`.
- 이 결과는 050 **실운영 적용 승인**이나 네트워크 실행 승인을 부여하지 않음.

## 실제 검증 범위
- SQL DRAFT 적용, CHECK/UNIQUE, 감사 UPDATE/DELETE/TRUNCATE 불변, 예약 DELETE/TRUNCATE 불변.
- held 상태에 공급자 응답 해시 삽입 및 허위 종료 결과 변경 차단.
- 기존 Outbox 5와 preflight는 **별도 scratch synthetic table**로만 시험.
- 동일 승인번호/재인증 재사용 차단, 서로 다른 PostgreSQL 클라이언트 경합 시 단 한 번 COMMIT.
- 감사 저장 실패 시 예약 ROLLBACK, 최종 scratch 스키마 삭제.

## 다음 게이트
- 검증 PASS 후에도 정식 Migration 050 적용 전 기존 Staging DB의 스키마 충돌·권한·백업·버전·Outbox 잠금 확인 필요.
- 실제 운영 DB 적용은 사용자 **별도 명시적 승인** 이후. 실제 Brevo Sandbox 네트워크 1회 역시 별도 승인 이후.
