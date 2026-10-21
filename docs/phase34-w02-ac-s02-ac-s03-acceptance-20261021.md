# Phase 34 W02 — AC-S02/AC-S03 최종 경계 시험 (2026-10-21)

## 검증 기준

- 기준 소스: `rental-system-phase34-w02-admin-logout-route-hotfix-20261021_deployment_package.zip`; 기준 SHA-256 `6ed22cb4e3dec87709c613d76e4fe98358b509fa8db8897370498ab3da485cdc`.
- 원본 수용기준: AC-S02(부분 실패 10명 중 1명), AC-S03(상반된 관리자 저장 2·10건, 한 요청 타임아웃).
- 별도 W02 세부기준: `기기대여시스템_Phase34_W02_착수준비_관리자로그인전환UX_원인분석_최종개발사양_20261021.md`의 AC-S02-01~08, AC-S03-01~04.
- 실서비스 보호: 실제 Staging/Production Clerk 장애 주입·실계정 1,000명 동기화·DB 초기화 금지, 기존 PostgreSQL·web dyno 이용, 추가 비용 없음.

## 세부 수용 기준 결과

| 기준 | 증빙/확인 | 판정 |
|---|---|---|
| AC-S02-01 | 10개 Mock 계정의 중간(index 4)·마지막(index 9) PATCH 실패, 보상 성공/실패, 정책 Revision 불변 | Mock PASS |
| AC-S02-02 | 503 일시 장애 후 재시도·독립 GET, 기존 429 + Retry-After 검증 유지 | Mock PASS |
| AC-S02-03 | PATCH 실제 적용 후 응답 유실(Timeout)·클라이언트 재시도 후 전체 GET 확인 | Mock PASS |
| AC-S02-04 | 활성 Clerk 계정 404는 복구 필요; PostgreSQL 활성 대상에서 제거된 퇴역 계정은 안전 제외 | Mock PASS |
| AC-S02-05 | 롤백 실패 시 `recovery_required` 영속 기록, 새 정책 변경 409, 명시적 재동기화 후 복구 기록 종결 | Mock PASS |
| AC-S02-06 | 보안 기본 ON에서 원 정책 행 미존재 시 실패 복구 뒤 행 부재 유지, `{}` 정책 쓰지 않음 | Mock PASS |
| AC-S02-07 | 과거 작업 `applying` 레코드를 모의하여 정책 변경 409 및 관리자 재적용으로 `recovered` 확인 | Mock PASS |
| AC-S02-08 | 이전 W02 멱등 재동기화 스모크와 W01 확인 재사용; 같은 상태에는 PATCH 생략, GET 유지 | Mock PASS |
| AC-S03-01 | 하나의 정책 변경 처리 중 상반 2 요청 모두 409, 하나의 정책·Revision으로 수렴 | Mock PASS |
| AC-S03-02 | 상반 10 요청 모두 409, 한 작업만 `synchronized` | Mock PASS |
| AC-S03-03 | 선행 PATCH 응답 유실과 2개 경쟁 정책 요청 409, 선행 작업 보상 및 원 정책 Revision 유지 | Mock PASS |
| AC-S03-04 | Audit GET 200·403·401은 기존 W01 Staging 사용자 결과; W02 POST/PATCH 최고관리자만 허용하는 guard 소스 확인. 각 Mutation endpoint의 일반관리자 Staging HTTP 직접 시험은 별도 수행되지 않음 | 부분 실환경 + 정적 PASS |

### 추가 검증

- 신규 독립 테스트 `tools/backend/smoke-phase34-w02-acceptance-matrix.mjs` : 55개 Assertion, 실제 Clerk/PG 호출 없음.
- 기존 W02 `smoke-phase34-w02-recovery.mjs`: 40개 Assertion PASS.
- W01 `smoke-phase34-w01-ac-s01-exceptions.mjs`: 36개 Assertion PASS.
- 실제 사용자 제출 Staging: Migration 043, `app_device_trust_operations` 테이블, Revision 4 정책 ON·동기화 `synchronized`; Operation 2건 `synchronized/committed` 및 `synchronized/verified`, 오류 코드 없음.
- 관리자 UX: 사용자 보고 최고관리자·일반관리자 로그아웃 후 `/admin` 유지, 데이터 확인 화면 재표시 해소. 로그인 후 대시보드 정상.
- 이전 로그의 Revision 2→4는 사용자의 2회 정책 변경으로 설명됨. 이상 징후가 아님.

## 수용 판정 및 한계

- **AC-S02, AC-S03의 복구·동시성 핵심 동작은 승인된 Mock 장애 주입 기준 충족**.
- W02 실서비스에서 429/503/타임아웃·서버 강제 종료·10건 실제 동시 변경을 **수행한 것은 아님**.
- 최고관리자 전용 API의 일반관리자 403·미인증 401은 W01 감사 GET에서 실제 확인; W02 POST/PATCH 변경 API에 대해서는 소스 guard만 확인. 운영 수용은 위험 없는 부정권한 요청 테스트로 추가 검증 가능.
- 현 W02 변경 이후 기존 8개 전체 업무의 Staging 수동 회귀 8/8이 다시 제출된 것은 아님. W01에서 8/8 확인됐더라도 W02 수동 8/8로 대체해서 기록하지 않는다.
- W02 이외 W03의 원본 **AC-S04**(격리 DB 전체 복원)는 현 무추가비용·단일 DB 정책과 충돌하므로 승인 없는 PASS 처리 금지.

## 운영 지침

- 이번 추가 테스트는 검증 전용 변경(`package.json`, 신규 테스트, 신규 문서)만 포함. 런타임·Migration 043·클라이언트 UI 변경 없음. 재배포 불필요.
- 마지막 Staging 프런트엔드 정상 핫픽스와 Heroku v268 및 Device Trust Revision 4 유지. Production 승격 금지.
- 신규 W03 착수는 AC-S04의 변경 수용기준을 먼저 확정하고, 기존 자원(단일 DB, 기존 web dyno, 기존 PGBackups, 관리자 JSON 선택 복원) 안에서 비파괴 시험으로 진행.
