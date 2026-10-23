# Phase 34 P1-08 D06-A/B: 최고관리자 재인증 기반 발송 전 점검 및 이력 (2026-10-23)

## 고정 기준선
- Git `9ab4e95b2e193c35a7b8db2185e5a07cf5138ba9`, Heroku Staging `v296`, Migration 048, 백업 `b014`. 기존 업무 회귀 8/8 PASS.
- 코드 변경 **Staging 배포 전 단계**. 사용자 별도 검증/승인 전 Production, 외부 이메일 발송, DNS, API 키, 계정, Firebase는 변경하지 않는다.
- 비용 증가/신규 DB·Worker·스토리지·Dyno·Add-on 금지. 기존 PostgreSQL과 기존 web dyno만 사용.

## D06-A: 최고관리자 본인 확인 및 검토 기록
- `GET /api/admin/mail-delivery/preflight`: Clerk RS256 인증을 통과한 **활성 최고관리자(owner)** 전용. PostgreSQL 발송 상태(건수, 대기 ID/이벤트, 오래된 대기 건)와 외부 공급자 등록 여부(불리언만)를 읽기 전용으로 표시. 수신 주소, API 키 원문 미표시.
- `POST /api/admin/mail-delivery/preflight-review`: 활성 owner + 기존 Clerk 이메일 6자리 재인증 + 서명 JWT의 `fva[0] <5`·`reverification_id`·`sid` 검사 + `acknowledge=true` 명시적 동의. 기존 PostgreSQL 내부 신규 Migration 049 `app_mail_preflight_reviews`에 **검토 이력만 기록**. 세션/재인증 ID는 SHA-256 지문으로만 저장. unique 재인증 지문을 사용한 중복 검토 방어. 재사용·오래된 인증·admin 역할은 거부.
- 기록 `reviewed_locked`는 **발송 권한, 예약 실행 허용, API 토큰, 발송 잠금 해제, 향후 자동 승인** 중 어느 것도 아니다. 상태는 영구적으로 `canSend=false, liveSendingReady=false`.
- 이 단계는 기존 Clerk 환경의 재인증 클레임 구성을 재사용한다. 재인증 ID가 실제로 갱신되지 않으면 재사용 거부 정책에 의해 기록이 불가능할 수 있으며, 이 경우 실발송과 무관하게 차후 클레임 구성을 별도 교정해야 한다.

## D06-B: 발송 전 점검과 잔여 대기열 보호
- 기존 Outbox `queued`, `retry`, `processing`, 24시간 이상 대기 건을 조회·분류하며, 오래된 발송 대상을 **자동 발송하거나 자동 취소하지 않는다**.
- 기존 ID 5 `admin_signup_pending`은 현 DB에 그대로 유지. 본인 확인 후에도 자동 발송하거나 삭제하지 않는다. 기존 관리자 '발송 내역 및 대기 메일'의 취소 기능으로만 필요 시 개별 처리한다.
- 공급자 선택, 등록 여부, Staging 허용목록, 환경, 기존 P103/P108 잠금 및 D06 잠금 등 검사. 내부 `MAIL_ENABLED=true`를 설정해도 하드 잠금은 변하지 않음.
- `mail-p108-preflight-control.mjs`에는 외부 HTTP 클라이언트 및 송신 기능이 없고, `dispatch()`는 항상 403 오류. 기존 `P103_REAL_DELIVERY_LOCKED=true`, `P108_REAL_DELIVERY_LOCKED=true`, `P108_D06_LIVE_DELIVERY_LOCKED=true` 유지. 예약 자동 실행은 기존 OFF 정책 유지.
- 서버는 기존 web dyno에 **조회·감사만** 등록하고 `createP108OfflineDispatcher`나 실 공급자를 기동하지 않음.

## 수용기준
1. 활성 owner + 정확한 서명 세션만 조회·검토 기록 가능, 일반 admin/만료·비인증 요청 거부.
2. 최근 확인된 새 Clerk 이메일 코드로 확인한 경우에만 이력 추가. 동일 `reverification_id` 재사용은 PostgreSQL UNIQUE로 거부. 같은 증빙의 SQL 동시성도 UNIQUE로 거부.
3. 대기 메일과 공급자 비밀정보 노출 금지. Outbox 조회 상태의 변경 없음.
4. DB에 불변 검토 이력만 추가; 발송 승인/실발송/유료 리소스 생성 없음.
5. Migration 049 신규 **단일 DB 내 1테이블/1인덱스/변경 방지 트리거 및 함수**, 기존 Migration 001~048 미수정.
6. D06-A/B 단위·Mock 테스트 및 기존 692개 이메일 검증과 Phase 34 전체 테스트 PASS, 배포 후 사용자 Staging 회귀 8/8 PASS.
7. 실제 이메일을 보낼 수 있다는 의미로 '발송 준비 완료'를 표시하지 않음.

## 배포 및 수용 구분
- 신규 Migration 049가 자동으로 적용되는 **백엔드 배포**가 필요하다. 배포 전 기존 Staging DB `heroku pg:backups:capture` 완료 및 ZIP SHA-256 PASS 확인.
- `npm run server:phase34:p1-08-d06ab:smoke` 및 `npm run verify:phase34`를 우선 실행. Frontend Vite 빌드는 별도 사용자 Staging `deploy.ps1`에서 검증.
- 사이트 > 관리자 > 이메일 알림 관리 > **이메일 발송 전 점검**에서 조회 → 본인 확인 코드 발송 → 확인 후 점검 이력 확인. 재인증 성공 결과는 외부 이메일 송신권을 부여하지 않는다.
- 이 패키지 제출 자체가 Staging/Production 배포, 공급자 계정/키/DNS 변경 또는 실발송 승인은 아니다.

## 후속 단계 (별도 승인 필수)
- D06-C: 공급자 비교·선정, 계정 개설 및 DNS 인증
- D06-D: 송신 기능 코드의 엄격한 별도 승인·허용 목록/할당량/보류건 정리 후 극소량 실메일 시험
- D06-E: 운영 승격 심사. 실발송을 위한 독립적 최근 재인증 증명 및 전송 감사·웹훅/반송 보호를 추가 검증해야 함
