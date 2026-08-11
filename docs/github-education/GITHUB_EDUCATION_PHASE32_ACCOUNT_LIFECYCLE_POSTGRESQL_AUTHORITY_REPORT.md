# GitHub Education Phase 32 — Signup / Terms Consent PostgreSQL Account Lifecycle Authority

## Objective
Phase 32 moves the remaining **signup data bootstrap** and **terms-consent state/log runtime authority** from Firestore to PostgreSQL while preserving Firebase Authentication as a temporary compatibility identity/session layer.

The phase deliberately does **not** switch password-reset delivery to Clerk-only yet. Firebase Auth compatibility is still active, so changing only the Clerk password would create a split-password condition. Password-reset delivery therefore remains Firebase Auth compatibility until the Firebase Auth session itself is retired in a later phase.

## Authority changes
When `FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true`:

- Firebase Auth may still create the temporary compatibility UID during signup;
- signup member/profile, identity/recovery keys, member status, and consent records are created in PostgreSQL;
- signup no longer creates Firestore `userAccounts`, `memberIdentityClaims`, `accountRecoveryKeys`, `userTermConsentStates`, or `userTermConsentLogs` as its normal data bootstrap;
- the subsequent Clerk provision resolves the member profile from PostgreSQL instead of Firestore `userAccounts`;
- terms-consent policy is read from the PostgreSQL `terms` site-content domain;
- terms-consent state/log reads and writes use PostgreSQL;
- protected-route terms compliance also uses the PostgreSQL terms endpoint rather than the Firestore policy watcher;
- a successful terms save records `firestoreMirror=retired` and the protected-route gate re-reads PostgreSQL immediately;
- account-recovery identity matching remains PostgreSQL authoritative from the earlier account-recovery cutover.

## Existing-member terms migration
Existing members may already have Firestore consent states/logs. Phase 32 preserves them through a **one-time trusted server import**:

1. PostgreSQL checks `terms_consent_bootstrap_completed_at` on the member account;
2. when missing, the authenticated backend verifies the Clerk-linked Firebase compatibility UID;
3. the backend reads only that user's Firestore consent states/logs through Firebase REST;
4. the legacy records are imported into `app_user_term_consent_states` and `app_user_term_consent_logs`;
5. the PostgreSQL member consent revision is advanced to the imported policy revision when appropriate;
6. `terms_consent_bootstrap_completed_at` is recorded;
7. subsequent consent reads no longer perform the legacy Firestore import.

The client does not trust arbitrary legacy consent payloads supplied by the browser.

## PostgreSQL schema
Migration 024 adds consent bootstrap/completion timestamps to `app_member_accounts` and creates:

- `app_user_term_consent_states`
- `app_user_term_consent_logs`

Consent-log IDs are text so old Firestore document IDs can be preserved during the one-time import.

## Signup transaction
The Phase 32 signup flow is:

```text
Firebase Auth compatibility identity
        ↓
PostgreSQL registered-member directory / identity collision checks
        ↓
PostgreSQL member account + recovery/identity fields + consent states/logs
        ↓
Clerk user provision using the PostgreSQL member profile
```

A successful backend signup response reports:

```text
source: postgresql
authority: postgresql
firestoreBootstrap: retired
```

If PostgreSQL signup fails before the canonical commit, the temporary Firebase Auth user can still be rolled back. Once the PostgreSQL account is committed, it is treated as the canonical member record.

## Password reset safety boundary
Phase 32 intentionally preserves:

```text
passwordResetDelivery: firebase-auth-compatibility-preserved
```

Email lookup/password-reset identity verification continues to use PostgreSQL account-recovery data, but the actual reset-mail delivery remains Firebase `sendPasswordResetEmail` until Firebase Auth compatibility is removed as a whole.

## Preserved compatibility
Phase 32 still preserves:

- Firebase Auth user/admin compatibility sessions and Firebase UID bridge;
- Firebase password-reset delivery;
- legacy signup/terms Firestore paths only as rollback code when the Phase 32 flag is disabled;
- site-shell PostgreSQL parity fallback/write-through where content parity is not yet complete;
- Firebase/Firestore platform code required by the remaining compatibility layers.

## Runtime flags
Heroku:

```text
SERVICE_VERSION=phase32
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
```

Keep all earlier retirement flags enabled.

Vercel:

```text
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=true
```

Query opt-in:

```text
accountLifecycle=postgres
```

Rollback query:

```text
accountLifecycle=firebase
```

## Diagnostics
The Phase 32 diagnostic section reports:

```text
Account lifecycle authority requested
Account lifecycle backend applied
Signup profile source
Signup Firestore bootstrap
Terms consent source
Terms consent mirror
Terms consent legacy bootstrap
Password reset delivery
Phase 32 authority error
```

Expected runtime authority is PostgreSQL for signup/terms, with Firebase password-reset delivery explicitly preserved.
