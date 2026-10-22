# Phase 34 P1-04 — 사용자 17종 알림 이벤트와 PostgreSQL Outbox 연계

기준: P1-03 최종 Staging 커밋 `559999b7d9fccf9846e6d7ad9e9a78cd3dec9019` (2026-10-22). 사용자 확인: P1-03 기존 업무 8/8 PASS, `b006` 다운로드 SHA-256 `F921A9846BBE3FF34307CC832E4CEE59F1989DDBE7F2E49D820F172E638F6FBD`, `pg_restore --list` 및 전체 읽기 PASS. 백업의 실제 DB 복원은 수행하지 않음.

## 범위·코드 설계
- 기존 P1-01~P1-03 구조 유지. `server/src/mail/mail-user-event-bridge.mjs`는 실제 발송 API 또는 새 Worker를 생성하지 않음.
- 17개 사용자 메일 종류의 19개 전체 카탈로그 보존. **15개 상태 전환 알림**에 대해 기존 PostgreSQL `BEGIN` ~ `COMMIT` 사이에서 `enqueueUserMail()` 호출. 선택 ON일 때만 `app_mail_outbox`에 저장, OFF일 때 미등록. 기존 dedupe key는 이벤트명 + 고유 이벤트 ID + 수신 이메일의 SHA-256.
- **날짜 조건 알림 2개**(`rental_due_reminder`, `rental_overdue`): `status='대여중'`인 대여만 대상으로 한 조회·후보 식별기를 추가. 예정일 1일 전 및 이미 연체 상태의 날짜별 키를 구분. 배치 스케줄러/폴링/실행 API/발송은 **미연결**, 운영 정책·큐 중복/지연 전송 취소 검증 후 별도 개발해야 함.
- 템플릿 값은 실제 변경 전후 데이터에서 선택하며 모든 허용 변수를 문자열로 제공. 없는 선택 변수는 빈 문자열이고 거짓 날짜를 만들지 않음. 발신 사이트 링크는 안전한 HTTPS 설정 `MAIL_PUBLIC_SITE_URL` 또는 Staging 기본 웹 주소 사용.
- Signup의 관리자 직접 생성은 가입 신청 알림 제외(`signupOrigin='admin'`). 일반 가입 후 Clerk 연결 실패로 PostgreSQL 가입이 롤백되는 경우 아직 queued 상태인 가입 메일 행도 같이 제거.
- `signup_rejected`는 외부 Clerk 계정 삭제가 DB purge 전에 발생하므로, 메일 저장 실패로 계정 삭제 롤백을 유발하지 않게 PostgreSQL savepoint 격리. 이 예외는 가입 거절 메일의 원자적 생성 보장 미완료로 기록.
- 대여 신청, 대여 상태(승인/거절/반납/취소), 본인 취소, 자동 연장, 관리자 수동 연장 승인·거절, 관리자 문의 최초·추가 답변, 가입 승인/거절/탈퇴, 계정 이용 제한/해제를 처리.
- 최고관리자 정책 토글·19종 템플릿 편집·Clerk 인증 메일에는 변경 없음. P1-03 `P103_REAL_DELIVERY_LOCKED===true` 그대로 유지, web dyno에 Sender·스케줄러 비연결. **실메일 전송 0건.**

## 이벤트별 연계 경로

| eventKey | 트리거 | 구현 상태 |
|---|---|---|
| signup_submitted | 일반 회원가입 생성 트랜잭션 | 연결 |
| signup_approved | 최초 자동 승인, 관리자 가입 승인, 재가입 승인 | 연결 |
| signup_rejected | 가입 거절 후 DB purge (Clerk 선삭제 특례) | 연결, savepoint 완화 |
| rental_submitted | 신규 대여 신청, 재시도 재사용 제외 | 연결 |
| rental_approved | 신청·보류·거절에서 대여중 승인 | 연결 |
| rental_rejected | 신청·보류에서 불허 | 연결 |
| rental_returned | 대여중에서 반납 완료, 승인된 사용자 반납 | 연결 |
| rental_overdue | 대여중 & 기한 경과 | 후보 조회만, 미자동화 |
| membership_withdrawn | PostgreSQL 사용자 탈퇴 확정 | 연결, Clerk 삭제 후속 |
| rental_due_reminder | 대여중 & 반납 하루 전 | 후보 조회만, 미자동화 |
| extension_approved | 자동 연장 및 관리자 수동 연장 승인 | 연결 |
| extension_rejected | 관리자 수동 연장 거절 | 연결 |
| inquiry_first_answer | 삭제되지 않은 최초 답변 INSERT | 연결 |
| inquiry_followup_answer | 기존 답변 1개 이상인 추가 답변 INSERT | 연결 |
| account_restricted | 관리자 활성 계정의 blocked 전환 | 연결 |
| account_unrestricted | blocked에서 active 전환 | 연결 |
| rental_cancelled | 신청 사용자 즉시 취소·관리자 사용자취소·관리자 취소 승인 | 연결 |

## 제약·리스크
1. 아직 P1-05 관리자 2종 및 P1-06 발송 이력/보류건 취소/TTL·PII 보존, P1-07 클라이언트별 렌더링, P1-08 실수신 검증 전. `MAIL_ENABLED=true` 설정만으로는 실메일 발송 불가능.
2. 알림 설정 ON 후 기존 업무의 알림 저장에 장애가 나면 대부분 업무 트랜잭션도 ROLLBACK. 외부 Clerk 삭제가 선행되는 가입 거절만 savepoint로 best-effort 처리함. P1-06에서 실패 알림 및 재처리 이력 보강 필요.
3. 가입 거절과 회원 탈퇴의 발송 대기열에는 수신 주소가 남으므로 P1-06에서 보존기간·개인정보 최소화·대기건 취소 정책이 필수.
4. 예약 알림 후보 조회는 여러 항목/대량 페이지·재처리 지연·기한 변경 시 오래된 대기건 취소·동시 실행을 별도로 검증해야 실제 스케줄링 가능. 날짜 기반 2종을 '완료' 처리하지 않음.
5. PostgreSQL 실제 동시 세션 다중 경쟁·엔드투엔드 UI 업무 상태 변경/알림 등록 시험은 아직 검증되지 않음. 자동검증은 Mock 및 소스 경로 검사. 실제 운영 메일 전송은 명시적 승인 이후.
6. 새로운 DB·Worker·Scheduler·스토리지·유료 애드온·Production 변경 없음. **신규 Migration 없음**(최신 045 유지). 사용자의 b006 백업이 사전 보유됨.

## 시험 명령
- `npm run server:phase34:p1-04-user-events:smoke`: 사용자 17종 목록, 15개 실제 연결 경로, 날짜 후보, ON/OFF, 중복, 2개 업무 트랜잭션의 원자성·ROLLBACK, 실발송 잠금.
- `npm run verify:phase34`: Phase 34 회귀검증 전체.
- `npm run build`: 실제 Vite 빌드(검증 환경의 `node_modules` 설치 여부에 따라 운영자 PC에서 실행).
- 신규 코드의 Staging 승격 후 Postgres `app_mail_outbox`에는 기존 데이터가 남을 수 있으므로 무조건 `0` 예상 금지. 실제 시험에는 관리자 UI OFF 확인 후, 허가된 테스트 계정/상태에서만 ON→업무 처리→Outbox 생성 확인→OFF로 원복.

**현재 판정: P1-04 1차 코드·모의 트랜잭션 검증 대상. Staging 수용/날짜 알림 자동화는 미완료.**
