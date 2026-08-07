# Phase 7 Manual Platform Actions

Phase 7 adds a read-only PostgreSQL shadow of the currently linked user's Firestore `userAccounts/{uid}` document. Firestore remains authoritative. The package does not change Firestore Rules, Firebase data, Clerk production settings, or the production `gh-pages` site.

## External settings before deployment

### Heroku
No new required secret or Config Var is introduced in Phase 7.

Keep all Phase 6 values, especially:
- `FIREBASE_PROJECT_ID=laptop-system-mk`
- existing `CLERK_JWT_KEY`
- existing `CLERK_SECRET_KEY`
- existing `CLERK_AUTHORIZED_PARTIES`
- existing PostgreSQL `DATABASE_URL`

Optional only:
- `FIRESTORE_REST_TIMEOUT_MS=8000`

The code already defaults to 8000 ms, so normally do not add this variable.

Before deploying Phase 7, keep `SERVICE_VERSION=phase6`. Change it only after the Phase 7 deployment and migration succeed.

### Vercel
No new environment variable is required.

Keep the existing staging values:
- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_API_URL=https://<HEROKU-STAGING-APP>`
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`

If Vercel automatically deploys when `gh-pages-3` changes, no manual Vercel action is needed. If automatic deployment is disabled, redeploy the latest `gh-pages-3` commit after deploy.ps1 finishes.

### Clerk
No new Clerk key or dashboard setting is required. Continue using the same Development instance already used by the staging frontend/backend.

### Firebase Console
No console change is required.

Do not create a service-account key for Phase 7. The backend reads Firestore using the current user's Firebase ID token, so the existing `userAccounts/{userId}` Security Rule remains responsible for allowing only that user's document read.

## Deploy Phase 7

1. Publish the Phase 7 full deployment package to `gh-pages-3` only using deploy.ps1 v13.1.
2. Do not publish `gh-pages` or the production `notebook.recruit.kro.kr` site.
3. If Heroku automatic deployment is disabled:
   - Heroku Dashboard -> staging API app -> Deploy.
   - Confirm branch is `gh-pages-3`.
   - Click Manual Deploy / Deploy Branch.
4. Watch the Release Phase.
5. Confirm migration `004_phase7_member_profile_shadow.sql` is applied successfully.
6. Only after deployment succeeds, change Heroku `SERVICE_VERSION=phase7`.
7. Confirm the release created by that Config Var change skips migration 004 as already applied rather than applying it again.

## Health checks

Open:
- `https://<HEROKU-STAGING-APP>/health/live`
- `https://<HEROKU-STAGING-APP>/health`

Expected:
- HTTP 200 for both.
- `version` is `phase7` after changing `SERVICE_VERSION`.
- `/health` reports `database.status: ok`.

## PostgreSQL migration check

Using Heroku Postgres CLI/console:

```sql
SELECT name, applied_at
FROM schema_migrations
ORDER BY name;
```

Expected migrations:
- `001_phase2_platform_baseline.sql`
- `002_phase5_clerk_user_identity.sql`
- `003_phase6_firebase_identity_bridge.sql`
- `004_phase7_member_profile_shadow.sql`

Verify the new table exists:

```sql
SELECT app_user_id, firebase_uid, name, team, status,
       source_hash, source_updated_at, synced_at
FROM app_user_member_shadows;
```

Before first browser synchronization, zero rows are normal. Do not manually insert a shadow row.

## Browser validation

Use the same browser profile for the existing Firebase login and Clerk Development login.

1. Open `https://mkrental.vercel.app/`.
2. Sign in with the existing Firebase account.
3. Open `https://mkrental.vercel.app/?clerkTest=1`.
4. Sign in to Clerk with the corresponding Development user.
5. Click **Backend 검증** and confirm Clerk user = Backend user.
6. Click **Postgres 조회** and confirm the Phase 5 internal user ID remains unchanged.
7. Click **Firebase 연결 조회**.
   - If the Phase 6 link exists, `Linked Firebase` must match `Firebase user`.
   - If it does not exist yet, click **Firebase 계정 연결** first, then query again.
8. Click **회원 Shadow 동기화**.
9. Expected Phase 7 panel values:
   - `Shadow Firebase` equals the linked Firebase UID.
   - `Shadow member` matches the existing member name.
   - `Shadow team` matches the existing team.
   - `Shadow status` matches the current Firestore member status.
   - `Shadow equivalent: yes` immediately after successful synchronization.
10. Click **회원 Shadow 조회**. The same saved values must return without a Firestore read.
11. Click **회원 Shadow 비교**. With no source changes, `Shadow equivalent: yes` and `Changed fields: -` are expected.
12. Refresh and repeat **회원 Shadow 조회**. The same shadow must persist.
13. Log out of Clerk, log back in with the same user, and verify the same Postgres user ID, Firebase link, and shadow record remain associated.

## Drift detection test (optional)

Do not change production data merely to force this test. If the member profile naturally changes in the staging Firebase data after the shadow was saved, run **회원 Shadow 비교** before synchronizing again.

Expected when source has changed:
- `Shadow equivalent: no`
- `Changed fields` lists selected field names such as `team` or `status`.

Then **회원 Shadow 동기화** updates the shadow to the current Firestore source, after which comparison should return `yes` again.

## Security model

- Firestore is still the authoritative member profile source.
- Heroku does not use a Firebase Admin/service-account credential for this read.
- The browser does not send a plain Firestore document body to PostgreSQL.
- The backend first verifies the Clerk JWT.
- The backend verifies the Firebase ID token and requires it to match the Firebase UID linked in Phase 6.
- The same Firebase ID token is then used as `Authorization: Bearer ...` for the single Firestore REST document read.
- Firestore Security Rules therefore evaluate the request as that Firebase user.
- The source document `uid` must equal the verified Firebase UID.
- Firestore member email and Clerk/PostgreSQL email must match when both are present.
- PostgreSQL stores a deterministic source hash for later drift comparison.
- Comparison does not overwrite the saved shadow.

## Failure map

- `legacy_link_not_found`: complete the Phase 6 Firebase account link first.
- `legacy_link_token_mismatch`: the currently logged-in Firebase account differs from the linked UID. Stop and sign into the correct legacy account.
- `member_source_not_found`: `userAccounts/{uid}` is missing in Firestore. Do not create a PostgreSQL row manually.
- `member_source_forbidden`: current Firestore Security Rules rejected the REST `get`. Confirm the user is logged into the expected Firebase project and that the deployed rule still allows a user to get their own `userAccounts/{uid}` document.
- `member_source_email_mismatch`: Firestore member email differs from Clerk/PostgreSQL email. Stop and investigate identity data; do not force the shadow.
- `/health` 503: PostgreSQL/backend issue, unrelated to the Firestore shadow logic.
- Heroku release fails on migration 004: do not set `SERVICE_VERSION=phase7`; inspect the release SQL error before retrying.

## Production

Phase 7 does not authorize a production cutover. Continue to leave `gh-pages` / `notebook.recruit.kro.kr` on the existing Firebase-backed production flow.
