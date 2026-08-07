# GitHub Education Phase 6 - Firebase Identity Bridge Report

## Baseline

Phase 6 was built only from:

`rental-system-github-education-phase5-clerk-postgres-identity-20260807_deployment_package.zip`

The existing production Firebase application, Firestore data, rules, `gh-pages`, and `notebook.recruit.kro.kr` publishing path remain unchanged.

## Objective

Create a cryptographically verified one-to-one bridge between:

1. the Clerk Development user,
2. the PostgreSQL `app_user_identities` internal user,
3. the legacy Firebase Authentication UID that currently keys the existing member account domain.

Phase 6 does not migrate Firestore user documents. It establishes the stable legacy UID link needed before later member-domain migration work.

## Backend changes

### Firebase ID token verification

`server/src/firebase/firebase-id-token.mjs` verifies Firebase ID tokens using Node.js built-in `crypto` without a Firebase Admin SDK/service-account dependency.

Validation includes:
- RS256 algorithm
- signing-key `kid`
- Google Firebase signing certificate lookup/cache
- signature verification
- `exp`
- `iat`
- `auth_time`
- `aud == FIREBASE_PROJECT_ID`
- `iss == https://securetoken.google.com/<projectId>`
- non-empty `sub`, which becomes the verified Firebase UID

Google signing keys are cached according to the certificate response `Cache-Control` `max-age`. An unknown `kid` triggers one forced certificate refresh before rejection.

### PostgreSQL bridge

Migration `003_phase6_firebase_identity_bridge.sql` adds `app_user_firebase_links`.

Invariants:
- `app_user_id` is the primary key and references `app_user_identities(id)`.
- `firebase_uid` is unique.
- one Clerk/Postgres identity cannot be silently switched to another Firebase UID.
- one Firebase UID cannot be attached to two Clerk/Postgres users.
- the normalized Clerk/Postgres primary email must equal the normalized Firebase token email before first link/update.

### API

- `GET /api/users/me/legacy/firebase`: read current Firebase bridge.
- `POST /api/users/me/legacy/firebase`: link/refresh current Firebase bridge.

POST requires:
- normal Clerk token in `Authorization: Bearer ...`
- Firebase ID token in `X-Firebase-Authorization: Bearer ...`

CORS explicitly permits `X-Firebase-Authorization` only for already allowed frontend origins.

## Frontend changes

The existing `?clerkTest=1` diagnostics panel is extended to Phase 6. It observes the existing Firebase Auth session and adds:
- Firebase signed-in state
- current Firebase UID
- linked Firebase UID
- legacy Firebase email/verification/provider
- `Firebase 계정 연결`
- `Firebase 연결 조회`

The panel obtains the token with the existing Firebase Auth user and does not persist or display the raw token.

## External configuration

Required new Heroku Config Var:

`FIREBASE_PROJECT_ID=laptop-system-mk`

Optional:

`FIREBASE_CERT_TIMEOUT_MS=8000`

No new Vercel variables, Clerk settings, Firebase service-account keys, or npm packages are required.

## Deferred scope

Phase 6 deliberately does not:
- read/migrate `userAccounts` Firestore documents on the backend,
- assign admin/member roles in PostgreSQL,
- replace Firebase authorization,
- migrate rental requests/assets/restrictions,
- modify Firestore rules,
- publish to production.
