# Phase 34 P1-06.1 — 안전한 실패 메일 재처리 및 날짜 알림 대상 미리보기

## 기준선
- 사용자 수용 증빙: P1-06 관리자별 수신 설정 owner=t, admin=f; 신규 관리자 대여 알림 `id=4 / owner / queued`; 일반관리자 기존 알림 `id=3 / cancelled / mail_admin_opted_out`.
- 배포 기준 GitHub `1ba35b59f82a04eddfb47caf813439ac1785bbd3`, Heroku Staging `v287`, Migration 046 적용 완료.
- 기존 Heroku 단일 DB 및 기존 web dyno만 사용. Production/Firebase/DNS/Clerk/실메일 전송 변경 금지.

## 개발 범위
1. 최고관리자만 **반납 예정·연체 알림 대상 건수**를 읽기 전용으로 미리 조회할 수 있다. 기준일은 Asia/Seoul이며, 사용자 이메일·이름·대여 식별자는 API 결과에 넣지 않는다. 유형별 ON/OFF 상태도 표시한다. 버튼은 어떤 Outbox 행도 생성하지 않는다.
2. **명확하게 거절된 전송(HTTP 429 반복)**으로만 실패한 건에 한해 최고관리자가 **안전한 수동 재처리**를 요청할 수 있다. `failed` 상태 + `provider_rate_limited` 또는 `mail_attempts_exhausted` + 이전 시도가 전부 `retry`로 남은 건만 허용한다.
3. 200 수신·발송 완료·전송 결과 불명·타임아웃·5xx·예약/연체 알림·유형별 토글 OFF·관리자 개별 수신 OFF는 재처리 대상이 아니다. 시도 기록과 기존 quota는 삭제·환불하지 않는다. 재처리는 Outbox 상태만 `queued`로 돌릴 뿐 실제 이메일을 전송하지 않는다.
4. PostgreSQL `047_phase34_p1_06_mail_retry_operations.sql`은 기존 `app_mail_queue_actions.action` 체크 범위를 `cancel,retry`로 확장한다. **신규 테이블·DB·Worker·스토리지 없음.** 이미 존재하는 감사 테이블에 재처리 이력이 남는다.
5. 기존 발송 내역 UI의 영문 상태값은 사용자가 이해하기 쉬운 한국어로 표시한다.

## 안전성 및 남은 수용 조건
- 송신기는 여전히 소스 `P103_REAL_DELIVERY_LOCKED=true`이며 web 서버 시작 경로에 연결돼 있지 않다.
- `P106_SCHEDULED_ENQUEUE_ENABLED`는 미설정·false가 기본값이며 스케줄러는 켜지 않는다. 명시적 운영 승인과 실제 날짜 경계/동시성 E2E 전까지 변경 금지.
- 자동 재처리 기능 없음. 수동 재처리도 명확히 거절된 429만 허용한다.
- Staging에는 `047` 적용 전 수동 DB 백업을 권장한다. `b007`은 P1-06의 046 이전에 생성되었다.
- 기존 시험용 Outbox `id=1,2,4`에 대한 취소는 기존 관리자 UI에서 **직접 진행**하고 취소 증빙을 제출해야 한다. 개발 패키지 배포만으로 취소하지 않는다.
- 신규 API 및 UI는 실제 Staging 세션, 관리자 권한 403, 브라우저 대상 미리보기, SQL 아카이브 E2E가 남아 있다. mock PASS를 실환경 PASS로 표기하지 않는다.
- P1-05 관리자 가입 승인 요청(`admin_signup_pending`)은 별도 안전한 승인 대기 시험에서 검증해야 한다.
- 기존 업무 8개 영역 회귀검증을 새 배포본에서 다시 제출해야 한다.

## 사용자 Staging 확인
1. SHA-256 확인, git 작업 트리 clean, Staging PG 백업을 새로 생성 후 `Completed` 확인.
2. 기존 `deploy.ps1`: ZIP 직접 선택 2 → Y → Firebase 0 → START → Production N.
3. `git fetch origin`, `git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main`.
4. Release log `047_phase34_p1_06_mail_retry_operations.sql` 적용 확인, web Basic up.
5. `npm run server:phase34:p1-06-safe-operations:smoke` 및 `npm run server:phase34:p1-06-mail-operations:smoke`.
6. 관리자 이메일 알림 관리 > 반납 알림 대상 확인 > 대상 확인. 숫자 및 ON/OFF 표시 확인; 버튼 클릭만으로 `app_mail_outbox` 총건수 불변이어야 한다.
7. 기존 시험용 queued 1,2,4를 관리자 화면에서 각각 취소. 취소 후 해당 3건 `cancelled`, 기존 3번 역시 `cancelled` 유지.
8. P1-06 기능 수용은 이 실환경 검증과 기존 업무 8/8 재확인 후. **실메일·예약 자동등록 활성화 금지**.

## 개발자 테스트
`npm run server:phase34:p1-06-safe-operations:smoke`
`npm run verify:phase34`
`npm run package:guard`
