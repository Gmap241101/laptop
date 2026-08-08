# Phase 19 manual platform actions

## Vercel
Project: `mkrental` (service role: Staging, Vercel environment: Production)

Add:
- `VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED=true`

Keep all previously validated Phase 14-18 variables, including rental request PostgreSQL read/write and administrator request read/write gates.

The Phase 19 user-action write path also requires the explicit staging query/session latch `rentalRequestActionWrite=postgres`.

Recommended full diagnostic query:
`?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on&restrictionRead=postgres&restrictionWatcher=off&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres`

Redeploy after adding/changing a `VITE_*` value because Vite consumes it at build time. Never expose `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or Firebase service-account private keys through `VITE_*`.

## Heroku
No new secret is required.
Deploy the Phase 19 server source and let the existing Procfile Release Phase execute migration `011_phase19_user_action_lifecycle.sql`.
Recommended diagnostic version: `SERVICE_VERSION=phase19`.

## Clerk
No new setting. Continue using the same Development instance/test keys for Staging.

## Firebase Console
No Rules, index, Auth, or Admin SDK credential change is required.
Phase 19 compatibility mirrors use the caller's verified Firebase ID token and remain subject to the existing Firestore Security Rules.

## GitHub
Publish only `gh-pages-3`. Do not publish `gh-pages`.

## DNS
No change.
