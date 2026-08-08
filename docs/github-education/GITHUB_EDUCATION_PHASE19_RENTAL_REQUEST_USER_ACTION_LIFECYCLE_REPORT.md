# Phase 19 — Rental Request User Action Lifecycle

Phase 19 moves the remaining user-side rental request lifecycle that already exists in the product to PostgreSQL authoritative transactions, while keeping Firestore compatibility mirrors during the staged migration.

## Combined scope
- User direct request edit for eligible `신청중` / `보류` requests: PostgreSQL authoritative + Firestore compatibility mirror.
- User direct request cancel for eligible requests: PostgreSQL authoritative + Firestore compatibility mirror; the cancelled request is removed as in the existing product behavior.
- User extension lifecycle:
  - manual policy: PostgreSQL stores the pending extension request for administrator review,
  - auto policy: PostgreSQL applies the extension immediately,
  - whole-user overdue state, waiting period, extension count, date range, and asset conflicts are revalidated server-side.
- Administrator review of legacy/current pending `change`, `cancel`, `extend`, and `return` actions: PostgreSQL authoritative review + Firestore compatibility mirror.
- Existing early-return UI remains intentionally disabled; Phase 19 does not invent a new early-return feature.
- PostgreSQL request shadow is refreshed after user-side mutations so the already-cut-over user request read path remains current.

## Data model
Migration `011_phase19_user_action_lifecycle.sql` adds a pending-user-action partial index and runtime metadata describing the Phase 19 authority boundaries. Existing migrations remain unchanged.

## Runtime safety
- Clerk remains the backend session authority in Staging.
- The caller's Firebase ID token is still verified and used for Firestore compatibility operations, so existing Firestore Security Rules remain enforced.
- User identity, member status, request ownership, current rental restriction, whole-user overdue state, extension policy, date range, and asset conflicts are validated on the server.
- PostgreSQL row/advisory locks protect request/asset mutations.
- Firestore compatibility mirror completes before PostgreSQL commit in the authoritative mutation path.
- No Firebase Admin private key or service-account credential is introduced.
- Non-opt-in sessions retain the existing Firestore workflow.

## Product-contract correction captured in Phase 19
The actual source behavior differs from an earlier high-level plan: request change and cancellation are direct user operations, not normally administrator-review requests. Extension may be manual or automatic according to the existing system setting. Early return is explicitly disabled in the current UI. Phase 19 follows the actual source contract instead of adding new behavior.

## Remaining major migration domains
After Phase 19, the rental-request workflow is effectively PostgreSQL-authoritative end-to-end, but Firestore compatibility mirrors remain while other domains still depend on Firestore. The next grouped work should move the rental asset/catalog/availability domain, followed by member/restriction writes and then low-change settings/content domains.

## Phase 19 staging hotfix - admin status DATE normalization

A staging runtime defect was found after Phase 19 deployment: administrator approval/on-hold/rejection actions could return PostgreSQL error code `22007`. The administrator rental-request repository read `DATE` columns without forcing text representation and then converted them with `String(value).slice(0, 10)`. When the PostgreSQL driver returns a JavaScript `Date`, this can produce a non-ISO fragment such as `Sat Aug 08`, which is invalid when passed back to PostgreSQL as `$n::date`.

The hotfix preserves all existing workflow behavior and changes only the administrator repository date boundary:

- `start_date` and `due_date` are selected as `::text`.
- Repository mapping normalizes JavaScript `Date` and string values to `YYYY-MM-DD`.
- The backend admin rental request smoke now covers JavaScript `Date` rows and verifies the explicit `::text` SELECT contract.
- No migration, Firestore rule, index, dependency, UI, or production-routing change is required.


## Pre-apply hotfix: deterministic Korean request timestamp

- The Phase 16+ backend-generated `requestedAt` text no longer relies on the Node/Heroku ICU day-period label.
- `koreaRequestedAtText()` now formats Asia/Seoul components deterministically as `YYYY. M. D. 오전/오후 h:mm:ss`.
- Example: `2026. 8. 8. 오후 1:20:40`.
- This is a display/data-contract consistency fix and is separate from the PostgreSQL `22007` admin DATE normalization fix.
- No migration, Firestore Rules/index, or npm dependency change is required.
