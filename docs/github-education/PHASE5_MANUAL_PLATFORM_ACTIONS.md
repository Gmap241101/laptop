# Phase 5 Manual Platform Actions

This file lists actions that cannot be completed by deploy.ps1 because they modify external account settings.

## Before deploying Phase 5

### Clerk Dashboard
1. Open the same Clerk application and Development instance already used by Phase 4.
2. Open **API Keys**.
3. Copy the **Secret Key** beginning with `sk_test_`.
4. Do not copy it into source code, Vercel, GitHub files, screenshots, or chat logs.

### Heroku Dashboard
1. Open the existing staging API app.
2. Open **Settings -> Config Vars**.
3. Add `CLERK_SECRET_KEY` with the `sk_test_...` value copied from the same Clerk Development instance.
4. Keep the current `SERVICE_VERSION` unchanged until the Phase 5 code deploy succeeds.
5. Optionally set `CLERK_API_TIMEOUT_MS=8000`; otherwise the code uses 8000 ms by default.
6. Do not change Heroku-managed `DATABASE_URL`.
7. Do not add `CLERK_SECRET_KEY` to Vercel; it is backend-only.

## Deploy Phase 5
1. Publish the Phase 5 full deployment package to `gh-pages-3` using deploy.ps1 v13.1.
2. Keep `gh-pages` / production unpublished.
3. In Heroku, deploy `gh-pages-3` manually unless automatic deploy has already been deliberately enabled.
4. Confirm the Release Phase applies `002_phase5_clerk_user_identity.sql` successfully.
5. After that deploy succeeds, set `SERVICE_VERSION=phase5` in Heroku. This creates another release; the migration runner must report `002` as already applied/skipped.

## After deployment

### Heroku health checks
- `GET /health/live` -> HTTP 200 and `version: phase5`.
- `GET /health` -> HTTP 200 and `database.status: ok`.

### Database check
Use Heroku Postgres console/CLI and verify:
- `app_user_identities` exists.
- `schema_migrations` contains `002_phase5_clerk_user_identity.sql`.

Do not manually insert a user row. The application should create/update the row through the authenticated sync endpoint.

### Browser validation
1. Open the fixed staging URL with `?clerkTest=1`.
2. Sign in with the same Clerk Development test user used in Phase 4.
3. Click **Backend 검증**; Clerk user and Backend user should still match.
4. Click **Postgres 동기화**.
5. Confirm `Postgres user` becomes a numeric internal ID and Email is populated from Clerk.
6. Click **Postgres 조회** and confirm the same Postgres internal ID returns again.
7. Sign out, sign back in, and repeat the lookup. The same Clerk user must retain the same Postgres internal ID.

## Expected security boundary
- Browser sends only the Clerk session JWT.
- Browser does not send an email/name payload to create the database identity.
- Backend verifies the JWT, uses the resulting Clerk user ID, then fetches the profile from Clerk Backend API with `CLERK_SECRET_KEY`.
- PostgreSQL upserts by unique `clerk_user_id`.
- No application role/administrator permission is assigned in Phase 5. Existing Firebase authorization remains authoritative.

## Failure map
- Heroku Release Phase says `CLERK_SECRET_KEY is required`: add the Config Var before deploying.
- Error says staging requires `sk_test_`: a Production Clerk secret was supplied; use the Development instance secret.
- `Postgres 동기화` returns HTTP 502: inspect Heroku logs for the generic Clerk API error code/status; verify the Secret Key belongs to the same Clerk instance as the frontend `pk_test_` key.
- `Postgres 동기화` returns HTTP 503: Clerk API timeout/network failure is the likely class; retry after checking Heroku logs.
- `Postgres 조회` returns no profile before first sync: expected.
- Clerk/Backend IDs mismatch: stop; do not proceed to the next phase.
- Postgres internal ID changes for the same Clerk user: stop; the identity uniqueness/upsert invariant failed.
