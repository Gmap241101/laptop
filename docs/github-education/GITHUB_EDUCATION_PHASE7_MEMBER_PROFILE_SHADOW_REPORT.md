# GitHub Education Phase 7 - Firestore Member Profile Read-Only Shadow

Date: 2026-08-07
Baseline: `rental-system-github-education-phase6-firebase-identity-bridge-20260807-fixed_deployment_package.zip`
Baseline archive SHA-256: `31d4e6c1ec1bd4bf4ed99fdc9b0d00d9897a94836f5f2bdb1af91cd2e2e5cd4e`

## Objective

Phase 7 creates a PostgreSQL shadow of the currently linked member's Firestore `userAccounts/{firebase_uid}` document without changing the authoritative production source. The shadow is used to verify that a server/API/PostgreSQL representation can match the existing Firebase member domain before any authorization or rental workflow is migrated.

## Authority boundary

Firestore remains authoritative in Phase 7.

The Heroku backend does not receive Firebase Admin credentials and does not bypass Firestore Security Rules. The browser obtains its existing Firebase Authentication ID token. Heroku first verifies that token as introduced in Phase 6, requires the verified UID to match the existing one-to-one Firebase link, and then uses the same token to issue a single-document Firestore REST `GET` for `userAccounts/{uid}`.

This design preserves the current rule contract:

- the user can read only their own `userAccounts/{uid}` document;
- no list query is introduced;
- no Firestore write is introduced;
- no service-account/IAM bypass is introduced.

## Database change

New migration:

`server/migrations/004_phase7_member_profile_shadow.sql`

New table:

`app_user_member_shadows`

The table stores selected member-profile fields only:

- Firebase UID
- email / masked email
- name
- team
- phone
- status
- directory member ID / verified version
- profile-required reason
- rejoined flag
- terms-consent revision / policy version
- source create/update timestamps
- deterministic source SHA-256 hash
- shadow synchronization timestamps

The full Firestore document payload is deliberately not duplicated into PostgreSQL. This reduces unnecessary retention of transition-only or recovery-related fields while still allowing drift detection through the source hash.

`app_user_id` is the primary key and `firebase_uid` is unique. A saved shadow cannot silently switch to another Firebase identity.

## Server additions

New Firestore REST client:

`server/src/firestore/firestore-user-account.mjs`

It:

- reads exactly `userAccounts/{firebase_uid}`;
- sends `Authorization: Bearer <Firebase ID token>`;
- decodes Firestore typed REST values into JavaScript values;
- treats 401, 403, 404, timeout, and service failures separately;
- does not log or return the Firebase ID token.

New repository/service:

- `server/src/legacy/member-shadow-repository.mjs`
- `server/src/legacy/member-shadow-service.mjs`

The service requires all of these conditions before a source can be synchronized:

1. Clerk session is valid.
2. Clerk user has a Phase 5 PostgreSQL identity.
3. PostgreSQL identity has a Phase 6 Firebase link.
4. Current verified Firebase token UID equals that saved Firebase link.
5. Firestore source document exists.
6. `userAccounts.uid` equals the verified Firebase UID.
7. Firestore email and Clerk/PostgreSQL primary email match when both are populated.

## New API endpoints

### Read saved shadow

`GET /api/users/me/legacy/member-shadow`

This reads PostgreSQL only and does not consume a Firestore document read.

### Synchronize shadow

`POST /api/users/me/legacy/member-shadow/sync`

Required headers:

- normal Clerk `Authorization: Bearer ...`
- `X-Firebase-Authorization: Bearer <Firebase ID token>`

The backend reads the current Firestore source and upserts the PostgreSQL shadow.

### Compare without overwriting

`POST /api/users/me/legacy/member-shadow/compare`

The backend rereads Firestore, calculates the current source hash, and compares it to the saved shadow. It does not overwrite PostgreSQL. Selected field names that changed are returned; if only a non-shadowed source field changed, `sourcePayload` is returned as the drift marker without returning that payload.

## Frontend staging diagnostics

The existing `?clerkTest=1` diagnostics panel is extended to Phase 7 with:

- Shadow Firebase UID
- shadow member name
- shadow team
- shadow status
- equality status
- changed-field names
- truncated hash indicator

New actions:

- `회원 Shadow 동기화`
- `회원 Shadow 조회`
- `회원 Shadow 비교`

The main application UI and Firebase production flows remain unchanged. `src/App.jsx` and `src/main.jsx` are unchanged from the Phase 6 fixed baseline.

## Configuration

No new required external Config Var is introduced.

Phase 7 reuses:

`FIREBASE_PROJECT_ID=laptop-system-mk`

Optional:

`FIRESTORE_REST_TIMEOUT_MS=8000`

The default is already 8000 ms, so normally this variable should not be added.

## Firestore / quota impact

The existing frontend Firestore access code is unchanged.

Phase 7 test actions add a deliberate server-side Firestore read only when the operator clicks shadow synchronization or comparison. Saved-shadow lookup is PostgreSQL-only. This is a transition/testing path, not a new production realtime subscription.

## Migration strategy

Phase 7 is intentionally not a bulk migration. Only the currently authenticated and already linked user can create/update their own shadow through the staging diagnostics path.

This allows schema and equivalence testing before any batch import, administrative migration, role migration, or production cutover is designed.

## Production impact

None intended.

Unchanged critical production files:

- `src/App.jsx`
- `src/firebase.js`
- `rules/firestore.rules`
- `firestore.indexes.json`
- `public/CNAME`
- `vercel.json`
- `src/main.jsx`
- root `package-lock.json`

No Firebase rule deployment, Firestore write, Firebase Auth mutation, or `gh-pages` production release is included.

## Manual platform actions

See `PHASE7_MANUAL_PLATFORM_ACTIONS.md`.

The short version is:

1. no new Heroku secret is required;
2. publish the package to `gh-pages-3` only;
3. deploy `gh-pages-3` to Heroku if automatic deploy is disabled;
4. confirm migration 004;
5. then set `SERVICE_VERSION=phase7`;
6. no new Vercel, Clerk, or Firebase Console setting is required;
7. run the Phase 7 browser shadow sync/read/compare checks.
