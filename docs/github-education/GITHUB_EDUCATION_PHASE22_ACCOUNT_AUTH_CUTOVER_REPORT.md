# Phase 22 - Account Recovery PostgreSQL Read + Administrator Clerk Authentication Cutover

## Scope

Phase 22 advances the account/authentication domain without prematurely removing compatibility mechanisms that are still required by Firestore Rules and Firebase password-reset/re-authentication flows.

Included in this phase:

- Email lookup and password-reset identity verification: PostgreSQL-preferred read with explicit Firestore compatibility fallback.
- Administrator actual authentication authority: Clerk + PostgreSQL `app_admin_identity_registry`.
- Existing Firebase administrators: authenticated migration/link to Clerk on the first Phase 22 administrator login when no valid Clerk link exists.
- Firebase administrator session: retained only as a compatibility credential for existing Firestore administrator paths during the staged cutover.
- Administrator creation: existing-administrator-only flow provisions both Firebase compatibility identity and Clerk identity, then links the PostgreSQL registry.
- Administrator password self-change: synchronizes Firebase compatibility password and Clerk password.
- Other-administrator password reset mail: remains Firebase compatibility delivery; the next authenticated login synchronizes/migrates Clerk authority.
- Administrator deletion: PostgreSQL registry retirement remains the authorization gate, so a stale Clerk identity cannot obtain administrator authority.
- Diagnostic UI: self member-profile mutation now identifies `user-profile-edit`; the staging diagnostics panel starts lower to avoid the toast area.

Explicitly not removed in Phase 22:

- normal-user Firebase signup transaction,
- normal-user Firebase password reset delivery,
- My Page Firebase reauthentication/withdrawal transaction,
- Firebase compatibility identity/session required by legacy Firestore Rules,
- Firestore compatibility mirrors/fallbacks.

## PostgreSQL

Migration `014_phase22_account_recovery_admin_clerk_auth.sql`:

- adds administrator auth-authority/link/verification timestamps to `app_admin_identity_registry`,
- enforces a unique linked Clerk user ID for administrator registry rows,
- adds active member recovery-key uniqueness and recovery lookup index on `app_member_accounts`,
- records the Phase 22 staged authority contract in `app_runtime_metadata`.

## Backend APIs

```text
POST /api/account-recovery/email
POST /api/account-recovery/password-reset/verify
GET  /api/admin/auth/session
POST /api/admin/auth/migrate
POST /api/admin/identity-registry/:uid/provision
```

`/api/admin/auth/session` requires a valid Clerk staging session and an active linked PostgreSQL administrator registry row.

`/api/admin/auth/migrate` is the controlled bootstrap path for an existing Firebase administrator. It requires a verified Firebase ID token plus the existing administrator Firestore proof before creating/updating and linking the Clerk identity.

`/api/admin/identity-registry/:uid/provision` requires both the actor's valid Clerk session and Firebase compatibility administrator proof. Owner administrator provisioning remains owner-only; normal existing administrators may provision normal administrator accounts through the existing Administrator ID Management flow.

## Clerk compatibility policy

New administrator provisioning follows the current Clerk password requirement enforced by Phase 22 code: minimum 8 characters. Existing verified Firebase administrator migration may use the migration password-check bypass so a valid legacy password is not blocked solely by a newer Clerk password policy.

Clerk public/private metadata is updated through the dedicated Backend API metadata endpoint. Administrator authorization does not trust metadata alone; the active PostgreSQL registry link is required.

## Frontend activation

Vercel variables:

```text
VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED=true
VITE_ADMIN_CLERK_AUTH_ENABLED=true
```

Session/query activation:

```text
accountRecovery=postgres
adminAuth=clerk
```

Rollback:

```text
accountRecovery=firestore
adminAuth=firebase
```

Production `gh-pages`, Production DNS and Production Clerk remain untouched.

## Administrator migration security boundary

The bootstrap migration endpoint does not accept an arbitrary old Firebase administrator token. The verified Firebase ID token must contain a recent authentication time within five minutes. This matches the intended login flow, where the administrator has just completed Firebase password authentication before the Clerk migration/link is attempted. The normal post-migration administrator session then requires the Clerk session plus the active PostgreSQL registry link.
