# GitHub Education Phase 15 - Rental Request PostgreSQL Preferred Read / Watcher Reduction

## Baseline

`rental-system-github-education-phase14-rental-request-foundation-parity-20260808_deployment_package.zip`

The Phase 14 user validation passed with:

- migration `007_phase14_rental_request_foundation.sql` applied,
- Heroku `/health` and `/health/live` OK,
- Firestore request count = PostgreSQL request count = 2,
- frontend parity = yes,
- backend shadow parity = yes,
- changed request IDs/fields = none.

Phase 14 is therefore promoted as the Phase 15 baseline.

## Scope

Phase 15 changes only the Staging user rental-request read path.

It adds two independent opt-in controls:

1. PostgreSQL-preferred read with the existing Firestore watcher still active for live parity protection.
2. PostgreSQL read with the `rentalRequests` Firestore watchers disabled after validation.

Production behavior is unchanged unless the Staging-only environment variables and query/session opt-ins are enabled.

## Preferred-read mode

Environment gate:

- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED=true`

Query:

- `rentalRequestRead=postgres`

The application continues to observe the existing Firestore request queries and independently reads the Phase 14 PostgreSQL candidate.

Selection contract:

- equivalent Firestore/PostgreSQL data -> active source `postgresql-shadow`,
- candidate missing/error -> Firestore remains active,
- any request ID, field, or order mismatch -> Firestore remains active.

The comparison reuses the exact Phase 14 normalized request contract, including previous Firebase UID/email compatibility results and Timestamp normalization.

## Watcher-off mode

Additional environment gate:

- `VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED=true`

Additional query:

- `rentalRequestWatcher=off`

When both read and watcher-off opt-ins are active, the application does not construct the user `rentalRequests` `onSnapshot()` listeners.

Because Phase 16 has not yet moved request writes to PostgreSQL authority, the watcher-off path first calls the existing authenticated Phase 14 shadow-sync endpoint once. The backend reads the current user's authorized Firestore request set with the verified Firebase ID token, refreshes the normalized PostgreSQL shadow transactionally, and returns that PostgreSQL candidate.

The UI then uses the returned PostgreSQL candidate as the active request list.

If that backend/Clerk/Firebase bridge path fails, the browser performs one one-time set of the existing Firestore UID/email queries with `getDocs()` and does not create realtime listeners.

This deliberately reduces continuous `rentalRequests` listener activity without pretending that Firestore is no longer authoritative before Phase 16/17.

## Session latching

The opt-ins survive SPA navigation in the same browser tab using `sessionStorage`, matching the existing member-profile and restriction cutover pattern.

Reset:

- `rentalRequestRead=firestore`

clears both the read and watcher-off latches.

## UI impact

No user-facing rental/request-history layout is changed.

Only the Staging diagnostic panel is extended and retitled to Phase 15.

New diagnostics include:

- cutover requested,
- active source,
- watcher active/disabled,
- one-time Firestore fallback query count,
- cutover parity/mismatch fields,
- fallback reason,
- shadow sync timestamp,
- source refresh count,
- expected realtime `rentalRequests` reads.

## Backend / PostgreSQL impact

No Phase 15 migration.

No new backend API.

Phase 15 reuses:

- `GET /api/users/me/rental-requests`
- `POST /api/users/me/legacy/rental-request-shadows/sync`

Migration `007_phase14_rental_request_foundation.sql` remains unchanged.

## Firestore impact

No Rules/index/schema change.

No write cutover.

In watcher-off mode, continuous user `rentalRequests` listeners are not created. A single authenticated shadow refresh is intentionally performed on load while Firestore remains authoritative, with a one-time browser Firestore fallback only if the PostgreSQL path fails.

## Deferred

Phase 16 remains the PostgreSQL-authoritative transaction cutover for new user rental requests.

Phase 17 remains the administrator request-management/status/return/dashboard migration, which is required before user shadows can be kept current from all administrator-side mutations without Firestore source refreshes.
