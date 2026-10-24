# Phase 34 P1-08 G6-B/G6-C: 공급자 설정 및 1회 Sandbox 승인 사전검토 (2026-10-24)

## 1. 현재 Staging 기준과 수용 상태
- 수용된 G6-A: Vercel `gh-pages-3` commit `3bb8c7f`; Heroku Staging `v318`; G6 read-only ON `v319`에서 최고관리자 200, 무인증 403/POST 405, 공급자 호출 0건, 실제 메일 발송 0건. 기능 OFF `v320` Current PASS, G6 및 MAIL_ENABLED 미설정.
- 현재 확정 단계 10/13 (76.9%). G6 전체 종료 아님.
- 이번 패키지는 **G6-C OFFLINE REVIEW만 추가**. Brevo network executor, 승인 POST route, 영속 승인 DB, 이메일 전송, 권한 우회 없음.
- 기존 Heroku Staging **단일** PostgreSQL essential-0 + **단일** web dyno. 신규 DB/worker/storage/요금제 없음. Production 승격 없음.

## 2. G6-B: 운영자 설정 정책
1. Brevo의 `mail.notebook.recruit.kro.kr`가 authenticated인지 운영자가 콘솔에서 직접 확인.
2. 발신자 `noreply@mail.notebook.recruit.kro.kr`를 Sender로 등록/사용가능한지 확인. Transactional Email API 활성화 상태 확인.
3. API key를 Brevo 계정에서 발급한 다음 **Heroku Staging Dashboard > Settings > Config Vars**의 `BREVO_API_KEY`에만 입력. 본 채팅/Git/PowerShell 명령 기록에 노출하지 않음. 기존 Resend provider는 제거하지 않음.
4. 실제로 통제하는 **시험용 주소 1개**를 승인한 뒤 `MAIL_STAGING_ALLOWLIST`에 등록. G6 사전점검은 최대 5명까지 허용하지만, G6-C의 단발성 시나리오는 정확히 1명만 허용. 제3자 주소/실제 대여자 주소를 임의 지정하지 않음.
5. Staging `MAIL_PROVIDER=brevo` 및 `MAIL_FROM_ADDRESS=noreply@mail.notebook.recruit.kro.kr` 설정. `MAIL_DOMAIN_VERIFIED=true`는 Brevo 콘솔의 인증 사실을 직접 확인한 다음에만 설정 (서버 자체는 인증을 독립 확인하지 못함).
6. `MAIL_ENABLED`는 미설정 또는 `false`로 유지, `P108_G5_OWNER_READONLY_ENABLED` 및 `P108_G6_SANDBOX_READINESS_ENABLED`는 평소 OFF. `BREVO_API_KEY` 존재·allowlist 개수는 G6 인증 후 화면에서만 확인하며 값은 표시하지 않음.

## 3. G6-C OFFLINE 승인검토 코드
- 새 `server/src/mail/mail-p108-g6c-one-shot-review.mjs`는 미수신자를 차단하고 1명의 서버 allowlist만 허용, 허용하지 않은 승인 ID/커밋/릴리스/백업/Outbox/발신자 독립확인/명시적 1회 승인을 차단하는 **순수 함수의 검토 계약**.
- 소스에 상수 이름으로 특정 Heroku `v299`, `v311`, `v320`을 고정하지 않음. `gitCommit`은 40자리 해시, `releaseVersion`은 릴리스 표현식으로만 검증하고 독립 신뢰판정은 하지 않음.
- 오프라인 계획은 D06-D2A의 합성 payload를 재사용하며 JSON 본문 `headers.X-Sib-Sandbox=drop`, 한 명만 수신, 고객정보/첨부 없음. 공개하는 값은 SHA-256 digest와 차단 코드; 키/수신자/Clerk 계정값을 응답에 포함하지 않음.
- **중요**: 오프라인 operator evidence는 아직 독립 검증된 사실이 아니며 `reviewChecklistComplete=true`도 **실제 승인권이 아님**. `approvedForNetwork=false`, `canReserveNetworkAttempt=false`, `durableIdempotencyImplemented=false`, `canInvokeBrevo=false`를 항상 유지.
- `dispatchG6CNetwork` 및 `approveG6CNetwork`는 항상 403 반환. 실제 네트워크 구현은 없음. 서버 route/index에 import하지 않음.
- 실 1회 보장은 독립 Clerk+PostgreSQL 최고관리자 5분 미만 재인증, 서버에서 독립 조회한 백업·Outbox·Sender 증빙, 승인 의사 표시, 미리 검토된 영속 스키마와 유니크 인덱스, 단일 DB transaction 내 원자적 선점, 실패/불확실 결과의 재시도 금지/격리가 함께 있어야만 성립함.
- `docs/phase34/050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql`은 계속 DRAFT. 정식 Migration 050으로 편입하거나 실행하지 않음. 실행 전 스키마·권한·실패 롤백·복구 검토 및 별도 승인 필요.

## 4. 테스트 및 적용
```
node tools/backend/smoke-phase34-p1-08-g6c-one-shot-offline.mjs
npm run server:phase34:g6c-offline-review:smoke
npm run server:phase34:g6-sandbox-readiness:smoke
npm run server:phase34:p1-08-d06d2a:smoke
npm run server:check
npm run package:guard
npm run build:staging
```
`package:guard`는 ZIP을 새 폴더에 온전히 압축 해제하고 그 폴더에서 실행. `deploy.ps1`은 package-meta 복사하지 않으므로 기존 test_new 내 직실행은 별도 배포 후 검사도구를 사용.

## 5. 독립 서명/네트워크 호출 직전까지 남는 미완료 작업
- Brevo API 키 및 Sender/Transactional API 콘솔 상태 확인 (사용자 작업).
- G6 사전점검 `syntheticPlanReady=true`, 여전히 `canInvokeBrevo=false` 확인.
- DRAFT 050 스키마와 영속 1회 감사 수용, 별도 승인 후 정식 배포.
- 별도 사용자 명시 승인 후 `X-Sib-Sandbox: drop`만 강제하는 단 1회의 Brevo Sandbox HTTP 요청 (실메일은 금지). 201은 API 접수이며 전달 성공이 아님.
- 사용자 수용 전 Production/실메일/Resend fallback/Outbox claim/worker 생성 금지.

공식 계약: https://developers.brevo.com/docs/using-sandbox-mode
