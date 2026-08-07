# GitHub Education 전환 Phase 3 - Clerk 인증 경계 기반

## 기준선

- 이전/새 작업 기준본: `rental-system-github-education-phase2-backend-foundation-20260807_deployment_package.zip`
- 운영 브랜치/도메인: `gh-pages` / `https://notebook.recruit.kro.kr`
- 테스트 소스 브랜치: `gh-pages-3`
- 기존 Firebase Production: 유지

## Phase 3 목적

Phase 2에서 만든 Node.js + PostgreSQL backend에 Clerk session JWT 검증 경계를 추가한다.

이번 단계에서는 기존 React/Firebase 로그인 UI를 Clerk로 교체하지 않는다. 따라서 Production과 현재 Frontend 인증 흐름은 그대로 유지된다. Phase 3의 목표는 다음 단계의 Frontend Clerk 전환 전에 Backend가 Clerk가 발급한 session token을 독립적으로 검증할 수 있도록 만드는 것이다.

## 설계 선택

Clerk 공식 문서는 JavaScript Backend SDK의 `authenticateRequest()` 사용을 우선 권장하지만, 동일 문서에서 공개키를 이용한 수동 JWT 검증도 지원한다.

이번 패키지는 Phase 2의 dependency/lockfile 재현성을 유지하고 실행환경의 npm registry 제약과 분리하기 위해 외부 Clerk backend package를 추가하지 않았다. Node.js 22 built-in `node:crypto`를 이용해 Clerk JWT public key 기반 RS256 verification을 구현한다.

공식 참고:
- https://clerk.com/docs/guides/sessions/manual-jwt-verification
- https://clerk.com/docs/reference/backend/authenticate-request
- https://clerk.com/docs/guides/development/making-requests

## 추가된 인증 모듈

`server/src/auth/clerk-session.mjs`

검증 순서:

1. `Authorization: Bearer <token>` 형식 확인
2. JWT 3-segment 구조 확인
3. header/payload Base64URL decode 및 JSON parsing
4. `alg === RS256` 강제
5. `CLERK_JWT_KEY` PEM public key로 signature 검증
6. `sub`, `sid` 필수 claim 확인
7. `exp` 만료 검증
8. `nbf` not-before 검증
9. `azp`가 있을 경우 `CLERK_AUTHORIZED_PARTIES` exact allow-list 검증
10. 기본값으로 `sts=pending` session 거부

토큰 내용 전체나 JWT 원문은 log/API 응답에 기록하지 않는다.

## 신규 보호 endpoint

### `GET /api/auth/session`

Cross-origin frontend는 다음 header를 사용한다.

```text
Authorization: Bearer <Clerk session token>
```

성공 시 HTTP 200으로 다음 진단 정보만 반환한다.

```json
{
  "authenticated": true,
  "session": {
    "userId": "user_...",
    "sessionId": "sess_...",
    "authorizedParty": "https://staging.example.vercel.app",
    "status": "active",
    "issuedAt": 0,
    "expiresAt": 0
  }
}
```

실제 JWT, signature, public key, DB credential은 반환하지 않는다.

실패 시 HTTP 401과 `WWW-Authenticate: Bearer`를 반환한다. 브라우저에는 내부 검증 실패 원인을 상세 노출하지 않고 server log에 request ID와 안전한 error code만 남긴다.

## CORS와 Clerk authorized party 분리

Phase 3에서는 두 allow-list를 별도로 관리한다.

- `CORS_ALLOWED_ORIGINS`: 브라우저가 Backend 응답을 읽을 수 있는 origin
- `CLERK_AUTHORIZED_PARTIES`: Clerk JWT `azp` claim으로 허용하는 origin

두 값은 Staging에서 같은 고정 Vercel origin을 사용하는 것을 권장하지만, 보안 목적이 다르므로 별도 환경변수로 유지한다.

## 신규/변경 환경 변수

Frontend 예약 값:

- `VITE_CLERK_PUBLISHABLE_KEY`: 다음 Frontend Clerk SDK 연결 단계에서 사용. Phase 3 runtime에서는 아직 사용하지 않음.

Backend 필수 값(Staging/Production):

- `CLERK_JWT_KEY`: Clerk Dashboard API Keys의 JWT public key (PEM)
- `CLERK_AUTHORIZED_PARTIES`: 허용 frontend origin 목록

Backend 선택 값:

- `CLERK_CLOCK_SKEW_SECONDS=5`
- `CLERK_REJECT_PENDING_SESSION=true`

`CLERK_SECRET_KEY`는 Phase 3에서 필요하지 않다. Phase 3는 networkless public-key verification만 수행한다.

## Staging 설정 예

실제 key 값은 문서/소스/GitHub에 넣지 않는다.

```text
APP_ENV=staging
SERVICE_VERSION=phase3
DATABASE_SSL_MODE=require
CORS_ALLOWED_ORIGINS=https://<FIXED_VERCEL_STAGING_ORIGIN>
CLERK_AUTHORIZED_PARTIES=https://<FIXED_VERCEL_STAGING_ORIGIN>
CLERK_JWT_KEY=<Clerk Dashboard JWT public key PEM>
CLERK_CLOCK_SKEW_SECONDS=5
CLERK_REJECT_PENDING_SESSION=true
```

Heroku Config Vars에 `CLERK_JWT_KEY`를 넣을 때 실제 multiline PEM 또는 `\\n` escaped PEM 모두 Backend가 정규화한다.

## Clerk Dashboard에서 필요한 작업

1. GitHub Student Developer Pack의 Clerk Student 혜택을 동일 GitHub Education 계정으로 claim한다.
2. Clerk workspace에서 Staging용 application을 생성한다.
3. API Keys 화면에서 Publishable Key와 JWT public key를 확인한다.
4. `VITE_CLERK_PUBLISHABLE_KEY`는 다음 Frontend 전환 단계의 Vercel Staging 환경변수로 사용한다.
5. JWT public key는 Heroku Staging의 `CLERK_JWT_KEY`로 설정한다.
6. Staging frontend의 고정 origin을 `CLERK_AUTHORIZED_PARTIES`와 `CORS_ALLOWED_ORIGINS`에 동일하게 설정한다.
7. Phase 3 이후 실제 Clerk session token으로 `/api/auth/session`을 호출하여 HTTP 200을 확인한다.

## 기존 인증과의 공존

현재 Frontend는 계속 Firebase Auth를 사용한다.

```text
현재 Frontend
  -> Firebase Auth / Firestore (변경 없음)

새 Backend Phase 3
  -> Clerk JWT verification endpoint (독립 검증)
  -> PostgreSQL health/migration 기반 (Phase 2 유지)
```

따라서 Phase 3 배포만으로 사용자 로그인 화면이나 Production 계정이 바뀌지 않는다.

## DB 영향

Phase 3에서는 신규 PostgreSQL migration을 추가하지 않았다.

기존 Phase 2의:

- `schema_migrations`
- `app_runtime_metadata`

만 유지한다.

Clerk `userId`를 내부 업무 사용자에 연결하는 relational schema는 다음 데이터 모델 전환 단계에서 설계한다. 인증 검증과 사용자 업무 권한을 한 단계에서 동시에 바꾸지 않기 위한 의도적인 분리다.

## 외부 패키지 영향

신규 npm dependency: 없음.

- Frontend dependency: 변경 없음
- Backend dependency: `pg@8.22.0` 그대로
- `@clerk/backend`: 추가하지 않음
- `@clerk/react`: 아직 추가하지 않음

## Production 비변경 영역

- `src/App.jsx`
- `src/firebase.js`
- Firebase Auth 로그인/가입/재설정
- Firestore query/write/transaction/realtime
- Firestore Rules/indexes
- `public/CNAME`
- `vercel.json`
- `gh-pages` Production 발행 정책
- `https://notebook.recruit.kro.kr`
- Production Firebase 데이터

## Phase 3 이후 다음 작업

다음 단계에서는 `gh-pages-3`에 Clerk React SDK를 opt-in으로 연결하고 기존 Firebase Auth UI와 업무 권한 모델을 분리한다. 그 단계에서도 Firestore 데이터 경로를 한 번에 제거하지 않고 로그인/세션 경계부터 순차 전환한다.
