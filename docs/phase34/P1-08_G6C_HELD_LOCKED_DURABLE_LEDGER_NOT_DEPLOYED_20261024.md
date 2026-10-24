# Phase 34 P1-08 G6-C 영속 검토 예약 원장 — 미배포 코드 개발 사양 (2026-10-24)

## 현재 운영 기준

- Staging 최신 수용: Heroku `v329` Current, G6 사전점검 플래그 OFF, `MAIL_ENABLED=false` 확인.
- Vercel·Staging 소스 안정 기준: `3bb8c7f`.
- G6-B: 서버 발신자/API 키 존재/시험 수신자 1명/합성 계약 준비됨. 이는 Brevo 제어판의 독립 검증이나 실제 키 인증에 대한 증빙이 아님.
- G5와 G6 읽기 전용 기능은 OFF. Production 및 Resend 실행 경로 변경 금지.

## 이번 패키지의 추가 구현

- `server/src/mail/mail-p108-g6c-durable-review-ledger.mjs`: Staging 최고관리자의 Clerk RS256 JWT, 서명된 azp, PostgreSQL owner 권한 및 5분 미만 재인증을 기존 G5 모듈로 검증하는 영속 검토 원장 서비스.
- 허용 수신자는 서버 설정에서만 읽고 정확히 1명 요구. 실제 `MAIL_ENABLED=false`를 강제하며 합성 D06-D2A 사양에는 API 키를 전달하지 않음.
- 단일 PostgreSQL 트랜잭션(전역 advisory lock, `INSERT ON CONFLICT DO NOTHING`, 고유 approval_digest/reauth_digest)을 통한 `held_locked` 예약·감사 삽입 계약.
- 같은 트랜잭션에서 Outbox ID 5 (`queued`, `attempt_count=0`, lease/provider ID NULL), 기존 delivery_attempts 0건, 가장 최근 preflight `reviewed_locked` 확인.
- 독립적인 **서버 소유 증빙 콜백**이 준비되지 않으면 실패. 클라이언트가 전달하는 동의 표시를 증빙으로 사용하지 않음.
- 절대로 공급자 요청, 실메일, 재시도, Resend 우회, Outbox 변경을 수행하지 않음.

## 범위의 명시적 한계

1. 새 모듈은 앱의 서버 `index.mjs`, `app.mjs` 및 관리자 UI에 **연결하지 않았음**. 현재 서버에 호출할 API가 없음.
2. `docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql`은 **초안**으로 남아 있고 `server/migrations`에 **추가하지 않았음**. Staging에 적용되지 않음.
3. 검증은 서명 JWT/권한 서비스 테스트 이중화 및 SQL 모의 트랜잭션 기반이며, 실제 PostgreSQL 18에 DDL 적용·경합·권한 및 롤백 수용검증까지 완료됐다는 의미가 아님.
4. Brevo 콘솔 인증/키 유효성 검증, 독립 증빙 서비스, 공급자 1회 실행 허가, 실제 Brevo HTTP 호출은 **구현·실행하지 않았음**.
5. G6-C 원장의 `held_locked`는 법적·기술적 발송 승인 상태가 아닌 **검토 기록**일 뿐임.
6. 스키마 적용은 기존 Essential-0 단일 DB 내에서만 계획하며, DBA 검토·로컬 PostgreSQL 검증·별도 명시적 승격 승인 전에는 적용 금지.

## 안전성 검증

```powershell
npm run server:phase34:g6c-held-ledger:smoke
npm run server:phase34:g6c-offline-review:smoke
npm run server:phase34:g6-sandbox-readiness:smoke
npm run server:phase34:p1-08-d06d2a:smoke
npm run server:check
npm run build:staging
```

## 다음 수용 조건

- G6-C 050 스키마 DDL의 컬럼 제약·권한·불변 감사 트리거 코드 리뷰.
- 기존 로컬 PostgreSQL 18 격리 DB에서 DDL 적용 및 동시성 실제 검증(서비스 운영 DB에는 적용 금지).
- 재사용 방지, timeout/불명확 응답 quarantine, DB 오류 fail-closed, 재인증 유효기간, 감사 증빙 절차 재검증.
- 별도 승인 후에만 Staging 기존 DB 마이그레이션 검토 및 별도 격리된 실행 API 개발.
- 실제 Sandbox 발송은 **더 이후** 별도 승인. `MAIL_ENABLED=false`, Outbox ID 5 예약 금지·실메일 0건 유지.
