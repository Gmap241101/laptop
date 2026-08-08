# GitHub Education Phase 11 - Member Profile Firestore Write-Through

## Baseline

Phase 10 full deployment package is the sole baseline for this change:

`rental-system-github-education-phase10-firestore-watcher-disable-20260808_deployment_package.zip`

## Objective

Phase 10 successfully removed the active member `userAccounts/{uid}` realtime listener in the explicit staging path. That creates a freshness gap because member-profile writes still commit to Firestore while the active UI reads PostgreSQL. Phase 11 closes that gap without changing Firestore write authority.

## Architecture

Covered Firestore mutation -> verified actor Firebase ID Token -> Heroku write-through endpoint -> Firestore REST reread of the committed target document -> existing Firestore Security Rules authorization -> linked PostgreSQL shadow upsert.

The browser never sends trusted member-profile fields to PostgreSQL. It sends only the target Firebase UID and the actor's Firebase ID Token. The backend rereads the committed Firestore document and normalizes the server-observed source.

`POST /api/legacy/member-shadow/write-through?firebaseUid=<uid>`

For a target UID that has not been linked to PostgreSQL, the operation returns a non-fatal `skipped` result. The backend attempts the Firestore target read before revealing link status so an ordinary member cannot probe whether arbitrary UIDs have already been migrated; Firestore Rules authorize the actor/target read first.

## Freshness without Firestore realtime

When Phase 10 watcher-disable mode is active:

- the first profile load remains PostgreSQL-first with the existing one-time Firestore emergency fallback;
- a successful write-through event for the current user immediately refreshes the active profile from PostgreSQL;
- a PostgreSQL-only refresh runs every 15 seconds so remote administrator changes become visible without a Firestore member-profile listener;
- unchanged refresh results do not rewrite React profile/form state, preventing no-op polling from overwriting unsaved My Page input.

## SPA gate persistence

The application's route helpers replace paths without preserving query strings. Phase 11 therefore latches the explicit staging cutover/write-through opt-in in browser `sessionStorage` after the initial test URL. This prevents navigation to `/mypage` or `/admin` from silently disabling the Phase 9/10/11 test path. `?memberRead=firestore` or closing the tab resets the cutover latch.

## Failure isolation

Firestore remains the authoritative write source. PostgreSQL write-through is invoked only after the Firestore mutation succeeds. A write-through network/authorization/database failure is logged and published to diagnostics but does not convert a successful Firestore mutation into an application write failure.

## Standard mutation coverage

Phase 11 integrates best-effort write-through into user profile save, terms consent, membership directory/status reconciliation, membership withdrawal/rollback, administrator status changes, administrator directory-policy restore/audit/rebuild, and member-directory save/index metadata updates.

New-account signup is not synchronized before a Clerk/PostgreSQL identity link exists; the existing identity/link/shadow bootstrap handles that case. System backup/restore remains a maintenance path requiring explicit post-restore shadow resynchronization.

## Database / dependency impact

- New PostgreSQL migration: none.
- New npm dependency: none.
- Existing Firestore Rules: unchanged.
- Existing Firestore indexes: unchanged.
- Existing production CNAME: unchanged.
- Production `gh-pages`: unchanged.
