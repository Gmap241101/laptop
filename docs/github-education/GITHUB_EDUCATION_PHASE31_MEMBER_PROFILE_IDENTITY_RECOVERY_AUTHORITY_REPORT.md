# GitHub Education Phase 31 — Member Profile Identity / Recovery PostgreSQL Authority

## Objective
Phase 31 moves normal member profile-edit identity, directory-validation, and recovery-key decisions to PostgreSQL authority and retires the Firestore write mirror for **member profile edits**.

The phase deliberately does not remove Firebase Authentication or the remaining account-lifecycle compatibility flows. Signup bootstrap, Firebase password-reset delivery, terms-consent storage, and Firebase compatibility sessions remain for later phases.

## Authority changes
When `FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=true`:

- the current member profile comes from `app_member_accounts`;
- active identity-key ownership conflicts are checked in PostgreSQL;
- the account recovery key remains on the PostgreSQL member account rather than being written to `accountRecoveryKeys` during normal profile edits;
- registered-member directory validation uses PostgreSQL `app_member_directory_entries`;
- rental public member-policy settings are read from the PostgreSQL `rental-config` site-content domain;
- user/admin name, team and phone profile mutations commit to PostgreSQL with `mirror_state=retired`;
- normal profile edits do not read/write Firestore `userAccounts`, `memberIdentityClaims`, or `accountRecoveryKeys` as their runtime source/mirror.

## Member directory authority
Migration 023 creates `app_member_directory_entries`.

The table stores the normalized identity key, directory member id, name, team, order, enabled state and source/sync timestamps. During the staged transition:

1. if PostgreSQL directory bootstrap state is missing or older than the configured directory version, the backend performs an administrator-authorized Firestore directory read and replaces the PostgreSQL directory snapshot;
2. normal member profile validation then uses the PostgreSQL directory;
3. administrator directory saves continue to save the existing Firestore administrative source for compatibility, then synchronize `rental-config` and the member directory into PostgreSQL.

This preserves the current administrator editing surface while moving runtime profile decisions to PostgreSQL.

## Identity/recovery behavior
The existing PostgreSQL active identity-key uniqueness boundary is used to reject conflicting active accounts. The server computes normalized identity/recovery values from the submitted profile and existing account, rather than trusting frontend values.

A successful user/admin profile edit returns:

```text
authority: postgresql
source: postgresql-authoritative
firestoreMirror: retired
identitySource: postgresql
recoverySource: postgresql
```

## Preserved compatibility
Phase 31 intentionally preserves:

- Firebase user/admin compatibility authentication and UID bridge;
- signup Firebase/Firestore bootstrap;
- Firebase password-reset delivery;
- terms consent state/log Firestore storage and transaction checks;
- administrator Firestore member-directory editing as the transitional source that is synchronized into PostgreSQL;
- site-shell parity fallback/write-through;
- the narrow rejoined-account inherited-restriction compatibility snapshot fallback from Phase 30.

## Runtime flags
Heroku:

```text
SERVICE_VERSION=phase31
FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=true
```

Keep prior Phase 28-30 retirement flags enabled.

Vercel:

```text
VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED=true
```

## Migration
`023_phase31_member_profile_identity_recovery_authority.sql` creates the PostgreSQL member-directory table and records the Phase 31 runtime contract in `app_runtime_metadata`. It does not remove legacy Firebase/Firestore data.

## Diagnostics
The Phase 31 diagnostic section reports:

```text
Member profile identity authority requested
Member profile identity backend applied
Member identity source
Phase 31 retired domains
Last profile edit mirror
Phase 31 authority error
```

Expected enabled values are PostgreSQL authority with retired domains `member-profile / member-identity / account-recovery-key` and no authority error.
