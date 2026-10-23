# Phase 34 P1-08 Gate C — 계정 불필요 이메일 공급자 계약 구현 (오프라인)

기준: 2026-10-23 Staging Git `f6132dead3be9d5a1f1577d494c1ee4a4a58787a`, Heroku v293, Migration 001~048, 백업 b011.

## 변경내용

1. `server/src/mail/brevo-transaction-contract.mjs` 추가: Brevo `POST /v3/smtp/email` JSON 구조 생성, 검증된 1개 수신자, Outbox 발신자명 스냅샷 우선, HTML 우선·텍스트 본문 대체, 파라미터·BCC·첨부 없음. 저장된 `sender_name`이 없으면 환경 발신자명 사용. 검증용 transport는 HTTP 구현을 **명시적으로 주입**해야 하고, 기본 `globalThis.fetch`가 없다.
2. Brevo 결과 분류: `201`과 유효한 `messageId`일 때만 접수됨(`accepted`)으로 해석. 명확한 `429`는 속도제한/안전 재시도 가능. `400/401/403/404/422`는 확정 거부. 타임아웃, 응답 누락, `408`, `409`, `5xx`, 알 수 없는 `2xx`, 깨진 JSON은 결과 불명확(`provider_outcome_uncertain`)이며 **자동 재전송 금지**. 공급자 오류 본문·API 키는 로깅하지 않는다. API 접수는 최종 수신함 도착이 아니다.
3. `server/src/mail/brevo-provider.mjs`의 기존 스텁을 계약 구현 호출로 교체했으나 **두 가지 발송 잠금 모두 유지**: `config.liveSendingReady=false` (P1-01), `P103_REAL_DELIVERY_LOCKED=true` (P1-03). 실제 서버 시작에서 공급자 실행 경로도 미연결.
4. `server/src/mail/resend-provider.mjs`에 P1-03 강제 잠금 추가. 임의로 `liveSendingReady=true`인 객체가 주입되더라도 실전송 차단.
5. Brevo 도메인 조회의 반환 상태를 일관화: 타도메인이 확인된 것으로 표시되더라도 `verified=false, status=not_verified`.
6. `tools/backend/smoke-phase34-p1-08-gate-c-provider-contract.mjs` 추가: 오프라인 메모리 HTTP로 요청·응답·차단·분류를 시험. `package.json` 검증 명령 연결.

## 발송 잠금 상태

| 상태 | 결과 |
|---|---|
| 현재 앱의 실제 발송 | **불가능** (이중 잠금 + 런타임 미연결) |
| 예약 알림 자동 실행 | 기존 기본 OFF 유지 |
| 모의 Brevo POST | 주입한 테스트 함수에서만 실행; 외부 네트워크 호출 0 |
| 실제 Brevo 계정/키/도메인 | 필요 없음, 설정하지 않음 |
| DB 및 Migration | 기존 단일 PostgreSQL, Migration 048 유지; 신규 스키마 없음 |
| Production/Firebase/DNS | 변경 없음 |

## 주의·범위

- Brevo에 *실제 발송을 연결하는 일*은 Gate C 후속 또는 Gate D의 **별도 개발·별도 사용자 승인** 대상이다. 이번 계약 구현 완료 ≠ Live Ready.
- 여전히 실제 송신기에서 Outbox 클레임을 인증된 공급자 실행에 연결하는 승인된 절차, API 키/도메인 인증, 제공자 전체 공유 한도, webhook/반송 및 전달 상태 처리, 계정 생성, 운영 배포 심사가 남아 있다.
- 중복 방지에는 현재 PostgreSQL dedupe·claim 및 결과 불명확 격리가 사용된다. **Brevo 전송 API의 서버 측 멱등성을 가정하지 않는다.**
- Gate C 검증은 `npm run server:phase34:p1-08-gate-c-provider:smoke`, `npm run verify:phase34`.

## 참고 공식 문서 (2026-10-23 확인)

- Brevo API: https://developers.brevo.com/docs/send-a-transactional-email
- Brevo Free: https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
- Resend 가격: https://resend.com/pricing?product=transactional
- Resend 멱등성: https://resend.com/changelog/idempotency-keys
