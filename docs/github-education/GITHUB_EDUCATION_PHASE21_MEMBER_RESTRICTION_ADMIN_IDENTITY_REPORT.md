# Phase 21 - Member / Restriction Authority + Admin Identity Registry Preparation

## Scope

Phase 21 groups the remaining high-value member/account write migration work instead of splitting it into small phases:

- My Page member profile edit: PostgreSQL authoritative, Firestore compatibility mirror.
- Administrator member profile edit: PostgreSQL authoritative, Firestore compatibility mirror.
- Administrator member account status change: PostgreSQL authoritative, Firestore compatibility mirror.
- Restriction writes produced by administrator rental return/user-action processing: PostgreSQL authority state updated after the existing Firestore compatibility commit succeeds.
- Rejoined-member inherited restriction write during account reactivation: PostgreSQL authoritative and Firestore mirrored in the same operation.
- Administrator identities: Firestore `adminAccounts` are synchronized to PostgreSQL `app_admin_identity_registry` as migration preparation.

Administrator authentication itself remains Firebase Auth + `adminAccounts` in this phase. The existing product rule that only an existing administrator registers another administrator is unchanged.

## PostgreSQL

Migration `013_phase21_member_restriction_admin_identity_authority.sql` creates:

- `app_member_accounts`: canonical member profile write authority keyed by Firebase UID, with optional `app_user_id` linkage.
- `app_member_profile_events`: profile/status mutation audit events.
- `app_admin_identity_registry`: administrator identity registry with nullable future `clerk_user_id` and `clerk_link_state`.

It also adds authority/mirror metadata to the existing member/restriction shadow tables so current PostgreSQL read cutovers remain compatible while writes transition.

## APIs

```text
POST /api/users/me/member-profile
POST /api/admin/members/:uid/profile
POST /api/admin/members/:uid/status
POST /api/admin/identity-registry/bootstrap
```

All Phase 21 write APIs are protected by the existing Clerk staging session verification plus a verified Firebase ID token. Self profile writes additionally require the Firebase UID to match the linked Clerk/PostgreSQL user. Administrator endpoints verify the current Firebase UID against `adminAccounts/{uid}` through Security Rules.

## Activation

Phase 21 is Staging opt-in only:

```text
VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED=true
VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED=true
VITE_ADMIN_IDENTITY_REGISTRY_ENABLED=true
```

with explicit session query gates `memberWrite=postgres`, `restrictionWrite=postgres`, and `adminIdentity=postgres`.

Production `gh-pages` behavior is unchanged.
