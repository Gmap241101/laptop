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

## 2026-08-10 administrator session race hotfix

Actual Phase 23 staging validation exposed a frontend-only administrator session race after successful Clerk Client Trust verification. Clerk and Firebase both remained signed in, but the administrator login card returned because the local administrator app session could be invalidated while the Firebase `adminAccounts/{uid}` role lookup was still transiently unresolved.

The invalidation effect now waits for `currentAuthRoleReady` before treating a missing `currentAuthAdminAccount` as an invalid administrator session, and it reacts to the resolved current administrator account. This preserves the existing Clerk + PostgreSQL administrator authority and Firebase compatibility credential while preventing a transient role-loading `null` from clearing a freshly established administrator app session.

No backend API, migration, Firestore path, Clerk policy, environment variable, or Production setting changed in this hotfix.

## 2026-08-10 user pending-login session + administrator post-login route hotfix

Actual staging revalidation exposed two additional frontend-only routing/session races:

1. During a Phase 23 normal-user Clerk Client Trust flow, Firebase compatibility authentication can exist before the application user session is committed. The legacy session-expiry effect interpreted that intentional intermediate `/login` state as a missing app session and signed the Firebase user out with the message `로그인 세션 정보를 확인할 수 없어 다시 로그인이 필요합니다.`
2. Successful administrator authentication committed the Clerk/Firebase/PostgreSQL authority and local administrator session but did not explicitly commit the SPA route/view to `/admin`. If another route update occurred during the authentication transition, the administrator could land on the normal-user home even though administrator authentication had succeeded; browser Back exposed the already-authenticated administrator workspace.

The normal-user session-expiry effect now preserves a missing local app session only when Phase 23 Clerk user authority is requested and the browser is still on `/login`, which is the expected Client Trust / login-completion boundary. Legacy Firebase-only behavior outside that boundary is unchanged. Once navigation leaves `/login`, a missing or mismatched app session is still invalidated normally.

The administrator finalization path now explicitly commits `dashboard`, `/admin`, and `view='admin'` immediately after the authenticated administrator session is saved. No Clerk, PostgreSQL, Firebase, backend, migration, Rules, environment-variable, or Production authority policy is relaxed by this hotfix.

## 2026-08-10 persisted user-session recovery + administrator diagnostic-noise hotfix

Actual staging revalidation showed that the normal-user missing-session toast could still occur after Clerk authentication had completed and navigation had already left `/login`. The previous guard only protected the intentional `/login` compatibility interval. `saveUserAuthSession()` writes the valid application session to browser storage synchronously, but React state propagation can lag by one render. During that render, the session-expiry effect could see a Firebase user plus a stale empty `userAuthSessionUid` and invalidate the already-persisted valid session.

The user session controller now re-reads the persisted application session before expiring a UID-missing/mismatched in-memory session. If the persisted session belongs to the same Firebase UID and its policy version still matches the active user-security policy, it is re-applied to React state and no logout occurs. If the persisted policy version is stale, the existing security-policy reauthentication behavior remains enforced. If no valid persisted session exists, the previous Phase 23 `/login` pending-Client-Trust guard and normal invalidation rules remain unchanged.

Administrator staging diagnostics also briefly showed normal-user-only legacy member errors (`member_shadow_not_found` and `The application Firestore member profile has not been observed yet.`). Those conditions are expected for an administrator identity with no normal-user member shadow. The diagnostic client now treats a 404 `member_shadow_not_found` comparison as not-applicable, the parity action quietly no-ops when no application member profile has been observed, and the member comparison/parity controls stay disabled until their prerequisite observations exist. This changes diagnostic presentation only; administrator Clerk/PostgreSQL/Firebase authority is unchanged.

No backend API, PostgreSQL migration, Firestore Rules/index, authentication policy, environment variable, npm dependency, or Production configuration changed in this hotfix.


## 2026-08-10 user auth transition null-state hotfix

- Added an explicit `mk_laptop_user_auth_transition` session marker for the Phase 23 Firebase compatibility -> Clerk -> PostgreSQL login transaction.
- Firebase `onAuthStateChanged(null)` no longer deletes the application user session while that bounded login transaction is active.
- The transition is bound to the Firebase UID, remains pending across Clerk Client Trust verification, and becomes completed only after application account finalization retains a user session.
- The user session controller may restore a completed transition only for the same Firebase UID; normal policy-version, idle-timeout, absolute-timeout, inactive-member, and logout checks remain unchanged.
- Failed/non-retryable authentication and explicit logout clear the transition marker.
