# Phase 8 Manual Platform Actions

Phase 8 validates the real application member-profile read against the PostgreSQL shadow read candidate. Firestore remains authoritative and no new secret, database migration, Clerk setting, Firebase Console setting, or Vercel environment variable is introduced.

## Before deploy

Keep all existing Phase 7 settings unchanged.

Heroku required values remain:
- `APP_ENV=staging`
- existing `DATABASE_URL`
- existing Clerk JWT and Secret Key values
- `FIREBASE_PROJECT_ID=laptop-system-mk`
- existing CORS/authorized-party values

Vercel values remain:
- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_API_URL=https://<HEROKU-STAGING-APP>`
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`

Do not add a new Phase 8 environment variable.

Before deploying, leave `SERVICE_VERSION=phase7`. Change it only after the new code is successfully running on Heroku.

## Deploy

1. Publish the Phase 8 full package to `gh-pages-3` only with deploy.ps1 v13.1.
2. Do not publish `gh-pages` / `notebook.recruit.kro.kr`.
3. If Heroku automatic deploy is disabled, open the staging Heroku app -> Deploy -> confirm `gh-pages-3` -> Manual Deploy.
4. There is no Phase 8 SQL migration. During Release Phase, migrations 001 through 004 must be reported as already applied; no new migration should be applied.
5. After the Heroku deploy succeeds, set `SERVICE_VERSION=phase8`.
6. The Config Var release should again skip migrations 001 through 004 as already applied.
7. Check `/health/live` and `/health`; both must report version `phase8`, status `ok`, and `/health` must report database status `ok`.
8. If Vercel does not automatically deploy `gh-pages-3`, redeploy the latest `gh-pages-3` commit from the Vercel staging project.

## Browser validation

Use the same browser profile that already passed Phase 7.

1. Open `https://mkrental.vercel.app/` and sign in with the existing Firebase user.
2. Open `https://mkrental.vercel.app/?clerkTest=1`.
3. Sign in to the matching Clerk Development user if needed.
4. Confirm the existing Phase 7 values remain correct:
   - Clerk user = Backend user.
   - Postgres user is unchanged.
   - Firebase user = Linked Firebase.
   - Shadow equivalent = yes.
5. Confirm the panel title is `Clerk Staging Test - Phase 8` or otherwise indicates Phase 8.
6. The `Member profile parallel read` section should show the app read source as `firestore-onSnapshot` after the real application profile subscription has delivered a profile.
7. Click the Phase 8 parallel-read verification button.
8. Expected values:
   - App read source: `firestore-onSnapshot`.
   - App read Firebase equals the current Firebase UID.
   - Candidate source: `postgresql-shadow`.
   - Candidate member/team/status match the app read values.
   - Read equivalent: `yes`.
   - Read changed fields: `-`.
9. Refresh and repeat. The result must remain equivalent.

## Important behavior

The Phase 8 comparison does not create a new Firestore read. It compares the actual Firestore profile already received by the application's existing `onSnapshot()` subscription against one PostgreSQL API read.

The PostgreSQL candidate endpoint is not authoritative in Phase 8. It cannot change the application member profile, session decision, rental eligibility, or UI state. A mismatch is diagnostic only.

## Failure map

- App read source remains `-`: the real application Firestore profile subscription has not produced a profile. Confirm the Firebase user is signed in and the normal user account UI has loaded.
- Candidate endpoint returns `member_shadow_not_found`: run the Phase 7 member Shadow synchronization first.
- Read equivalent = `no`: stop. Do not proceed to a read cutover. Inspect `Read changed fields`, then run Phase 7 Shadow comparison. If Firestore changed legitimately, synchronize the Shadow and repeat the Phase 8 check.
- `/health` 503: backend/PostgreSQL issue; unrelated to the parity logic.
- Heroku applies a new SQL migration during Phase 8: stop and inspect the deployed package. Phase 8 intentionally has no new migration.

## Production

Do not publish `gh-pages` or change `notebook.recruit.kro.kr`. Phase 8 is staging-only parallel-read verification.
