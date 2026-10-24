# Phase 34 P1-08 D06-D2B G5-PREP — 서버 신뢰 Clerk 권한 결속 (오프라인)

작성일: 2026-10-24 (KST)
기준 소스: `D06-D2B-G4-LOCAL-SAFE` 전체 ZIP.

## 신규 구현
`server/src/mail/mail-p108-d06d2b-g5-clerk-binding.mjs`는 기존 `createClerkSessionAuthenticator` (RS256 서명/만료/authorized party/pending 세션 판정)와 `adminClerkAuthService.authorizeCurrent` (PostgreSQL 관리자 레지스트리 조회)를 주입받는 **서버 내부 결속 인터페이스**다. 요청 본문에서 전달된 역할, 사용자 ID, 재인증 증빙을 무조건 무시하며 서명 확인된 JWT와 DB 관리자 정보를 조합한다. 최고관리자(`owner`)·active·linked·정확한 Clerk User ID 결속 및 잠금 상태를 확인한다. 기존 `requireMailPreflightReverification` 로직으로 5분 이내 재인증 여부와 재인증 지문을 검사한다.

## 검증 범위
- 실제 서비스와 같은 Node.js RSA-SHA256 서명 검증 함수를 활용하되, 테스트 실행마다 **새로운 합성 RSA 키쌍 및 합성 JWT**만 생성한다. 운영 Clerk 키/계정/DB 접근 없음.
- 변조 JWT, 비정상 알고리즘, 만료·미래 시작 토큰, `azp` 불일치, pending session, 타인 계정, 관리자 미승인·퇴직·잠금·연결 해제, 재인증 누락·만료를 거부한다.
- 외부 API·새 DB·Migration·메일 발송 0건. 기존 Resend 및 Brevo를 둘 다 보존한다.
- `app.mjs`·`index.mjs`·Outbox·Dispatcher에 G5 모듈을 연결하지 않았으므로 사용자의 Staging과 Production 동작은 변경되지 않는다.

## 명령
`npm run server:phase34:p1-08-d06d2b-g5-prep:smoke`
`npm run verify:phase34`

## 남은 G5 수용 조건
실제 Staging 환경에서 **이미 존재하는** 서버의 Clerk JWT 인증과 PostgreSQL `authorizeCurrent` 권한 확인을 통합하고, 최고관리자 실제 재인증, 세션 만료·교체, 사용자/관리자 계정 잠금, 사용자의 권한 박탈, 감사기록을 검증한다. G5 완료라고 표시하려면 이 현장 수용 결과가 별도로 필요하다. 기존 G2 예약 기능 및 실제 메일 발송은 여전히 하드잠금 상태이며, Brevo API 키 등록·Sandbox 네트워크 시험·실메일 시험은 별도 승인 대상이다.

## 주의
합성 토큰 시험의 PASS는 실제 Clerk 운영 JWT나 Staging DB가 올바르게 설정됐음을 증명하지 않는다. 이 오프라인 모듈을 관리자 API에 임의로 연결하지 말 것. `G4-LOCAL` 실제 PostgreSQL 시험도 아직 수행되지 않았다.
