# Phase 6 Manual Platform Actions

Phase 6 links the authenticated Clerk/PostgreSQL identity to the user's existing Firebase Authentication account. These actions modify external services and cannot be completed by deploy.ps1.

## What changes outside the deployment package

### Heroku: one required Config Var
Before deploying Phase 6, open the existing staging API app:

1. Heroku Dashboard -> staging API app -> Settings -> Config Vars.
2. Add:
   - `FIREBASE_PROJECT_ID=laptop-system-mk`
3. Optional only: `FIREBASE_CERT_TIMEOUT_MS=8000`. If omitted, the code uses 8000 ms.
4. Keep the current `SERVICE_VERSION=phase5` until the Phase 6 code deploy and migration succeed.
5. Do not modify Heroku-managed `DATABASE_URL`.
6. Keep all existing Clerk Config Vars from Phase 5.

`FIREBASE_PROJECT_ID` is a public project identifier, not a private key. Phase 6 does not require a Firebase service-account JSON or Admin SDK credential.

### Vercel: no new settings
Keep the existing Phase 4/5 values unchanged:
- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_API_URL=https://<HEROKU-STAGING-APP>`
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`

No additional Vercel variable is required for Phase 6.

### Clerk: no new settings
Use the same Clerk Development instance already validated in Phase 5. No additional key or dashboard setting is required.

### Firebase Console: no changes
Do not create a service account or new Firebase credential for Phase 6. The existing browser Firebase Auth session supplies an ID token; Heroku verifies it against Google's Firebase signing certificates.

## Deploy Phase 6

1. Publish the Phase 6 full deployment package to `gh-pages-3` only with deploy.ps1 v13.1.
2. Do not publish `gh-pages` / `notebook.recruit.kro.kr` production.
3. If Heroku automatic deployment is disabled, open Heroku -> Deploy -> select `gh-pages-3` -> Manual Deploy.
4. Confirm Release Phase applies `003_phase6_firebase_identity_bridge.sql`.
5. Only after the deploy succeeds, change Heroku `SERVICE_VERSION` to `phase6`.
6. Confirm the subsequent release skips already-applied migrations rather than re-running them.

## Health checks

Open:
- `https://<HEROKU-STAGING-APP>/health/live` -> HTTP 200, `version: phase6`.
- `https://<HEROKU-STAGING-APP>/health` -> HTTP 200, `database.status: ok`.

## PostgreSQL check

Using Heroku Postgres console/CLI, verify:

```sql
SELECT name, applied_at
FROM schema_migrations
ORDER BY name;
```

It must include:
- `001_phase2_platform_baseline.sql`
- `002_phase5_clerk_user_identity.sql`
- `003_phase6_firebase_identity_bridge.sql`

Then verify the new table exists:

```sql
SELECT app_user_id, firebase_uid, firebase_email, firebase_email_verified,
       firebase_sign_in_provider, linked_at, last_verified_at
FROM app_user_firebase_links;
```

Before the browser link test, zero rows are normal. Do not manually insert a mapping row.

## Browser validation

Phase 6 needs both sessions in the same browser.

1. Open `https://mkrental.vercel.app/` normally.
2. Sign in to the existing site with the legacy Firebase account that you intend to link.
3. Return to the home page after the normal site login completes.
4. Open `https://mkrental.vercel.app/?clerkTest=1` in the same browser/profile.
5. Sign in to Clerk with the corresponding Clerk Development test user.
6. The Phase 6 panel should show:
   - `Signed in: yes`
   - `Firebase signed in: yes`
   - a Clerk `user_...` value
   - a Firebase UID value
7. Click **Backend 검증**. Clerk user and Backend user must still match.
8. Click **Postgres 조회**. The existing Phase 5 Postgres internal user ID should remain unchanged.
9. Click **Firebase 계정 연결**.
10. Expected result:
    - `Linked Firebase` becomes the same UID shown in `Firebase user`.
    - `Legacy email` matches the Clerk/Postgres email ignoring case.
    - `Firebase provider` is normally `password` for the existing email/password account.
11. Click **Firebase 연결 조회**. The same linked Firebase UID must return.
12. Refresh the page and click **Firebase 연결 조회** again. The same mapping must persist.
13. Sign out from Clerk, sign back in with the same Clerk user, then repeat the lookup. The same Postgres ID and Firebase UID must remain linked.

## Expected security behavior

- Browser never sends a plain Firebase UID for persistence.
- The browser sends a short-lived Firebase ID token only in `X-Firebase-Authorization: Bearer ...`.
- Heroku verifies RS256 signature, `kid`, `exp`, `iat`, `auth_time`, `aud`, and `iss` before trusting `sub` as Firebase UID.
- The token itself is not returned to the browser response or intentionally written to application logs.
- Clerk/Postgres email and Firebase token email must match before first linking.
- One Postgres app user can have only one Firebase UID.
- One Firebase UID can belong to only one Postgres app user.
- Phase 6 does not migrate Firestore records and does not replace Firebase authorization.

## Failure map

- Heroku deploy says `FIREBASE_PROJECT_ID is required`: add `FIREBASE_PROJECT_ID=laptop-system-mk` before deploying.
- `/health` is 503: PostgreSQL/backend issue; not a Firebase identity-link issue.
- `Firebase signed in: no`: log into the existing mkrental Firebase site first, then reopen `/?clerkTest=1` in the same browser.
- `Firebase 계정 연결` returns `legacy_firebase_unauthorized`: Firebase ID token verification failed; verify the browser is actually logged into the expected Firebase project and inspect Heroku's generic error code.
- `legacy_firebase_verification_unavailable`: Heroku could not obtain/parse Google's Firebase signing certificates. Retry after checking outbound connectivity/logs.
- `firebase_email_mismatch`: Clerk/Postgres email and Firebase email differ. Stop; do not force a database row manually.
- `firebase_link_user_conflict`: this Clerk/Postgres user was already linked to another Firebase UID. Stop and investigate.
- `firebase_link_uid_conflict`: that Firebase UID is already linked to another Clerk/Postgres user. Stop and investigate.
- `profile_not_synced`: run Phase 5 Postgres synchronization first.
