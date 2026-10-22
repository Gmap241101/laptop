# Phase 34 P1-05 — 관리자 승인 요청 이메일 2종 연결 (2026-10-22)

## 기준 및 범위
- 승인된 Staging P1-04 GitHub `gh-pages-3` 커밋: `8314c66a0dfda3a7834a4d278f20c6cd45f02e36` (Heroku release `v283`). P1-04 기존 업무 회귀검증 8/8 PASS 사용자 확인, 최초 대여 신청에서 `rental_submitted` Outbox queued 1건 확인.
- 사용자 지정: 19종 메일 토글 모두 OFF로 원복, 실제 이메일·Production 변경 금지.
- P1-05 이벤트 2종 `admin_signup_pending`(가입 승인 요청), `admin_rental_pending`(대여 신청 요청)만 구현. 신규 DB/Worker/Redis/스토리지/애드온 및 Migration 없음(기존 001~045 유지).

## 발생 시점
- 가입 승인 요청: 일반 회원가입 생성 트랜잭션의 `status='pending'`만. 자동승인 `active`, 관리자 직접 회원 생성은 제외. `server/src/accounts/account-lifecycle-repository.mjs`.
- 대여 신청 요청: 본인의 신규 대여 신청 트랜잭션에서만. `createAuthoritative`의 기존 Idempotency 반환(`reused:true`)은 제외. `server/src/rentals/rental-request-write-repository.mjs`.
- 두 곳 모두 기존 같은 `client`/`BEGIN` ~ `COMMIT` 안에서 `enqueueAdminPendingMail` 호출. 관리자 알림 OFF는 관리자 계정 조회·Outbox INSERT 모두 생략. ON 상태 Outbox 실패 시 PostgreSQL 업무도 ROLLBACK.
- 가입에서 외부 Clerk 연결 실패 시 `rollbackUnlinkedSignup`이 호출되면 **queued 관리자 가입요청만** 고유 dedupe 키로 식별해 제거하며 다른 계정 메일은 유지. 이미 발송 시도가 있는 건 임의 삭제하지 않음. 외부 Clerk와 DB를 하나의 분산 트랜잭션으로 묶을 수 없음.

## 관리자 수신자 정책
- 권한 정보 출처: 기존 `app_admin_identity_registry` (새 계정 테이블/새 DB 아님).
- 조건: `status='active'`, `admin_role IN ('owner','admin')`, `clerk_link_state='linked'`, `clerk_user_id` 존재, 잠금 만료 또는 잠금 없음.
- `auth_email` 주소 형식 검증/소문자 정규화/중복 제거, 결과 최대 100개 초과 시 업무 트랜잭션 거부(일부 관리자만 알리는 누락 방지). 유효한 관리자 주소가 0개일 때는 알림만 생략하고 업무는 성공.
- 최고관리자 외 일반 관리자도 수신 가능. 기존 관리자 이메일 수정이나 역할 변경이 발생하면 **새 알림부터** 반영. 수신자 변경 설정 UI는 이번에 추가하지 않음.
- 가입·대여 담당자의 개인 주소를 사용하지 않으며, 클라이언트에서 임의의 관리자 수신자 목록을 보낼 수 없음.
- 이벤트/고유 업무 ID/관리자 이메일 SHA-256 중복 키에 따라, 같은 이벤트 반복 실행으로 중복 Outbox를 생성하지 않음. 수신자당 별도 행 생성.

## 보안, 한계 및 차기 수용
- P1-03 Mock 발송 전용, `P103_REAL_DELIVERY_LOCKED=true`, 실제 웹 시작점에 Sender/Scheduler 미연결. **실메일 0건**, Production 미수정. 기존 관리자 메일 설정 템플릿과 ON/OFF 사용.
- 신규 `mail-admin-event-bridge.mjs` 외 관리자 UI·Clerk 인증 설정 변경 없음.
- 이미 존재하는 P1-04 시험용 `rental_submitted/queued` 1건은 보존. 토글 OFF가 행을 즉시 삭제한다는 뜻이 아니며, 후속 P1-06 운영관리에서 기존 보류 건 취소·처리 이력 정책 확정 필요. 별도 승인 없는 DELETE 금지.
- P1-04의 날짜 기반 사용자 2종(반납 사전 알림·연체)은 **후속 P1-06 미구현**. P1-05 성공만으로 사용자 17종 최종 완료를 주장하지 않음.
- 시험은 로컬 Node.js Mock·실제 업무 repository 호출에 대한 가짜 PostgreSQL 트랜잭션으로 수행. Staging 실DB의 관리자 수신 경로와 동시 요청 수신 테스트, 클러스터 트랜잭션 모니터링 및 메일 실제 전송은 아직 미실시.
- 이번 구현은 우편 발송 서비스 장애 시 관리자가 ON한 유형에 대해 가입·대여 신청 업무도 ROLLBACK하는 정책. 오류 격리/비동기 재시도 UX는 후속 의사결정 필요.

## 검증
- `npm run server:phase34:p1-05-admin-events:smoke`: 2종 카탈로그, 정규화, dedupe, OFF, 수신자 필터, 예외, 원자성·실패 ROLLBACK, 자동가입/관리자 직접가입 제외, Clerk 롤백 보상, 송신 하드잠금.
- `npm run verify:phase34`: 기존 전체 회귀검증 포함.
- Staging 배포 후 `git`/Vite/Heroku 건강도, 신규 Migration 부재, 관리자 2종 토글 ON/OFF·업무 이벤트 결과/Outbox 증가 여부를 확인. 테스트는 최고관리자 통제·허가된 Staging 계정만 이용.
