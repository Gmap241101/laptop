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
