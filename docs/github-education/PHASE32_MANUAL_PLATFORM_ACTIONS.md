# Phase 32 manual platform actions

## Scope
Phase 32 moves signup data bootstrap and terms-consent state/log/access-control authority to PostgreSQL. Firebase Auth remains a temporary compatibility identity/session and still delivers password-reset emails.

## Heroku staging
Keep all previous retirement variables and add/update:

```text
SERVICE_VERSION=phase32
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
```

Keep:

```text
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=true
```

Deploy the Phase 32 backend. The release phase must apply:

```text
024_phase32_account_lifecycle_postgresql_authority.sql
```

Expected first deployment:

```text
[migration] applying: 024_phase32_account_lifecycle_postgresql_authority.sql
[migration] complete; newly applied=1
```

Expected `/health` compatibility values:

```text
accountLifecycleCompatibilityDisabled: true
signupProfileSource: postgresql
termsConsentSource: postgresql
passwordResetDelivery: firebase-auth-compatibility-preserved
```

No new secret is required.

## Vercel staging/test
Add and redeploy:

```text
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=true
```

Keep all previous Phase variables unchanged. No new npm dependency is required.

## Administrator validation URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres&policyContent=postgres&policyContentWrite=postgres&boardContent=postgres&boardWrite=postgres&legacyReadFallback=off&memberProfileAuthority=postgres&accountLifecycle=postgres
```

Required Phase 32 diagnostics:

```text
Account lifecycle authority requested: yes
Account lifecycle backend applied: yes
Signup profile source: postgresql
Terms consent source: postgresql
Password reset delivery: firebase-auth-compatibility-preserved
Phase 32 authority error: -
```

Confirm administrator login remains persistently on `/admin`, member-account management remains PostgreSQL-based, and prior member/rental/asset/board regressions remain healthy.

## Existing-user terms migration test
Use an existing normal user that already has consent history.

1. Sign in and open a protected user page or My Page terms section.
2. On the first Phase 32 load, the backend may perform the one-time Firestore server import.
3. Existing consent decisions/history must still appear.
4. The diagnostics may report `Terms consent legacy bootstrap: imported` on that first migration.
5. Reload/relogin; the same data must come from PostgreSQL without requiring another legacy import.
6. Change an optional consent decision, save, reload, and confirm it persists.

Expected terms mutation:

```text
Terms consent source: postgresql
Terms consent mirror: retired
Phase 32 authority error: -
```

If a policy revision requires re-consent, the protected-route gate must use PostgreSQL state. After saving the required decisions, the gate must clear immediately without relying on the Firestore policy watcher.

## Disposable signup validation
Use a disposable staging account that can be safely removed later.

Expected Phase 32 flow:

```text
Firebase Auth compatibility UID created
PostgreSQL signup bootstrap committed
Clerk identity provisioned from PostgreSQL member profile
```

The new member must appear in PostgreSQL-backed administrator member management. Normal Phase 32 signup must not depend on Firestore `userAccounts`/identity/recovery/consent documents as its data bootstrap.

## Password reset regression
Password reset is intentionally **not** Clerk-only in Phase 32.

Confirm the existing reset flow still sends a Firebase Auth password-reset email after PostgreSQL identity verification. Diagnostics must say:

```text
Password reset delivery: firebase-auth-compatibility-preserved
```

This is expected and should not be reported as a Phase 32 failure.

## User validation URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres&policyContent=postgres&boardContent=postgres&legacyReadFallback=off&memberProfileAuthority=postgres&accountLifecycle=postgres
```

Regression expectations:

- rental history remains `postgresql-authoritative`;
- legacy Firestore read fallback stays disabled with blocked attempts 0;
- profile edit mirror remains retired;
- assets and boards remain PostgreSQL;
- footer/home/popup may still use the existing site-shell parity fallback when PostgreSQL content is incomplete.

## Rollback
Set Heroku:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=false
```

and Vercel:

```text
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=false
```

then redeploy. Query `accountLifecycle=firebase` also clears the frontend latch for rollback testing. Migration 024 is additive and does not need to be rolled back.

## Protected production resources
Do not change Production Clerk, `gh-pages`, production DNS, or `https://notebook.recruit.kro.kr` during Phase 32.

## Phase 32 authority source-of-truth + administrator route hotfix

The previous diagnostics-only health retry did not resolve the actual Staging discrepancy. This follow-up changes both backend runtime enforcement and frontend routing/diagnostics.

### Why this hotfix requires both deployments

The previous backend exposed the Phase 32 PostgreSQL signup/terms endpoints even when:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=false
```

while `/health` correctly reported the flag as disabled. User terms/signup code could also publish `backendApplied: true` from an operation path without deriving it from the backend compatibility contract. That allowed user diagnostics and administrator diagnostics to disagree.

The hotfix now enforces one authority chain:

```text
Heroku Config Var
-> server config
-> accountLifecycleService authorityEnabled
-> Phase 32 API availability
-> API compatibility payload
-> frontend observation
-> diagnostics
```

When the Heroku authority flag is false, Phase 32 PostgreSQL signup/terms methods now fail closed with:

```text
account_lifecycle_authority_disabled
HTTP 503
```

They no longer execute PostgreSQL account-lifecycle mutations under a backend contract that says the authority is disabled.

### Heroku Staging action — REQUIRED

Confirm:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
SERVICE_VERSION=phase32
```

Then redeploy/restart the Heroku Staging backend with this hotfix source. No new migration is required; migration `024_phase32_account_lifecycle_postgresql_authority.sql` remains unchanged.

After deployment, `/health` must report:

```text
accountLifecycleCompatibilityDisabled: true
signupProfileSource: postgresql
termsConsentSource: postgresql
passwordResetDelivery: firebase-auth-compatibility-preserved
```

### Vercel Staging action — REQUIRED

Confirm:

```text
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=true
```

Deploy the same hotfix package to the `gh-pages-3` staging source / `mkrental.vercel.app` project.

The frontend now derives `backendApplied`, signup source, terms source, and password-reset delivery from the backend `compatibility` payload instead of hardcoding successful authority observations.

### Administrator route persistence contract

The persistent session key remains:

```text
mk_laptop_admin_route_intent=1
```

While it is present:

- generic user-route `pushState` / `replaceState` writers are forced to `/admin`;
- browser `popstate` that resolves to a user route is restored to `/admin`;
- asynchronous user controllers cannot replace the admin pathname during the authenticated admin route intent;
- explicit administrator-to-user navigation clears the intent first;
- administrator logout/session invalidation clears the intent.

Validate after deployment:

```text
/admin?... -> administrator login -> /admin
wait at least 10 seconds -> /admin
open multiple administrator menus -> /admin
repeat logout/login 2-3 times -> /admin
```

Only an explicit user-screen transition or administrator logout/session loss should release the route intent.

### Expected Phase 32 diagnostics after both deployments

```text
Account lifecycle authority requested: yes
Account lifecycle backend applied: yes
Signup profile source: postgresql
Signup Firestore bootstrap: retired (after an actual Phase 32 signup operation) or - before one
Terms consent source: postgresql
Terms consent Firestore mirror: retired (after a terms operation) or - before one
Password reset delivery: firebase-auth-compatibility-preserved
Phase 32 authority error: -
```

If `/health` still reports the disabled compatibility contract, do not treat the frontend as PASS. Re-check the Heroku Staging Config Var and deployed backend revision.

### No changes required

No new Clerk setting, Firebase Rule, Firestore index, DNS change, Production resource change, npm dependency, or PostgreSQL migration is required for this hotfix.

## New-signup PostgreSQL runtime read-model hotfix

After the authority source-of-truth hotfix, a real new-user signup exposed a separate PostgreSQL initialization gap. The canonical signup row existed in `app_member_accounts`, but earlier user runtime endpoints still read `app_user_member_shadows` and `app_user_rental_restriction_shadows`. Because Phase 32 correctly retires Firestore signup bootstrap, those PostgreSQL read-model rows were never created for a brand-new account.

### Heroku Staging action — REQUIRED

Deploy/restart the backend from this hotfix package. No new environment variable or migration is required.

Keep:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
SERVICE_VERSION=phase32
```

### Vercel Staging action

No frontend runtime file changed in this hotfix, so a Vercel redeploy is not functionally required. If the normal deployment workflow republishes `gh-pages-3` anyway, that is acceptable; no new Vercel environment value is required.

### Existing failed test account self-heal

The account that already failed before this hotfix does **not** need to be recreated. After the Heroku backend is deployed:

1. Log the user out.
2. Log the same approved account back in.
3. The verified Clerk session path will materialize the missing PostgreSQL member read model and default no-restriction read model from `app_member_accounts`.
4. Open My Page and confirm the profile loads.
5. Open a user page that evaluates rental restrictions and confirm the legacy fallback error no longer appears.

### Safety rule

The default `restriction_exists=false` row is created only for PostgreSQL account-lifecycle accounts (`lifecycle_authority_mode=postgresql-authoritative` plus completed Phase 32 terms bootstrap). Existing `restriction_exists=true` rows are never overwritten. Do not manually delete or reset restriction rows as part of this hotfix.

### Fresh signup regression test

Create one disposable staging user after backend deployment:

```text
signup
-> PostgreSQL app_member_accounts
-> Clerk provision/link
-> PostgreSQL member read-model materialization
-> PostgreSQL default no-restriction read-model materialization
-> administrator approval
-> user login
```

Expected after login:

```text
member profile read: PostgreSQL success
rental restriction read: PostgreSQL success (exists=false when no restriction applies)
legacy Firestore fallback: remains disabled
```

Do not enable Firestore fallback to make this test pass.

## Approval-status and authoritative rental-read hotfix

A second Staging regression showed two remaining legacy gates after the new-signup read-model fix.

### Required deployments

This hotfix changes both runtime surfaces:

```text
Heroku Staging backend: redeploy REQUIRED
Vercel Staging frontend: redeploy REQUIRED
PostgreSQL migration: none
new Heroku/Vercel env: none
```

Keep the existing Phase 32 flags, including:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=true
VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

### Why newly approved accounts were immediately logged out

Administrator approval has been PostgreSQL-authoritative since Phase 30, so Firestore `userAccounts.status` can intentionally remain `pending`. The user login finalizer must therefore use the `memberStatus` returned by `/api/users/auth/session` (PostgreSQL/Clerk authority) instead of the stale Firestore status.

Expected after approval:

```text
PostgreSQL member status: active
Clerk session verification: active
Firebase compatibility session: preserved
login session: remains signed in
```

Do not restore the Firestore member-status mirror to fix this.

### Why converted users could fail My Rental Requests

The PostgreSQL authoritative rental endpoint must read `app_rental_requests` without requiring the legacy `app_user_member_shadows` row first. Legacy member shadow remains required only for compatibility Firestore sync/compare paths.

Do not re-enable rental-request Firestore fallback or legacy shadow sync.

### Retest sequence

Existing converted account:

```text
login
-> My Rental Requests
-> PostgreSQL candidate succeeds
-> no legacy Firestore fallback error
```

New Phase 32 account:

```text
signup pending
-> administrator approval
-> PostgreSQL member status active
-> user login
-> wait 30+ seconds
-> navigate rental / My Page / My Rental Requests
-> session remains signed in
-> logout/login repeat
```

The full frontend must be redeployed for the approval-status fix; a backend-only restart is not sufficient for this revision.
