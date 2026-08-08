# Phase 16 - Rental Request PostgreSQL Authoritative Write

## Baseline
`rental-system-github-education-phase15-rental-request-read-cutover-20260808_deployment_package.zip`

Phase 15 browser validation is accepted as PASS. Stage A correctly retained Firestore when a newly-created request made the shadow stale (3 Firestore vs 2 PostgreSQL), and Stage B refreshed the shadow once, selected PostgreSQL, disabled the browser watcher, and reported zero browser fallback queries.

## Scope
Phase 16 moves only **new user rental-request creation** behind an explicit Staging opt-in to a PostgreSQL authoritative transaction. Existing request edit/cancel/extension flows and administrator approval/return flows remain on Firestore for later phases.

## PostgreSQL canonical model
Migration `008_phase16_rental_request_authoritative_write.sql` adds:

- `app_rental_requests`
- `app_rental_request_items`
- `app_rental_asset_reservation_guards`
- `app_rental_request_events`

Existing Phase 14 shadow rows are backfilled as legacy-source canonical records when their date values are valid.

## Transaction contract
The create repository:

1. starts a PostgreSQL transaction;
2. takes a per-asset PostgreSQL advisory transaction lock;
3. enforces request/idempotency uniqueness;
4. refreshes Firestore reservation state into reservation guards;
5. reads/locks the latest restriction shadow;
6. checks current overdue/restriction policy and asset conflicts;
7. inserts canonical request, item, reservation guard and event;
8. performs the Firestore compatibility mirror using the verified user's Firebase ID token;
9. marks the mirror synced and commits PostgreSQL only after the mirror succeeds.

A Firestore mirror failure rolls back PostgreSQL. The implementation intentionally does not add a Firebase Admin credential or bypass Firestore Security Rules.

## Firestore compatibility mirror
The server mirrors the same three logical writes as the legacy client transaction in one Firestore REST commit:

- create `rentalRequests/{requestId}`;
- create `rentalAvailability/{requestId}`;
- append the matching reservation to `rentalAssets/{assetId}` with an update-time precondition.

This keeps the existing Phase 17-pending administrator flows compatible with the newly-created request.

## Server-owned fields
The client sends only request ID/idempotency key, selected asset ID, dates and purpose. The backend derives the Firebase UID/email, member name/team and authoritative asset number/category from verified server-side sources.

## Staging gate
Frontend write cutover requires both:

```text
VITE_CLERK_STAGING_ENABLED=true
VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED=true
```

and the explicit test opt-in `rentalRequestWrite=postgres` (or same-tab session latch).

Without the opt-in, the existing Firestore `runTransaction()` path is preserved.

## Phase 15 compatibility correction
During Phase 16 audit, a latent non-opt-in Phase 15 branch referenced an undefined `candidate` variable. The A/B user tests were opt-in and therefore were not affected. Phase 16 fixes that branch so a non-opt-in session cleanly stays on `firestore-onSnapshot`; a regression assertion now covers the branch.

## Explicitly out of scope
- existing request edit/cancel/extension write cutover;
- administrator approval/reject/hold/start/return write cutover;
- Production `gh-pages` deployment;
- Firebase Auth removal;
- Firestore Rules/index removal;
- Firebase Admin credentials.
