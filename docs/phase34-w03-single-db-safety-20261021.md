# Phase 34 W03 — 선택 복원 미리보기 만료 및 단일 DB 안전성 개선 후보

- 작성: 2026-10-21
- 기준선: `rental-system-phase34-w02-ac-s02-ac-s03-final-validation-20261021_deployment_package.zip` (W02 AC 최종 검증 패키지, 관리자 로그아웃 경로 핫픽스 포함)
- 정책: 신규 DB/Worker/dyno/스토리지/유료 자원 생성 금지. Staging/Production에 직접 접속하거나 데이터 변경하지 않음.
- **중요**: 원본 AC-S04(격리 DB 전체 백업 실제 복원)는 **미실시·미수용**. 변경 AC-W03-Z01~09는 2026-10-21 당시 제안안으로 **별도 승인 전**, 원본 AC-S04를 대체한 것으로 보지 않음.

## 실제 코드 수정

1. `server/src/settings/system-data-restore.mjs`
   - 선택 복원 `previewIssuedAt`, `previewExpiresAt`(서버 시각 + 10분) 제공.
   - `previewIssuedAt`을 `previewSha256` 계산에 포함하므로 임의 시각 바꿔 재사용하면 `system_restore_preview_stale`(409) 처리.
   - 실행 전 발급 시각 누락(`system_restore_preview_required` 409), 10분 만료·미래 발급시각(`system_restore_preview_expired` 409) 거부.
   - 검사는 PostgreSQL 연결·트랜잭션 시작 전에 수행. 기존 미리보기 DB 스냅샷 확인, 유효한 변경 전 이미지와 원자적 쓰기, 소유자 인증은 유지.
2. `src/features/settings/useAdminDataMaintenanceController.js`
   - 미리보기 발급 시각을 실행 요청으로 전달하고 만료 시 사용자에게 '복원 미리보기가 만료되었습니다. 복원 대상을 다시 확인해 주세요.' 표시.
3. `tools/backend/smoke-phase34-scoped-restore.mjs`, `tools/backend/smoke-phase34-zero-cost-single-db.mjs`: 신규 필드에 맞춘 기존 Mock 수용 유지.
4. `tools/backend/smoke-phase34-w03-safety.mjs` / `tools/frontend/smoke-phase34-w03-preview-ttl.mjs`: W03 집중 자동검증.
5. `package.json`: W03 시험 등록 및 `verify:phase34`에 포함.

## W03 변경 수용기준 이행 상태(자원 추가 금지 가정)

| ID | 근거 | 판정 |
|---|---|---|
| Z01 PGBackups 완료·스케줄 | 기존 사용자 로그에 Completed 이력 있음. 최신 배포 이후 재조회 미실시 | **부분** |
| Z02 pgdump 아카이브 SHA/list | 해당 `pgdump` 바이너리 미제공·로컬 독립 아카이브 미검증 | **미실시** |
| Z03 단일 DB read-only 논리 검사 | `inspectSingleDatabase` 실제 함수 Mock, 검사 종류/쓰기금지 확인 | **Mock PASS** |
| Z04 전체 초기화 차단 | `assertDurableProof` 409, 복원 증빙 파서·리셋 코드 계약 | **Mock·정적 PASS**. 실환경 파괴 명령 미실행 |
| Z05 JSON 선택 복원 | 4개 범위·2개 모드·삭제 없음·기존 Scoped Mock | **Mock PASS** |
| Z06 미리보기 만료·Migration·행/본문 상한 | 10분 유효기간 코드 신규 구현, 2500행·8MiB API body·Migration 실패 조건 확인 | **Mock·정적 PASS**, 브라우저 미검증 |
| Z07 원자성·부분 실패 | 기존 Scoped Mock의 SERIALIZABLE, 사본, ROLLBACK + 신규 계약 | **Mock PASS** |
| Z08 최고관리자·감사 | 기존 owner-only API/별도 Mock 확인; W03 신규 권한 실제 HTTP 미실행 | **Mock·정적 PASS** |
| Z09 보존 대상 | 기기 정책·동기화·감사 제외 SQL 계약 확인 | **정적 PASS** |

**전체 Z01~Z09 실환경 PASS 또는 원본 AC-S04 PASS라고 주장하지 않는다.**

## 배포·호환성

- API 계약 변경: `previewIssuedAt` 필드가 **실행 요청에 필수**. 프런트엔드·백엔드 모두 패키지의 동일 버전으로 Staging 배포해야 함.
- 배포 시 프런트엔드 먼저, 백엔드 나중에 전환하고 해당 구간에는 관리자 선택 복원 기능을 사용하지 않는다. 구버전 프런트엔드에서 새 백엔드로 실행하면 409 실패하지만 DB는 변경되지 않음.
- 변경 대상에 Migration 없음. Heroku W02 Migration 043 재실행 불필요; 릴리스 스크립트가 기존 마이그레이션을 'already applied'로 판정하는 것은 정상.
- 기존 백업 전체 초기화 Gate는 그대로 유지. Production 릴리스 별도 승인 없이는 금지.

## 통합 자동검증

- `npm run verify:phase34`: **78개 개별 명령 모두 PASS**, 종료 코드 0.
- W03 서버 전용 집중 시험: **48개 Assertion PASS**.
- W03 프런트 전용 계약 시험: PASS.
- 기존 서버 Scoped Restore 및 Zero-cost Single-DB 테스트: PASS.
- 변경 JavaScript 6개 파일 `node --check`: PASS.
- **Vite 빌드 미실시**(현 검사 환경에 `vite` 모듈 미설치). Windows Staging 빌드 필수.

## Staging 브라우저 수용(배포 후에만)

1. 최고관리자 로그인·최근 재인증 후 JSON 선택 복원 미리보기 실행. `previewIssuedAt`, `previewExpiresAt` 서버 응답 확인(브라우저에는 불필요한 내부 문자열 노출 금지).
2. 미리보기 변경 데이터 없음 또는 변경대상 건수 검토; **실데이터 덮어쓰기 시험은 금지**.
3. 10분 이후 기존 미리보기를 실행하려고 해도 409 `system_restore_preview_expired` 및 DB 데이터 불변인지 안전한 격리 Mock으로 확인; 실제 사용자 데이터에 적용하지 않음.
4. 변경 없는 데이터를 대상으로 별도 승인된 안전한 Fixture가 없다면 복원 실행 시험은 미실시로 기록.
5. 기존 업무 회귀 8개 영역. 관리자 로그인 후 대시보드 직접 표시, 로그아웃 후 `/admin` 유지.

## 중단 기준

- 빌드, 사전 소스 감사, Migration 검증 중 하나라도 FAIL이면 배포 금지.
- 데이터 초기화 가능 표시, 전체 복원 인증 생성, 미승인 DB/스토리지 요금 변경이 발생하면 즉시 중단.
- Restore preview/API 계약이 달라 미리보기 실행이 409를 반환한다면 재시도 반복/정책 토글/수동 DB 조작 금지. 프런트와 백엔드 SHA 일치부터 확인.
