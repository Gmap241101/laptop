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
