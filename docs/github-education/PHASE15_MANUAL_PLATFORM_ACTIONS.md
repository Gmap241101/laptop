# Phase 15 Manual Platform Actions

Phase 15 changes only the Staging frontend read path. There is no new PostgreSQL migration and no new backend endpoint.

## Vercel

Project: `mkrental`
Environment: `Production` inside this separate Staging Vercel project.

Add:

- `VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED=true`
- `VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED=true`

Keep:

- `VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED=true`
- all Phase 9-14 Staging variables already configured.

After saving build-time `VITE_*` variables, create a new Vercel deployment.

Do not place server secrets such as `DATABASE_URL`, `CLERK_SECRET_KEY`, or `CLERK_JWT_KEY` in Vercel frontend variables.

## Heroku

No new Config Var is required and no migration is added in Phase 15. The Phase 14 rental request APIs are reused unchanged.

Optional diagnostic labeling only: set `SERVICE_VERSION=phase15` if you want `/health` to show the overall Staging transition phase. This does not change backend behavior.

## Clerk

No additional configuration.

Continue using the same Development instance (`pk_test_...` / `sk_test_...`) already validated in Phase 14.

## Firebase Console

No additional configuration.

- Firestore Rules unchanged.
- Firestore indexes unchanged.
- Firebase Auth unchanged.
- No Firebase Admin private key is introduced.

## GitHub

Deploy only the `gh-pages-3` Staging branch. Do not promote `gh-pages`.

## DNS

No change.

## Browser validation order

### Stage A - preferred read with parity safety

Open a fresh tab with:

`?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on&restrictionRead=postgres&restrictionWatcher=off&rentalRequestParity=1&rentalRequestRead=postgres`

Open the user request-history screen and verify:

- Rental request cutover requested: yes
- Rental request active source: postgresql-shadow
- Rental request watcher: active
- Cutover equivalent: yes
- Cutover changed request IDs: -
- Cutover changed fields: -
- Cutover fallback reason: -

If PostgreSQL differs, the application intentionally keeps Firestore as the active source.

### Stage B - watcher reduction

After Stage A passes, open a fresh tab with:

`?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on&restrictionRead=postgres&restrictionWatcher=off&rentalRequestRead=postgres&rentalRequestWatcher=off`

Open the user request-history screen and verify:

- Rental request cutover requested: yes
- Rental request active source: postgresql-shadow
- Rental request watcher: disabled
- Cutover equivalent: yes
- Rental request one-time Firestore fallback queries: 0
- Rental shadow source refreshes this load: 1
- Expected rentalRequests realtime reads: 0 while this page session stays on PostgreSQL

The watcher-off path deliberately refreshes the PostgreSQL shadow once through the already validated Phase 14 sync endpoint before serving the PostgreSQL candidate. This protects against stale shadow data caused by still-authoritative Firestore writes while eliminating the continuous browser Firestore listeners for `rentalRequests` in that page session.

If the PostgreSQL/backend path fails, the application performs a one-time browser Firestore fallback instead of creating realtime listeners.
