# Phase 17 — Admin Rental Request PostgreSQL Cutover

Phase 17 moves the administrator rental-request list, server-side search/paging, tab counts, dashboard rental-request metrics, and core status transitions to PostgreSQL in the dedicated Staging opt-in path.

## Core behavior
- Admin identity is verified with Clerk backend auth plus the caller's Firebase ID token against `adminAccounts/{uid}` through Firestore Security Rules.
- On first admin request-list load, legacy `rentalRequests` are source-bootstrapped into PostgreSQL canonical tables.
- List/search/filter/page/count reads are then served from PostgreSQL.
- Core status transitions use PostgreSQL transaction/advisory locking as authority and commit a Firestore compatibility mirror before PostgreSQL commit.
- The existing `allowNonOverlappingSameAssetRequests` policy is revalidated against both Firestore asset reservations and PostgreSQL reservation guards.
- Return-side overdue restriction compatibility writes remain mirrored to Firestore, and related penalty flags are synchronized to PostgreSQL canonical records.
- Existing admin direct edit, memo, status-restore, and user-action-review Firestore transactions remain available in this phase; any admin mutation forces a fresh legacy bootstrap before the next PostgreSQL list read.
- Normal/Production paths remain Firestore unless the Phase 17 Vercel variables and explicit query/session opt-ins are both active.

## Phase 16 UX regression fix
During a successful Phase 16 PostgreSQL-authoritative request creation, the Firestore compatibility mirror could cause the selected-asset availability guard to see the newly-created request as a conflicting reservation before submit completion, showing a false deselection toast. Phase 17 suppresses that guard while `requestSubmitLoading` is true.

## Not removed in Phase 17
- Firebase Auth
- Firestore Rules/indexes
- Firestore compatibility mirror
- User request create/read PostgreSQL paths from Phase 14-16
- Legacy admin edit/memo/user-action review transactions
