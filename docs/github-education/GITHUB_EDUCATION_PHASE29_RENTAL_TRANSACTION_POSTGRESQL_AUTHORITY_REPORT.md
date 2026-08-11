# Phase 29 · Rental transaction PostgreSQL authority + Firestore write mirror retirement

## Baseline
- Confirmed baseline: Phase 28 asset/board write mirror retirement.
- Phase 28 actual staging validation: PASS.

## Scope
Phase 29 moves rental-request transaction source/preconditions to PostgreSQL for the staging opt-in path and retires the rental-request Firestore write mirror.

Covered operations:
- user rental request creation
- user request edit/cancel/extension lifecycle
- administrator direct edit/memo/status restore/status processing/user-action review
- rental-induced restriction updates

Preserved compatibility:
- Firebase administrator identity verification
- legacy Firestore bootstrap/synchronization endpoints for rollback and migration support
- member profile write mirror
- non-rental member/restriction compatibility paths
- site-shell parity fallback
- policy/terms transaction compatibility
- account recovery and Firebase Auth compatibility

## Runtime authority
When `FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true`:
- rental transaction source: PostgreSQL
- rental request read used by transaction logic: canonical `app_rental_requests`
- rental configuration source: PostgreSQL `rental-config` content domain
- asset source: PostgreSQL asset catalog
- rental restriction source: PostgreSQL restriction authority record
- rental request Firestore write mirror: retired
- rental-induced restriction mirror state: retired

The existing Firebase administrator identity remains required for administrator operations during the staged migration.

## Rollback
Set `FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=false` on Heroku and `VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=false` on Vercel, then redeploy. Migration 020 does not need to be reverted.
