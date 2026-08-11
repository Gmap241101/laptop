# GitHub Education Phase 30 — Member Status / Restriction Write Mirror Retirement

## Objective
Phase 30 removes Firestore as the runtime data source and write mirror for **administrator member-status changes** and for the **status-related inherited rental-restriction write** that can accompany account activation.

The change is intentionally narrower than a full member-profile migration. Profile edits remain on the existing PostgreSQL-authoritative + Firestore compatibility-mirror path because `memberIdentityClaims`, `memberDirectoryKeys`, and `accountRecoveryKeys` are still part of that lifecycle.

## PostgreSQL authority changes
- `GET /api/admin/members` provides administrator member list/search/filter/page/count data from `app_member_accounts`.
- Administrator status mutation reads the current canonical member from `app_member_accounts` rather than `userAccounts` when the Phase 30 backend flag is enabled.
- Existing PostgreSQL rental-restriction shadow is the source for status-related inherited restriction state.
- `app_member_accounts`, `app_user_member_shadows`, the relevant `app_user_rental_restriction_shadows`, and `app_member_profile_events` record `mirror_state=retired` for a Phase 30 status transaction.
- No Firestore `userAccounts`/`rentalRestrictions` write mirror is executed for the normal Phase 30 status mutation.

## Transitional exception
Legacy rejoined accounts historically stored an immutable `inheritedRestriction` snapshot only in the compatibility `userAccounts` document. When activating such an account and PostgreSQL has no restriction snapshot, Phase 30 performs one narrow Firestore read to recover that snapshot. It does not restore general Firestore member authority.

## Administrator frontend read cutover
When `VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true`:
- member account list, status counts, search, filters and pagination use `/api/admin/members`;
- the Firestore member watcher/count queries are not started;
- PostgreSQL failure is explicit and does not fall back to stale Firestore member data;
- server-side search pagination is not sliced a second time in the browser;
- a successful status mutation explicitly refreshes the PostgreSQL list because the old Firestore `onSnapshot` refresh no longer exists.

## Preserved compatibility
- Member profile edits (name/team/phone) and identity/directory/recovery-key compatibility mirrors.
- Full member-directory audit/profileRequired repair remains Firestore-first with PostgreSQL write-through until the identity-directory cutover.
- Firebase administrator identity proof.
- Site-shell parity compatibility.
- Policy/terms transactional compatibility.
- Account recovery and Firebase password-reset delivery.

## Runtime flags
Heroku:

```text
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
SERVICE_VERSION=phase30
```

Vercel:

```text
VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
```

## Migration
`022_phase30_member_status_restriction_write_mirror_retirement.sql` records the Phase 30 authority contract in `app_runtime_metadata`. No destructive schema change is introduced.

## Diagnostics
The Phase 30 diagnostic section reports backend activation, PostgreSQL member-status source, administrator member-list source/count, retired domains, latest member-status mirror state and restriction authority.

## Staging hotfix after first Phase 30 browser validation
The first Staging validation exposed three migration-boundary defects. They are corrected in the Phase 30 hotfix package and do not expand the intended authority scope.

### 1. User rental-history authoritative response contract
The Phase 29 backend correctly returns `rentalRequestCandidate.source=postgresql-authoritative`, but `clerkStagingClient` still accepted only the older `postgresql-shadow` source value. The browser therefore rejected a valid PostgreSQL response and surfaced `rental-request-postgres-unavailable` while legacy Firestore fallback was disabled.

The client now accepts both `postgresql-shadow` and `postgresql-authoritative`; Phase 29/30 runtime uses the authoritative value.

### 2. Footer-page parity guard
The user footer previously trusted the PostgreSQL footer domain without comparing enabled `footerPages/*` against the Firestore server source. An incomplete legacy site-content sync could therefore display only a subset of configured footer entries.

The footer page read now performs the same transitional server-parity protection already used for home banners and popup posts. It compares enabled page IDs plus `updatedAt`. When PostgreSQL is incomplete or stale, the current page load uses the Firestore server set and reports `site_content_footer_parity_mismatch` / `firestore-parity-fallback`. The query is bounded with `limit(100)`.

### 3. Complete legacy member bootstrap + Phase 30 service wiring
`app_member_accounts` was initially populated from PostgreSQL member shadows, which only covered accounts that had already passed through prior shadow/Clerk flows. Existing Firestore `userAccounts` that had never linked to Clerk were therefore absent from the Phase 30 administrator list.

When the Phase 30 retirement backend is enabled, the first administrator member-list read now:
1. verifies the Firebase administrator identity;
2. checks `app_runtime_metadata.phase30_member_accounts_full_bootstrap`;
3. if not completed, reads the full legacy `userAccounts` collection once using the administrator Firebase token;
4. inserts/refreshes non-authoritative rows in `app_member_accounts` while preserving existing `postgresql-authoritative` rows;
5. records the completed bootstrap state in `app_runtime_metadata` within the same PostgreSQL transaction;
6. serves the administrator list from PostgreSQL.

Subsequent administrator list reads do not repeat the Firestore full-list bootstrap.

The first Staging validation also revealed that `server/src/index.mjs` had not passed `memberStatusRestrictionWriteMirrorDisabled` or `rentalRestrictionRepository` into `createMemberAuthorityService()`. Health diagnostics could therefore report the Phase 30 flag as enabled while the service still used its default compatibility-mirror mode. The server wiring now passes both dependencies explicitly, so successful administrator status mutations report `firestoreMirror=retired` when the Phase 30 backend flag is enabled.

## Administrator post-login route persistence follow-up
A later Phase 30 browser validation confirmed the Phase 30 data cutovers but reproduced the administrator post-login route race: administrator authentication succeeded, but the shell could later return to the user home view.

The previous guard was transient. It became active after administrator authentication but released on the first generic `pointerdown`, `keydown`, or `touchstart`. That meant a later asynchronous Clerk/Firebase role/state reconciliation could still overwrite the route after the guard had been released.

The follow-up hotfix replaces that transient release model with a persistent administrator-route intent stored in `sessionStorage` (`mk_laptop_admin_route_intent`). Administrator authentication writes the intent and the controller continues to enforce `/admin` + administrator view while a persisted administrator session exists. Generic user interaction no longer releases the guard. The intent is cleared only on explicit administrator-to-user navigation or administrator logout/session invalidation. The existing immediate/microtask/animation-frame/150ms/600ms stabilization remains as an initial fast-path, while the persistent intent is the long-lived authority protecting against later asynchronous route races.
