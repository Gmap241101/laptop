# Phase 20 manual platform actions

## Vercel
Project: `mkrental` (service role: Staging, Vercel environment: Production)

Add:
- `VITE_ASSET_POSTGRES_READ_ENABLED=true`
- `VITE_ASSET_POSTGRES_WRITE_ENABLED=true`

Keep all previously validated Phase 14-19 variables. The Phase 20 paths additionally require the explicit staging query/session latches `assetRead=postgres` and `assetWrite=postgres`.

Recommended administrator diagnostic URL:
`https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on&restrictionRead=postgres&restrictionWatcher=off&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres`

Redeploy after changing `VITE_*` values. Never expose `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or Firebase service-account private keys through `VITE_*`.

## Heroku
No new secret is required. Deploy the Phase 20 server source and let the existing Procfile Release Phase apply `012_phase20_asset_domain_cutover.sql`.
Recommended diagnostic version: `SERVICE_VERSION=phase20`.

## Clerk
No new setting. Continue using the same Development instance/test keys for Staging.

## Firebase Console
No Rules, index, Authentication, or Admin SDK credential change is required. Administrator bootstrap and compatibility mirrors use the verified caller Firebase administrator token and remain subject to existing Security Rules.

## GitHub
Publish only `gh-pages-3`. Do not publish `gh-pages`.

## DNS
No change.
