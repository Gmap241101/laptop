# Phase 18 manual platform actions

## Vercel
Project: `mkrental` (service role: Staging, Vercel environment: Production)

No new Vercel key is required.
Keep:
- `VITE_ADMIN_RENTAL_REQUEST_POSTGRES_READ_ENABLED=true`
- `VITE_ADMIN_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED=true`
- all previously validated Phase 14-16 variables.

Deploy/redeploy the Phase 18 source so the new frontend code is built. Do not expose `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or any Firebase service-account private key in `VITE_*` variables.

## Heroku
No new secret is required.
Deploy the Phase 18 server source and allow the existing Procfile Release Phase to execute migration `010_phase18_admin_rental_mutation_completion.sql`.
Recommended diagnostic version: `SERVICE_VERSION=phase18`.

## Clerk
No new setting. Continue using the same Development instance/test keys for Staging.

## Firebase Console
No Rules, index, Auth, or Admin SDK credential change is required.
Phase 18 Firestore compatibility mirrors continue to use the current administrator's verified Firebase ID token and remain subject to Firestore Security Rules.

## GitHub
Publish only `gh-pages-3` through deploy.ps1 v13.1. Do not publish `gh-pages`.

## DNS
No change.
