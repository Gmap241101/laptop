# Phase 17 manual platform actions

## Vercel
Project: `mkrental` (service role: Staging, Vercel environment: Production)

Add:
- `VITE_ADMIN_RENTAL_REQUEST_POSTGRES_READ_ENABLED=true`
- `VITE_ADMIN_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED=true`

Redeploy after saving because these are Vite build-time variables.
Do not expose `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or any Firebase service-account private key.

## Heroku
No new secret is required.
Deploy the Phase 17 server source and allow the existing Procfile Release Phase to execute migration `009_phase17_admin_rental_request_cutover.sql`.
Recommended diagnostic version: `SERVICE_VERSION=phase17`.

## Clerk
No new setting.
Continue using the same Development instance and test keys for Staging.

## Firebase Console
No Rules, index, Auth, or Admin SDK credential change is required.
Phase 17 admin source/bootstrap and compatibility mirror use the current administrator's verified Firebase ID token and remain subject to Firestore Security Rules.

## GitHub
Publish only `gh-pages-3` through the existing deploy.ps1 v13.1 flow.
Do not publish `gh-pages`.

## DNS
No change.
