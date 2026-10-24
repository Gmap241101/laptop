# Phase 34 P1-08 G6 Brevo Sandbox 사전점검 및 수용 명세 (2026-10-24)

## 1. 개발 범위 / 기준선
- 이전 G5 최종 수용: `gh-pages-3` `c69aa56`, Heroku Staging `v311` (이후 사용자 검증 중 v311까지), Migration `049`, G5 최종 OFF.
- 기존 Heroku Staging web dyno, 동일 PostgreSQL Essential-0만 이용. 신규 DB/Worker/스토리지/요금 변경 없음.
- 코드 단독 개발 산출물. **본 패키지는 Heroku/Vercel에 배포되지 않았으며 실제 Brevo 요청 및 메일 발송도 수행하지 않았음.**
- G6 read-only API와 관리자 화면을 새로 구현했지만 기본 비활성. 안전한 공급자 계약 D06-D2A 재사용.

## 2. 공식 API 계약
- `POST https://api.brevo.com/v3/smtp/email` (지금은 호출 금지).
- Brevo Sandbox 지정은 **JSON payload 내부** `headers: {"X-Sib-Sandbox":"drop"}`.
- Sandbox 성공은 통상 HTTP 201, messageId. 실제 수신/전달/로그 없음. `201`을 실메일 수신 성공으로 판단하지 않음.
- 출처: https://developers.brevo.com/docs/using-sandbox-mode, https://developers.brevo.com/reference/send-transac-email

## 3. G6 신규 읽기 전용 구현
- 환경 플래그: `P108_G6_SANDBOX_READINESS_ENABLED=true` (기본 OFF).
- GET: `/api/admin/mail-delivery/g6-sandbox-readiness`.
- OFF / production => 404; ON 시 POST/PATCH/DELETE => 405; ON 무인증·권한 없음·최근 재인증 없음 => 403.
- ON 최고관리자 최근 5분 Clerk 재인증 / 정식 서명 JWT / 허용 도메인 azp / PostgreSQL 권한 => 200.
- 반환: 발신 도메인/발신 주소 설정 여부, 계정의 API 키 **존재 여부**, 1~5명 allowlist 개수, 미충족 사유, 명시적 승인 및 공급자 확인 요구.
- 원문 API 키·수신 이메일·Clerk 신원·JWT는 응답에 절대 포함하지 않음.
- `MAIL_DOMAIN_VERIFIED=true`는 관리자가 설정한 상태 선언일 뿐 **Brevo가 실제 발신자 인증을 확인했다는 독립 증빙이 아님**. 독립 확인 전 공급자 요청 금지.
- G6 합성시험 내부에서만 일일 최대 30 / 월 최대 900으로 제한. 기존 `MAIL_FREE_DAILY_LIMIT`·`MAIL_FREE_MONTHLY_LIMIT` 환경값은 **변경하지 않음**. 실발송 한도 권한 아님.
- 사용자 입력으로 sender, allowlist, subject, payload 또는 provider를 교체할 수 없음.
- G6 OFF에서 읽기 전용 버튼의 기능 이용 불가 안내. 관리자 로그인, G6 본인 확인으로 받은 Clerk 6자리 코드를 이용. Clerk 인증 메일은 Brevo 앱 발송과 별개.
- 기존 G5 ON/OFF 기능 플래그와 독립적으로 동작; G5는 계속 OFF 권장.

## 4. 신규 모의시험
- `npm run server:phase34:g6-sandbox-readiness:smoke`
- RS256 JWT 진짜 서명/검증 + PostgreSQL 관리자 권한 가상 계정.
- 적대 출처, 서명 유효하나 pending 세션, factor age 5분, 관리자 일반 계정, disabled owner 차단.
- 서버 설정/수신자 1~5개, API 키/도메인/발신자/일일·월간 한도 정책 검증.
- offline mock 201, 429, 네트워크 예외 등 분류; 무단 mock transport, 허용 외 수신자 차단.
- 앱 발송/Outbox 수정/공급자 요청 = 모두 0건.

## 5. 현장 확인 순서 (Staging only)
1. ZIP SHA-256 확인, 기존 Windows `test_new`에 새 전체 ZIP 적용 전 백업.
2. `npm run package:guard` / `npm run server:phase34:g6-sandbox-readiness:smoke` / `npm run frontend:phase34:signup-modal-g5:smoke` / `npm run build:staging`.
3. `deploy.ps1`로 `gh-pages-3`만 Staging 배포, Production `gh-pages` 발행 **N**. 배포 후 Heroku Staging에 새 Git 커밋 1회 push. Firebase 0.
4. `GET .../g6-sandbox-readiness` 기본 OFF 404; G5 OFF 404; Outbox ID 5 queued/attempt 0.
5. **사전점검만 실행하겠다는 현장 승인 이후** `heroku config:set P108_G6_SANDBOX_READINESS_ENABLED=true -a notebook-rental-api-staging-01`.
6. Heroku Release current 성공 확인 후 무인증 GET=403, POST=405.
7. 최고관리자 `관리 메뉴 > 이메일 알림 관리 > Brevo Sandbox 사전점검 > 본인 확인 후 점검`에서 6자리 입력. GET=200이고 canInvokeBrevo=false 확인. 공급자 설정 미완료이면 blockers가 있어도 정상.
8. 인증 만료 및 일반 권한 접근은 G5 검증 정책을 재사용하므로 무인증/일반 관리자/일반 회원 403에 대한 추가 현장검증은 선택적으로 수용 가능.
9. 종료 시 `heroku config:unset P108_G6_SANDBOX_READINESS_ENABLED -a notebook-rental-api-staging-01`, Release current 완료, GET 404와 Outbox 그대로 확인.

## 6. 별도 승인 필요 항목
- Brevo sender `noreply@mail.notebook.recruit.kro.kr` 가 Brevo 콘솔에서 사용 가능한지와 Transactional API 활성화 상태 확인.
- Heroku에 Brevo API 키 비밀 설정 여부 확인하되 **원문 출력/전송 금지**.
- Sandbox 허용 수신자 **1명** 명시적으로 확정; 실제 발송 이전까지 일반 대여자 사용 금지.
- 이후 **별도 명시적 승인**을 받은 다음에만 승인 증빙·중복실행 방지·감사 지속성 트랜잭션을 제공하는 별도 G6 네트워크 발송 구현/적용.
- 이번 개발에는 `POST` 발송 엔드포인트 없음. `G6_VENDOR_NETWORK_LOCKED=true`, 실제 앱 메일 발송도 하드록.
- Brevo Sandbox 201은 실발송이나 도달을 의미하지 않음. 추후 실메일 단계는 다시 별도 승인.
