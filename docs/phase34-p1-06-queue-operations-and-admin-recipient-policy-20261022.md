# Phase 34 P1-06 — 관리자별 이메일 수신 설정·대기열 관리·날짜 기반 알림

## 기준선과 수용 범위
- 사용자가 Staging에 배포한 P1-05 GitHub 커밋: `046addeaec98736028921cae4fda3c312b5e3abc` / Heroku Release `v285`.
- 관리자 2명(최고관리자 1, 일반관리자 1)과 고유 수신자 2명, `admin_rental_pending` queued 2건 확인.
- 관리자별 수신 여부 설정을 **관리자 계정 관리 > 계정 수정**에 신규 추가해 달라는 사용자 요청 반영.
- 실메일 전송, Production, DNS, Clerk 인증 정책, 신규 DB·dyno·worker·요금제 변경 **금지**.
- 날짜 기반 2종의 서버 자동등록은 기능 플래그 기본 OFF. 승인 없이 설정을 켜지 않음.

## 변경 내용
### 1. 관리자 수신자 토글
- `server/migrations/046_phase34_p1_06_admin_mail_preference.sql`은 기존 DB의 `app_admin_identity_registry`에 `mail_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE` 추가. 기존 최고관리자·일반관리자의 종전 수신 상태 유지.
- 최고관리자만 다른 관리자 포함 모든 관리자 계정의 이메일 알림 수신을 ON/OFF 변경할 수 있음(서버의 owner 권한 검사 필수). 일반관리자는 토글 읽기만 가능.
- 관리 화면 `src/admin/AdminAccountEditDialog.jsx`: MK 오렌지색 기존 스위치. 변경한 값은 기존 관리자 계정 UPDATE API와 DB에 반영. 계정 목록 조회에도 포함.
- 수정과 동시에 미발송 상태(queued/retry)의 해당 관리자 대상 2종 요청 메일만 `cancelled` 처리. 이미 전송된 건은 손대지 않음. DB 내 선호도 변경 감사 테이블 `app_admin_mail_preference_audit` 추가.
- 메일 신규 생성 시 선호 OFF 계정 제외하고, 후속 발송 claim 때에도 선호·활성·Clerk 연동·잠금 여부 재확인. 차단 시 발송 대신 cancelled.
- 메일 유형 자체가 OFF이면 최고관리자/일반관리자 개별 토글이 ON이어도 Outbox에 등록하지 않음.

### 2. 대기열 조회·취소
- `GET /api/admin/mail-queue`: 최고관리자 전용, 최근 30건의 유형·마스킹된 수신 주소·상태·등록일시·실패 코드 및 상태별 전체 건수. 제목·본문·수신 이메일 원문은 API로 반환하지 않음.
- `POST /api/admin/mail-queue/:id/cancel`: 최고관리자 전용. queued/retry만 취소; processing/sent/failed/uncertain 재처리나 삭제는 금지. `app_mail_queue_actions`에 행위자/이전·이후 상태와 시각 감사 기록.
- 관리자 이메일 알림 관리 메뉴에 발송 내역 패널·취소 확인창 제공. 기존 메일 템플릿 편집 기능과 분리.
- 기존 P1-04/05 시험용 queued 메일을 이 화면에서 선별 취소 가능; 소스/DB 직접 삭제 불필요.

### 3. 예정·연체 알림 안전성 기반
- 반납 1일 전 `rental_due_reminder`, 연체 중(한국 날짜 기준 1일 1회 후보) `rental_overdue`의 업무 후보를 동일 PG 트랜잭션에서 조회해 Outbox에 중복 키와 함께 등록할 수 있도록 함.
- 기존 P1-04의 `listScheduledUserMailCandidates` 사용. `r.status='대여중'`, `due_date` 조건, row lock 및 트랜잭션 commit/rollback.
- `app_mail_outbox`에 `source_request_id`, `source_due_date`, `scheduled_for_date` 기록. Claim 시 반납완료·날짜 변경·지난 날짜 대기건을 재확인하고 취소.
- DB advisory transaction lock + Outbox dedupe로 동일 web dyno 재기동·복수 호출에서도 중복 생성을 막음.
- 실행 플래그 `P106_SCHEDULED_ENQUEUE_ENABLED=true`를 명시적으로 설정한 경우만 기존 web dyno 내 hourly tick을 시작. **기본 OFF**, 실메일 Sender는 기존 `P103_REAL_DELIVERY_LOCKED=true` 상태이며 여전히 서버에 연결되지 않음.
- **일 1회·연체 빈도/대여 정책 수용 조건 및 실제 PostgreSQL 통합 시험 전까지 자동등록 플래그를 켜지 않음**. 배포만으로 예약 알림을 자동 생성하지 않음.

## 제한 및 후속
- 이번 단계는 P1-06 **1차 개발**이며 모든 실제 환경 검증을 완료한 것은 아님. Migration 046 실 DB 적용, 관리자별 ON/OFF 수신자 검사, 기존 시험용 queued 취소 및 사용자 기존 업무 8영역을 Staging에서 검증해야 함.
- 로컬 검증은 JavaScript unit/mock 및 정적 소스 검사이며, 실제 PostgreSQL 트랜잭션 동시 실행·웹 UI 실동작·날짜 경계 E2E는 검증하지 못함.
- 자동 스케줄 활성화, 실제 공급자 메일 발송, P1-08 실수신 테스트는 별도 승인·수용 조건에 따름.
- 개인정보 보존기간·실패 내역 조회 범위·운영 감사 정책은 P1-06 후속 검증에서 보완 가능.

## 검증 명령
```
npm run server:phase34:p1-06-mail-operations:smoke
npm run verify:phase34
npm run package:guard
```
