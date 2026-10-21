# Phase 34 W01 · AC-S01 예외·초기화 보존 보강 검증

- 기준 코드: `521a56d46f39c0818947f1bdaf80296146786dcd` (사용자가 Staging v266에서 확인한 W01 핫픽스 배포 소스에 해당하는 Full ZIP)
- 입력 ZIP SHA-256: `d63d00de89b3821eebe26470882b11767e35b7b4db15057cc254ba616113ad9c`
- 추가 검증: `npm run server:phase34:w01-ac-s01-exceptions:smoke`
- 신규 테스트는 `npm run verify:phase34`에 포함
- 변경 성격: **검증 소스·검증 문서만 추가, 기존 서버/프런트 런타임·DB Migration 및 배포 스크립트 수정 없음**

## Mock 시험

1. 계정 1,000개(`bypass_client_trust=true`)를 정책 ON(`false`)으로 실제 Mock PATCH 1,000번 변경하고, 독립 GET 2,000회 이상 확인한다.
2. GET/PATCH에 한시적 429·503, 응답 지연을 섞고, 최대 동시 네트워크 Mock 작업 수가 8을 넘지 않는지 검증한다.
3. 영구 429는 최대 3회/호출 지점으로 제한한 재시도 후 `recovery_required`로 기록하고 허위 `synchronized`를 금지한다.
4. HTTP 상태번호 없는 타임아웃 유사 오류도 실패로 처리한다. 여기의 Mock은 응답 없는 영구 Hang까지 재현하지는 않는다.
5. 활성 PostgreSQL 대상의 Clerk 404는 `orphaned_active`로 차단하고, PG 활성 목록에서 퇴역 확정된 404는 오류가 아닌 제외로 분류한다.
6. PostgreSQL을 연결하지 않고 **메모리 상태를 지닌 SQL Fixture**에 실제 Repository의 `resetScopes({scopes:['settings']})`를 호출한다. 증빙 부재 시 409+ROLLBACK, 합성 증빙이 존재할 때는 보안 정책·동기화 키·기존 설정 감사 205건이 스냅샷과 동일한지 확인하고 신규 감사 테이블 251건 불변을 확인한다. 실제 전체 초기화나 실제 PG 증빙 생성이 아니다.
7. 실제 관리자 API의 최고관리자 `owner` 체크, JSON 선택 복원 파일의 보안 설정 제외를 소스 정적으로 재확인한다.

## 사용자가 제출한 Staging 증빙과 구별

- Staging GitHub SHA `521a56d`, Heroku Staging v266, Migration 042, `/health` 정상, 업무 회귀 8/8 PASS.
- Device Trust 정책 OFF Rev1 → ON Rev2, `device-trust-sync-state=synchronized`, 실패 계정 0, 감사 이벤트 기록.
- 기존 Clerk 계정과 신규 가입 계정에서 실제 Backend GET `BypassClientTrust=False` 각각 확인, 신규 회원 관리자 조회 정상.
- 감사 API 권한: 최고관리자 200, 일반 관리자 403, 미인증 401 확인.
- 전부 사용자 제출 증빙이다. 이번 새 Mock이 별도로 이를 실환경 재실행한 것은 아니다.

## 수용 한계

- W01-D05에 따라 **전체 초기화 실제 실행은 금지·미실행**. 합성 복원 증빙 테스트를 실제 완전 복원 완료 증거로 간주하지 않는다.
- 영구 네트워크 Hang, Clerk 실제 429·503, 실제 사용자 1,000명 부하, W02 부분 실패·롤백 완료성은 실환경에서 수행하지 않는다.
- W01의 실환경 정상 사례와 새 Mock의 실패 사례를 결합하여 AC-S01 변경 수용을 평가한다. W02/AC-S02·03 및 W03 전체 복원 검증으로 범위를 확대하지 않는다.
- **서버 기능, DB, Production/Staging 배포는 이 검증 코드 변경으로 인해 재배포할 필요가 없다.** 저장소 코드/검증 추적을 위해서만 신규 Full ZIP을 제공한다.
