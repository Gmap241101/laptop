# Phase 23 - User Clerk Authentication and Account Lifecycle Authority

## Scope

Phase 23 moves the final application-level authority for normal-user sign-in, password verification/change, and withdrawal to Clerk plus PostgreSQL while retaining Firebase Authentication only as a staged compatibility credential for Firestore Security Rules and remaining Firebase-dependent flows.

The Phase 22 administrator Clerk authority remains unchanged. System configuration and low-change content migration are deliberately deferred to the next large phase so that the authentication rollback boundary stays isolated and testable.

## Authority model

- User sign-in authority: Clerk session plus active PostgreSQL member account.
- Firebase Authentication: compatibility session only while current Firestore paths still require Firebase ID tokens.
- Existing-user migration: requires a fresh Firebase password authentication proof before a Clerk identity can be created or relinked.
- New signup: the existing Firebase plus Firestore atomic signup transaction is preserved as bootstrap; Clerk provisioning occurs after the committed transaction. A post-commit Clerk failure does not delete a successfully created account and is repairable on the next sign-in migration.
- Password change: Firebase compatibility password is changed first and Clerk authority second. If the Clerk authority update fails, the frontend attempts to restore the previous Firebase password.
- Withdrawal: PostgreSQL retired state is authoritative. Clerk deletion and Firebase user deletion are cleanup operations after retirement authority is committed. A temporary Clerk deletion failure is recorded as delete-pending rather than reactivating the account.
- Password-reset delivery remains on Firebase Authentication in this phase.

## PostgreSQL migration

Migration 015 extends app_member_accounts with staged authentication/lifecycle authority and cleanup-state fields. It does not modify prior migrations.

## API surface

- GET /api/users/auth/session
- POST /api/users/auth/migrate
- POST /api/users/auth/provision
- POST /api/users/me/password/verify
- POST /api/users/me/password/change
- POST /api/users/me/withdrawal/finalize

## Frontend cutover flags

- VITE_USER_CLERK_AUTH_ENABLED=true
- VITE_USER_CLERK_LIFECYCLE_ENABLED=true
- userAuth=clerk
- userLifecycle=clerk

Rollback latches remain userAuth=firebase and userLifecycle=firebase.

## Compatibility retained

- Firebase Authentication compatibility session
- Firestore Rules compatibility access
- Firebase password-reset delivery
- existing Firestore signup/retirement transaction documents
- existing domain Firestore compatibility mirrors

No Firebase Admin service account or Rules bypass is introduced.

## Production protection

This phase is for gh-pages-3, mkrental Vercel staging/test, Heroku staging, and Clerk Development only. gh-pages, the production site, production DNS, and production Clerk are not part of this phase.
