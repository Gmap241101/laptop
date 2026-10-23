# Phase 34 P1-08 D01~D05 — 실발송 잠금 유지 Mock 발송기 통합 (2026-10-23)

## 소스 기준 및 정책

- 기준: GitHub Staging `1742b557eaa28dee098390cc91b9d2d070744ff2`, Heroku Staging `v295` (사용자 검증 8/8 PASS), PostgreSQL Migration `001~048`, 사전 백업 `b012`.
- 절대 제약: 비용 증가·신규 PostgreSQL·Worker·스토리지·애드온·요금제 변경 금지. 기존 Heroku Basic web dyno 및 단일 PostgreSQL만 사용.
- Production/GitHub `gh-pages`, Firebase, DNS, Brevo/Resend 계정, 비밀키, 실제 메일 발송 변경 금지.
- `P103_REAL_DELIVERY_LOCKED=true`와 `config.liveSendingReady=false`를 유지하며 추가 상수 `P108_REAL_DELIVERY_LOCKED=true`를 적용. 서버 시작 파일에 발송기 등록 또는 신규 HTTP 송신 API 없음. 예약 자동 실행 기존 기본 OFF.

## 이번 구현의 실제 범위

| 개발 | 소스 | 결과 |
|---|---|---|
| D01 공급자 연결 계약 | `mail-p108-protected-bridge.mjs` | 기존 P1-03 PostgreSQL claim/quota/attempt/conclude Mock 발송기와 Brevo 공급자 JSON 계약 및 Resend 오프라인 요청 구조를 연결. 연결은 **테스트 전용**, 실발송 불가 |
| D02 승인·수신자 방어 | 동일 | Mock에 한해 소유자 역할·명시적 테스트 동의 표시·Staging 허용목록·발신자·도메인·발송 잠금 검사. 역할 값은 **Mock 테스트 입력일 뿐 실제 Clerk 신원 인증이 아님**. 운영용 관리자 승인 UI/서버 인증은 후속 대상 |
| D03 오류·재시도 | 동일 | 429 안전 재시도, 400/401/403/404/422 확정 거절, 기타 HTTP·네트워크 오류·손상된 응답은 `uncertain`으로 격리, 자동 재발송 금지. 기존 P1-03 상태 기록 재사용 |
| D04 한도·동시성 | P1-03 기존 Repository 사용 | 기존 DB 원자적 claim 및 advisory lock, 24시간/30일 예약량, 만료 lease 격리 유지. 새 자원·스키마 없음. **월 9300 한도는 애플리케이션 보호치이며 Brevo 월 무료 제공량 보증 아님** |
| D05 통합검증 | 새 Smoke 150 checks | 양 공급자, 429/5xx/timeout, 잠금, owner-Mock, allowlist, 할당량, 공급자 ID, 비밀 누출 금지, 임의 prod 요청 거부 등을 시험. 전부 오프라인 |

## 명확한 비구현 범위

- 실제 HTTP 공급자 요청, Brevo/Resend 계정 가입, 도메인/DKIM/SPF/DMARC, API 키 등록, 실메일 발송 또는 실제 발송 테스트 **전부 미실시**.
- 관리자 승인 정책을 실제 Clerk owner 세션 및 재인증과 결합하는 서버 API/운영 UI **미구현**. Mock의 `operatorRole='owner'`는 보안 인증이 아니며 운영 승인에 재사용하면 안 됨.
- 인증된 실발송기가 `createBrevoProvider.send()` / `createResendProvider.send()`를 호출하는 런타임 작업과 공급자 전달/반송 webhook 처리는 **미구현**. Gate D에서 명시적 재승인 후 구현·시험해야 함.
- 실제 PostgreSQL 쿼리/트랜잭션을 실행한 검증은 아니며 이전 단계에서 확인된 DB Repository를 Mock 주입함. Staging 실환경 및 기존 업무 회귀는 배포 후 별도 확인 필요.

## 검증

```powershell
npm run server:phase34:p1-08-d01-d05:smoke
npm run server:phase34:p1-08-gate-c-provider:smoke
npm run server:phase34:p1-08-gate-a:smoke
npm run server:phase34:p1-07-templates:smoke
npm run audit:external-runtime:strict
```

- Gate D 실발송 잠금 해제, 외부 서비스 계정, Production 승격 및 DNS 변경은 각기 별도의 사용자 명시적 승인 필요.
