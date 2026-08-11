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

## Phase 29 migration/runtime hotfix
Staging validation exposed two deployment blockers before Phase 29 could be accepted:
- Migration 020 referenced nonexistent `app_runtime_metadata.metadata_key` / `metadata_value` columns. The baseline schema created by migration 001 uses `key` / `value`. Migration 020 now uses `INSERT INTO app_runtime_metadata (key, value, updated_at)` and `ON CONFLICT (key) ... value=EXCLUDED.value`.
- A frontend Phase 29 request with a backend that has not enabled `FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true` is now surfaced as `backend-rental-retirement-not-applied` instead of showing a blank retirement error.

Migration 020 failed inside the migration runner transaction and was not inserted into `schema_migrations`, so correcting the unapplied migration is safe for the observed staging database. Do not proceed to Phase 30 until migration 020 applies successfully and `/health` reports `rentalRequestWriteMirrorDisabled: true` with `rentalTransactionSource: postgresql`.

## Phase 29 runtime constraint/read hotfix
A second staging validation exposed two runtime defects after migration 020 and the backend retirement flag were successfully enabled:
- PostgreSQL rejected `firestore_mirror_status='retired'` with SQLSTATE `23514` because the original Phase 16 `app_rental_requests_mirror_status` CHECK constraint allowed only `pending`, `synced`, `failed`, and `legacy-source`. Migration 021 replaces that constraint and explicitly allows `retired`.
- The user rental-request screen still called the legacy `syncRentalRequestShadow()` path on initial load even when Phase 29 authoritative mode was enabled. This could re-read Firestore after the read fallback had already been retired. The Phase 29 path now calls the PostgreSQL authoritative candidate directly, and the backend legacy sync endpoint also bypasses Firestore import while authoritative mode is enabled.

Because migration 020 is already applied in staging, this schema correction is intentionally delivered as migration 021 rather than rewriting migration 020.
