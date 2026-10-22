# Phase 34 P1-01 — 이메일 발송 인프라 1차 개발 사양 · 수용검증

작성일: 2026-10-22 (Asia/Seoul)

## 범위와 기존 정책
- 기준본: W05 빈 폴더 오탐 핫픽스 Full ZIP, staging commit `a384925e0ed4edbd1da4cb5f3c29d5833877407a`.
- Phase 34 개정 v2 P1-01 = 무료 발송 업체 검토 + 발신 도메인 인증 준비. 원래 P1-01~08 명칭/순서, 업무 메일 11종 유지.
- 기존 Heroku web dyno + 단일 PostgreSQL 외 별도 worker/dyno/DB/storage/add-on 유료 전환 금지.
- 이 후보 패키지에 **실메일 발송, 업무 이벤트 연동, Outbox 테이블, Migration, 관리자 발송 UI를 추가하지 않음**. 각각 P1-02~P1-08.

## 1. 공급자 1차 비교 — 공식 출처, 2026-10-22 조회

| 공급자 | Free | 한도·특징 | 검증 제한 |
| --- | --- | --- | --- |
| Resend | $0 | 3,000통/월, 100통/일, 3 verified domains(2026-08-25 개정), REST API, Idempotency-Key, Free 1 webhook endpoint | 사용자 계정 자격/DNS/실메일 미확인. 발송 초과 시 유료 결제/overages OFF 확인 필수 |
| Brevo | $0 | 300통/일, 트랜잭션 메일 가능, 카드 없이 Free 시작, 무료 브랜드 문구 | 300통 이후 최대 1,000통 retry queue로 대기될 수 있음. 세부 API·계정 승인 확인 필요 |
| GitHub Education Testmail | Education 혜택 | 메일 주소/수신함 자동화 테스트 | 실제 업무 발송 provider 아님 |

- 우선 *개발 어댑터*는 Resend. 최종 사업자 D01은 사용자 승인 전 미확정. 추후 별도 Brevo 어댑터 구현 가능.
- 출처: https://resend.com/pricing ; https://resend.com/changelog/three-domains-on-the-free-tier ; https://resend.com/changelog/idempotency-keys ; https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans ; https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan ; https://education.github.com/pack/

## 2. 구현
- `server/src/mail/mail-provider-config.mjs`: 서버 환경변수 구조, default OFF, free ceiling(100/day, 3,000/month), staging 수신 whitelist, 송신자 유효성 검증, provider key 존재 여부만 표시하는 readiness 요약.
- `server/src/mail/resend-provider.mjs`: 고정 `https://api.resend.com` API origin; `GET /domains/:id` domain readiness 확인; 실제 응답 도메인명과 발신 주소 도메인 일치 확인; 429/5xx/네트워크 일시 오류 분류; 공급자 응답의 credential/body 미노출.
- P1-01 하드 게이트: `liveSendingReady=false`로 고정, `send()`는 항상 `outbox_and_quota_ledger_not_ready`를 반환. `MAIL_ENABLED=true`를 강제로 설정해도 실발송 금지. 예약된 코드 경로는 Outbox + quota ledger 구현·검증 후 P1-02/03에서 별도 검토한다.
- `tools/ops/check-phase34-p1-mail-readiness.mjs`: 기본 실행 시 네트워크 없이 설정 유무 출력. 명시적 `--check-domain`에서만 Resend 읽기 전용 API 호출. 도메인 조회 권한이 부여된 키가 없으면 확인하지 않음.
- `tools/backend/smoke-phase34-p1-01-mail-infrastructure.mjs`: Mock API로 보안·실발송 잠금·상태 분류를 검사.
- 공식 `npm run verify:phase34` 끝에 P1-01 검증 추가. No runtime wiring, no migration.

## 3. 필수 보안 계약
- Staging 실메일: Outbox/발송량 영속 회계 도입 전 **무조건 0통**.
- Provider ID·이메일 제목/본문·요금 청구 계획 등을 비밀 로그에 남기지 않음.
- 발신 도메인 검증: Resend 대시보드에서 DNS SPF, DKIM 등 공급자 발급 *실제 값*으로 구성, DMARC 정책은 현재 소유 DNS에 맞춰 선택. DNS 값을 예제로 만들어 입력하지 않음.
- 공급자 free 한도 초과 시 자동 유료 전환 금지; 계획 단계의 100/3,000 ceilings는 *발송 차단*만 보장. P1-02에서 DB 영속 quota reservation 및 P1-03에서 fail-closed enforcement 구현 필요.
- P1-03 연체 정기 검사: 기존 web dyno 내 타이머 실행 가능하지만 restart/idle/missed tick 위험, 새 dyno 없이 확실한 정시 실행/전송 불가능. last-run/audit, catchup, PG lease, 중복 방지 및 지연 허용 수용 정책 선행.
- Resend 멱등성 24시간만 보장; PG에는 더 긴 이벤트 고유키·발송 상태 보존이 필요.

## 4. 수용 게이트
| AC | 요구 | 이번 상태 |
| --- | --- | --- |
| P1-01-A | 무료 제공자 조건 비교와 후보 선정 | 완료(Resend 후보, 최종 D01 미확정) |
| P1-01-B | 코드 모듈 · zero-cost default-off | Mock PASS |
| P1-01-C | 실메일 누출·allowlist·domain fail-closed | Mock PASS, 실제 키 없음 |
| P1-01-D | 도메인 소유 확인·DNS SPF/DKIM/DMARC | 미실시(사용자 DNS 미선택) |
| P1-01-E | 실서비스 계정·API 키·발신주소 | 미실시(사용자 운영 준비 필요) |
| P1-01-F | Staging E2E 실제 테스트 수신 | 금지 유지 / P1-03 이후 검증 |

**판정:** P1-01 1차 소스 개발·자동검증은 완료 가능. 전체 P1-01 외부 서비스 운영 수용은 **미완료**. Production/Web API 배포·실발송·요금 발생 실행하지 않음.

## 5. 정책 결정/추가 메일 후보
- D01 Resend 또는 Brevo / D02 DNS 편집 가능한 발송용 도메인 / D03 관리자 수신권한 / D04 자동승인 1통 / D05 거절 표준문구 / D06 연체 주기 / D07 다건 통합 / D08 추가 통지 / D09 탈퇴·거절 수신 스냅샷 / D10 무료 한도 초과시 안전 차단.
- 11종은 unchanged; 확대 후보: 반납 예정 사전 알림, 대여 연장 결과, 문의 답변·추가답변, 계정 차단/해제, 반납 요청 접수, 대여 취소, 승인 보류/보완, 가입 서류 보완, 관리자 연체 알림, 강제 계정 종료. 별도 승인 전 이벤트 등록 금지.

## 6. 테스트 명령
```
npm run server:phase34:p1-01-mail:smoke
npm run ops:phase34:p1-01-mail:readiness
npm run verify:phase34
```
읽기 전용 DNS/API 확인은 `npm run ops:phase34:p1-01-mail:readiness -- --check-domain` (키와 domain ID 설정, DNS 소유 인증 전에는 실행 불필요).
