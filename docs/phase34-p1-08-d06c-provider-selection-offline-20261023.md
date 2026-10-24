# Phase 34 P1-08 D06-C 공급자 선정·도메인 인증 준비 (2026-10-23)

## 0. 현재 판정 및 기준선

- 승인된 소스 기준선: Git `a73195e3f72d2b3c209a65445a7f74869f77f5db`, Heroku Staging `v299`, Migration `049`, 사전 백업 `b015`.
- **D06-A~B 최고관리자 기능 6/6 PASS, DB reviewed_locked 검토 이력 ID 1**, 서비스/DB health OK, Outbox ID 5 `admin_signup_pending` queued 불변.
- D06-A~B **기존 업무 8영역 v299 회귀검증은 아직 사용자 결과 없음**. 이 항목 없이 전체 단계 CLOSED라고 보고하지 않는다.
- 본 변경은 D06-C **오프라인 선정 준비 도구와 문서만 추가**한다. 공급자 선정, 계정 생성, DNS 레코드 추가/교체, API 키 등록, 외부 발송 및 Production 변경은 하지 않는다.

## 1. 공식 무료 플랜 비교 (2026-10-23 확인)

| 비교 | Brevo Free | Resend Free |
| --- | --- | --- |
| 기본 비용 | $0, 신용카드 없이 시작 가능(공식) | $0 |
| 일일 송신 허용량 | 300통 | 100통 |
| 월 총량 | 별도 월 발송 제공량 없음(일 300 한도) | 3,000통 |
| 앱 내부 월 안전 상한 | 9,300통(내부 가정값: 공급자가 보장하는 월 제공량 아님) | 3,000통 |
| 거래성 알림 | 지원 | 지원 |
| 커스텀 발신 도메인 | 도메인 인증 필요 | 무료 3개 도메인 |
| 무료 계정 제약 | Brevo 로고 표시; 초과 시 최대 1,000건 벤더측 대기열 생성 가능 | 무료 월·일 상한, 데이터 보관 30일 등 |
| 현재 앱 공급자 계약 | Brevo POST 계약 / Mock 검증 완료 | Resend 공급자 / Mock 검증 완료 |

**잠정 권장:** Brevo Free. 19종 트랜잭션 알림, 약 30대 대여 자산 규모, 추가 비용 금지 기준에서 하루 발송 여유가 Resend보다 크다. 단, 실제 발송량 예측이 아니라 기능·용량 비교에 따른 잠정 추천이다. 공급자 최종 선택은 최고관리자가 별도 확정한다. Brevo의 벤더측 초과 대기열 때문에 향후 실발송에서는 **애플리케이션이 벤더 한도에 도달하기 전에 엄격히 차단**해야 한다. 9,300통은 월 무료 쿼터가 아니다.

공식 출처:
- Brevo Free: https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans
- Brevo Free limits: https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- Brevo 도메인 인증: https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC
- Resend pricing: https://resend.com/pricing
- Resend 2026 DNS 확인 절차: https://resend.com/changelog/domain-verification-events

## 2. 도메인 정책과 충돌 방지

- `notebook.recruit.kro.kr`은 기존 서비스 호스트명이며 *발신 메일 도메인 소유·DNS 변경권한이 증명된 것은 아니다*. 기존 Clerk 인증과 운영 DNS도 공유될 수 있다.
- 실발송 주소 예시 `no-reply@notebook.recruit.kro.kr`은 **예시일 뿐 확정값이 아니다**. 조직이 소유하며 DNS를 편집할 수 있는 도메인을 먼저 확정한다.
- DNS 반영 전 현재 TXT/SPF, DKIM CNAME/TXT, DMARC, MX, Clerk 관련 레코드를 백업·목록화한다.
- SPF TXT 중복 생성, DMARC TXT 중복, 기존 DKIM selector 이름 충돌, 메일 수신 MX 덮어쓰기, NS 위임 변경을 금지한다.
- **Brevo**: 공급자 UI에 표시되는 DNS 소유권 레코드, DKIM, DMARC 요구값만 검토하고, 공식 문서상 일반 도메인 인증에는 SPF/MX가 필수 사항은 아니다. 다만 공급자 UI의 현행 요구값이 최종 기준이며 기존 DMARC 레코드는 자동 교체하면 안 된다.
- **Resend**: 도메인에 따라 DKIM·SPF 등 송신 인증 레코드가 필요하며 수신 기능의 MX 요구사항과 혼동하지 않는다. 공급자 UI에서 **sending verification** 완료를 확인해야 한다.
- DNS 설정은 **공급자 계정에서 발급된 해당 도메인용 고유값**을 사용자와 협의하여 적용한다. 예시/추측 TXT/CNAME 값은 절대 배포하지 않는다.
- 발신 도메인 신원은 `MAIL_DOMAIN_VERIFIED=true` 주장만으로 확인할 수 없다. 공급자 API 대조 + 실제 DNS 값 및 발신 도메인 일치를 독립 확인해야 한다. 실제 도메인 상태를 확인하지 않았으므로 본 단계 결과는 항상 `domainVerified=false`이다.

## 3. D06-C 오프라인 검사 도구

명령어(프로젝트 루트 기준):

```powershell
npm run server:phase34:p1-08-d06c:smoke
npm run mail:d06c:plan
npm run mail:d06c:plan -- --provider brevo
# 조직의 도메인 사용 권한 확인 전까지 --sender-domain은 넣지 않아도 됨
# 도메인 선택 후보를 비교만 할 때:
npm run mail:d06c:plan -- --provider brevo --sender-domain example.com
```

- 검사 도구는 기존 코드의 **P103 / P108 / D06 3중 하드 잠금과 P101 liveSendingReady=false**를 읽기만 해 확인한다.
- 도구가 출력하는 `senderDomainCandidate`는 입력값의 문법 확인일 뿐 실제 DNS·소유권 인증이 아니다.
- API 키, Heroku config, DNS 질의, 송신 API, PostgreSQL, 사용자 메일 데이터를 **접근하지 않는다**.
- 출력 `canSend=false`, `liveSendingReady=false`, `accountVerified=false`, `domainVerified=false`는 고정. 공급자·발신 도메인 후보가 선택돼도 잠금이 해제되지 않는다.
- 실제 코드 변경 범위는 `tools/ops` + `tools/backend` + `package.json` + 본 문서. **서버/프런트 런타임, DB Migration 변경 없음**.

## 4. 계정·DNS 단계 이전에 필요한 사용자 의사결정

1. 공급자 **Brevo Free(권장) / Resend Free** 중 한 곳의 최종 선정.
2. 조직이 소유하며 DNS 레코드 변경권한을 가진 **발신 도메인** 확정. 기존 서비스·Clerk 레코드 충돌 점검 후 변경안 승인.
3. 무료 계정 개설 승인. 계정은 사용자가 직접 만든다. API 키는 파일/채팅/소스/프런트에 제공하거나 저장하지 않는다.
4. 공급자 UI에서 발급한 DNS 레코드 값 확인 후, 기존 레코드를 보존하는 세부 변경안 승인.
5. 도메인 인증 완료 확인 후에도 **발송 하드 잠금은 유지**. 별도의 D06-D 보안검증·제한적 실발송 승인 없이는 절대 외부 발송을 시작하지 않는다.

## 5. 운영 차단 / 구간 인수

- Outbox ID 5는 `admin_signup_pending / queued`로 유지되는 것이 현재 정상이며, 실발송 전에 수신자·생성 시각·비즈니스 처리 완료 여부를 재확인하고 필요시 기존 관리자 UI에서 별도 취소한다. SQL 직접 DELETE/UPDATE 금지.
- 기존 Worker, Add-on, 별도 DB, 스토리지, 유료 요금제 추가 불가. 단일 PostgreSQL + 기존 web dyno.
- 이번 ZIP은 선택을 준비하기 위한 오프라인 코드만 포함하므로 **D06-C 외부 계정·DNS 완료로 판정하지 않는다**. 브랜치/Heroku Staging 배포는 필요하지 않으며, 다음 승인 기준선은 여전히 `a73195e` / `v299` / Migration `049`이다.
- v299 기존 8개 업무 영역 회귀검증 결과를 받아야 D06-A~B 전체 `CLOSED` 처리할 수 있다.
