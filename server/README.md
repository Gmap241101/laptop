# Rental API - Phase 6 Clerk/PostgreSQL/Firebase identity bridge

이 폴더는 기존 React/Firebase 운영 기능과 분리된 Node.js + PostgreSQL backend다.
Phase 6에서도 기존 Firebase 업무 기능은 그대로 유지한다. 새 backend는 Clerk identity를 PostgreSQL에 유지하고, 현재 로그인한 Firebase Authentication 계정을 서버에서 검증해 동일 사용자와 1:1로 연결한다.

## Runtime

- Node.js 22.x
- npm 10.x
- `pg` 8.22.0
- Heroku Postgres `DATABASE_URL`
- Clerk RS256 JWT public-key verification (Node.js built-in `crypto`)

## Endpoints

- `GET /` - 서비스 식별
- `GET /health/live` - 프로세스 liveness, DB를 조회하지 않음
- `GET /health` - PostgreSQL `SELECT`를 포함한 readiness
- `GET /health/ready` - `/health`와 동일
- `GET /api/auth/session` - `Authorization: Bearer <Clerk session token>`을 검증하는 보호 endpoint

`/api/auth/session`은 토큰 자체나 Clerk secret을 응답하지 않는다. 성공 시 `sub`, `sid`, `azp`, 시간 claim 중 진단에 필요한 값만 반환한다.

## Clerk configuration

Staging/production에서는 다음 값이 필수다.

- `CLERK_JWT_KEY`: Clerk Dashboard API Keys 페이지의 JWT public key (PEM)
- `CLERK_AUTHORIZED_PARTIES`: 토큰 `azp` claim으로 허용할 정확한 frontend origin
- `CLERK_CLOCK_SKEW_SECONDS`: 기본 5초
- `CLERK_REJECT_PENDING_SESSION`: 기본 true

Phase 3은 Clerk의 공식 수동 JWT 검증 절차에 맞춰 RS256 signature, `exp`, `nbf`, `azp`를 검증한다. `sts=pending` session도 기본 거부한다.

## Local configuration

`docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt`를 참고해 로컬/Heroku 값을 설정한다. 배포 패키지에는 `.env*` 파일을 포함하지 않으며 실제 `.env`도 Git에 커밋하지 않는다.

```bash
npm --prefix server ci
node --env-file=.env server/src/index.mjs
```

## Heroku

루트 `Procfile` 순서는 Phase 2와 동일하다.

1. Release phase: `npm --prefix server run db:migrate`
2. Web: `npm --prefix server start`

Heroku 배포 전 `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`가 모두 설정돼 있어야 한다.

## Phase 5: Clerk user identity persistence

Phase 5 keeps Firebase authorization and all rental data flows unchanged, but adds a parallel PostgreSQL identity table for the authenticated Clerk user.

Endpoints:
- `GET /api/users/me`: returns the existing PostgreSQL identity for the authenticated Clerk user, or `404 profile_not_synced` before first sync.
- `POST /api/users/me/sync`: verifies the Clerk session, fetches that exact user from Clerk Backend API using server-only `CLERK_SECRET_KEY`, then upserts the trusted profile into `app_user_identities` by unique `clerk_user_id`.

The browser never supplies email/name fields for persistence. `CLERK_SECRET_KEY` must remain a Heroku-only secret and must never be prefixed with `VITE_`.

Migration `002_phase5_clerk_user_identity.sql` creates `app_user_identities`. Phase 5 deliberately does not create roles or replace Firebase authorization.


## Phase 6: legacy Firebase identity bridge

Phase 6 adds a transition-only proof bridge between the new Clerk/PostgreSQL identity and the existing Firebase Authentication account.

Endpoints:
- `GET /api/users/me/legacy/firebase`: reads the Firebase account already linked to the authenticated Clerk/PostgreSQL user.
- `POST /api/users/me/legacy/firebase`: requires both the normal Clerk `Authorization` bearer token and `X-Firebase-Authorization: Bearer <Firebase ID token>`.

The backend does not trust a browser-supplied Firebase UID. It verifies the Firebase ID token as RS256, checks the Google signing key `kid`, `exp`, `iat`, `auth_time`, project `aud`, and `iss`, then uses the verified `sub` claim as the Firebase UID. Signing keys are cached according to the Google certificate endpoint `Cache-Control` max-age.

Migration `003_phase6_firebase_identity_bridge.sql` creates `app_user_firebase_links` with both `app_user_id` and `firebase_uid` uniqueness so neither side can be linked to multiple identities. The existing PostgreSQL/Clerk email and verified Firebase-token email must match before a new link is accepted.

Heroku Phase 6 configuration adds:
- `FIREBASE_PROJECT_ID=laptop-system-mk`
- `FIREBASE_CERT_TIMEOUT_MS=8000` is optional; 8000 ms is the default.

No Firebase service-account private key is required for Phase 6. Existing Firebase Auth, Firestore rules, rental flows, and production authorization remain authoritative and unchanged.
