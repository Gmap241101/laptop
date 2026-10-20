# 기기 대여 시스템 Phase 34 P0 — 단일 PostgreSQL 무추가비용 변경 및 검증 보고

작성: 2026-10-20. 신규 소스는 `rental-system-phase34-p0-web-backup-verification-20261020_deployment_package.zip`(Phase 34 P0 웹 백업 검증 Full ZIP)을 유일 기준선으로 사용하며, 기존 SQL 42P02 핫픽스·Migration 039·Device Trust 수정사항을 유지한다.

## 1. 개발 범위·한계

- 사용자 결정: 신규 Heroku DB·별도 Worker·Object Storage·유료 애드온/플랜 상향 전부 금지. 기존 Heroku Essential-0 PostgreSQL + Basic web dyno만 사용.
- 승인된 기존 JSON 다운로드/업로드/복원 미리보기/`addMissing`/`overwrite`/감사/원자적 롤백 유지.
- 웹 백업 검증의 신규 단일 DB 모드는 **논리적 읽기 전용 정합성 검사**이며 `pg_dump`/`pg_restore` 전체 복원 검증이 아니다. 사용자에게 **전체 복원 성공이라고 표시하지 않는다**.
- 기존 Heroku PGBackups 수동 `b003`/자동 예약(03:00 Asia/Seoul)은 코드와 별개로 유지. 앱이 Heroku Platform API에 접근해 이를 조회·새 백업을 생성하는 기능은 이번 패키지에 포함되지 않는다.
- 전체 데이터 초기화는 원래의 독립 DB 복원 증빙 없이는 서버에서 차단한다. JSON 선택 복원과 전체 초기화의 안전 수준은 구별한다.

## 2. 수정 및 추가

1. `server/src/settings/backup-verification-single-db.mjs` 신규: 읽기 전용 REPEATABLE READ에서 public 테이블 행수·미적용 제약·무효 인덱스·Migration을 검증; SHA-256 논리 스냅샷 요약만 Job에 기록. DB 전체 복원 증빙 **절대 발급 안 함**. 기존 web dyno에서 비동기 실행, 2분 중단 작업은 `interrupted`로 분류.
2. `server/src/index.mjs`: 환경변수 `BACKUP_VERIFY_MODE=single-db`이면 위 서비스를 사용, 아니면 기존 전체 복원 경로 유지(기존 운영본에 대한 비의도적 변경 방지).
3. `server/src/app.mjs`: 단일 DB 모드의 **범위 제한 JSON 선택 복원**은 기존 `assertDurableProof`를 재사용하지 않고, 복원 엔진의 DB-트랜잭션 단위 변경 전 데이터 확보로 보호. **전체 초기화**에는 `assertDurableProof`가 그대로 적용돼 단일 DB 모드에서 반드시 실패.
4. `server/src/settings/system-data-restore.mjs`: 지원 4개 범위/2개 모드 그대로. 단일 DB에서는 Migration 041 적용 여부 확인, 변경 전 행·요청 키를 JSONB 복구 기록 테이블에 **동일 SERIALIZABLE 트랜잭션으로 기록**하고 INSERT/UPSERT를 수행. 복구 기록 최대 4MiB, 선택 복원 최대 2,500행, 기존 미리보기 지문 및 SQL 42P02 수정 유지. 실패 시 사본과 실제 변경 모두 ROLLBACK. 복구 기록은 PostgreSQL 내부이므로 DB 전체 장애에 대비한 백업이 **아님**.
5. 신규 `041_phase34_p0_single_db_scoped_restore_safety.sql`: `app_system_data_restore_preimages` 테이블/조회 인덱스 추가. 이전 001~040 Migration 미수정.
6. `Procfile`: **추가 비용이 발생할 수 있는 worker 프로세스 선언 제거**; 기존 web + release 유지.
7. `src/admin/AdminSettingsPanel.jsx`, `src/features/settings/useAdminDataMaintenanceController.js`: `백업·데이터 안전검사`의 읽기 전용 성격 표시, 논리 완료와 전체 DB 복원 성공 구별, JSON 선택 복원 모드별 안전 정책 적용, 기존 UX·복원 범위 유지.
8. `tools/backend/smoke-phase34-zero-cost-single-db.mjs`: 새로운 논리 검사 + 실제 `createScopedJsonRestore()` 호출 경로의 변경 전 사본/중간 실패 롤백 테스트 추가. 기존 프런트 검사 스크립트는 새로운 제목과 핵심 경고문 확인으로 현행화.
9. 구 운영 절차서에 명시적인 폐기 안내를 추가하고, 무추가비용 실행 절차서를 추가.

## 3. 로컬 테스트 결과

- `npm run verify:phase34`: **PASS** (기존 전체 검사 + 신규 단일 DB 회귀 포함). 새 스크립트가 1개 추가되어 기존 67개에서 **68개**.
- `server:migrations:static-check` PASS; `server:check` PASS.
- `server:phase34:scoped-restore:smoke` PASS (기존 전체 복원 증빙 모드 호환).
- `server:phase34:zero-cost:smoke` PASS (실제 복원 서비스 mock에서 2가지 복원, 변경 전 행 기록, 실패 rollback).
- Frontend 변경 JSX/JS TypeScript 파서 구문검사 PASS.
- 전체 ZIP 해시/목록/CRC는 패키징 완료 후 별도 검증보고와 결합해야 한다.

**실제 환경 미검증:** Heroku Staging PostgreSQL 18.4 실데이터 기반 INSERT/UPSERT, Migration 041 적용, Clerk `fva`/`reverification_id` 이메일 step-up, Vercel Vite Production build, 실제 web dyno 재시작·성능. 따라서 `Production` 승격은 미승인이다.

## 4. 중요 수용조건

| ID | 검증 시나리오 | 기대 결과 |
|---|---|---|
| ZC-01 | 단일 DB 논리 검사 | DB에 쓰지 않고 대상 테이블 행수 및 마이그레이션 검사 |
| ZC-02 | 최근 재인증 누락/만료 | 작업 시작 403 |
| ZC-03 | DB 자동 백업/격리 복원 혼동 | UI에서 전체 백업·전체 복원 PASS를 표시하지 않음 |
| ZC-04 | 최고관리자 아닌 계정 | 시작·취소·상태 조회 403 |
| ZC-05 | JSON 미리보기 | 기존 4개 범위, 2개 모드, 지문검사 작동 |
| ZC-06 | JSON `addMissing` | 기존 데이터 유지·신규 데이터만 추가 |
| ZC-07 | JSON `overwrite` | 같은 기본키 변경 전 사본 기록 및 정상 변경 |
| ZC-08 | 중간 SQL 오류 | 변경 전 기록·데이터 변경 모두 롤백 |
| ZC-09 | 오래된 미리보기 | 복원 409, 데이터 변경 없음 |
| ZC-10 | 전체 초기화 | 독립 복원 증빙 없으면 계속 거부 |
| ZC-11 | 백업 원본 | 기존 PGBackups 예약 및 사용자의 로컬 파일은 소스 변경과 분리 |
| ZC-12 | 회귀 | 인증·Device Trust·대여·자산·게시판·사이트·데이터 8개 모두 PASS |

## 5. 사용자 실행 절차

상세한 PowerShell 명령은 `docs/phase34-p0-single-db-zero-cost-runbook-20261020.md`를 참고한다. 주요 단계: Full ZIP `deploy.ps1 v13.5` → `gh-pages-3` 반영 (`Production N`) → Staging Heroku Backend push → Migration 041 적용 확인 → `BACKUP_VERIFY_MODE=single-db` 설정 → Clerk 이메일 step-up 확인 → Staging 사이트 기존 복원 E2E → 8개 회귀검증 → 별도 Production 승격 승인. **신규 DB/Worker/S3 비용 없음.**

## 6. 잔여 위험 및 제한

- 단일 DB에 저장된 복구 기록은 DB 전체 손상이나 DB 삭제로 함께 소실될 수 있다. 자체 복구 기록은 독립 백업이 아니다.
- 앱이 Heroku PGBackups 백업 상태를 직접 조회·실행하지는 않는다. 기존 CLI/스케줄이 별도로 수행한다.
- 동일 DB 논리 검사로 전체 DB 복원 증빙을 대체할 수 없으므로 **전체 초기화 기능은 차단 상태**. 사용자 비용 제한 아래 이 부분은 실현 불가능한 수용항목으로 별도 표시.
- 기존 web dyno에서 검사 진행 시 짧은 추가 부하가 발생하고 프로세스 중단 시 Job이 중단될 수 있다.
- JSON `overwrite`는 데이터 변경을 수반한다. 먼저 시험용 데이터에서만 Staging 검증하고 실제 데이터의 덮어쓰기는 새 백업 상태 확인 후 운영 정책에 따라 수행한다.
- 기존에 확인된 Staging 백업 `b003`(SHA-256 `CA6BA06FB83C52CBE8E6E0F0AD586F6A5D508494EC007846FEF977BFC0B054B5`)는 기존 별도 로컬 파일로 보관되며, 패키지에 포함하지 않는다.

## 7. 배포 시 안전 조건

- 작업 전 Production은 현재 안정 릴리스를 유지한다. 신규 Migration 041은 Staging에만 먼저 적용.
- 배포 실패 시 신규 소스를 운영에 승격하지 않는다.
- `BACKUP_VERIFY_MODE=single-db`는 이번 새 API 동작의 명시적 활성화 스위치이며 추가 요금과 관계없다. `DATABASE_URL`을 변경해서는 안 된다.
- 이메일 자동 발송 기능은 별도 과업으로 이번 수정에 포함되지 않았다.
