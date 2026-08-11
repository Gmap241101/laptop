# Phase 31 manual platform actions

## Scope
Phase 31 moves member profile edits and their identity/directory/recovery decisions to PostgreSQL authority and retires the Firestore profile write mirror. Firebase Auth and the remaining signup/reset/terms lifecycle are preserved.

## Heroku staging
Keep the existing Phase 28-30 variables and add:

```text
SERVICE_VERSION=phase31
FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=true
```

Keep:

```text
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
```

Deploy the Phase 31 backend. The release phase must apply:

```text
023_phase31_member_profile_identity_recovery_authority.sql
```

Expected first deployment:

```text
[migration] applying: 023_phase31_member_profile_identity_recovery_authority.sql
[migration] complete; newly applied=1
```

Expected `/health` compatibility values:

```text
memberProfileWriteMirrorDisabled: true
memberProfileSource: postgresql
memberIdentitySource: postgresql
retiredWriteMirrorDomains includes member-profile
retiredWriteMirrorDomains includes member-identity
retiredWriteMirrorDomains includes account-recovery-key
```

No new secret is required.

## Vercel staging/test
Add and redeploy:

```text
VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED=true
```

Keep all prior Phase 9-30 Vercel variables unchanged. No new npm dependency is required.

## Administrator validation URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres&policyContent=postgres&policyContentWrite=postgres&boardContent=postgres&boardWrite=postgres&legacyReadFallback=off&memberProfileAuthority=postgres
```

Required Phase 31 diagnostics:

```text
Member profile identity authority requested: yes
Member profile identity backend applied: yes
Member identity source: postgresql
Phase 31 retired domains: member-profile / member-identity / account-recovery-key
Phase 31 authority error: -
```

Open **회원 계정 관리** and edit a reversible test member name/team/phone value. The edit must persist after leaving/reopening the screen. The profile mutation must report Firestore mirror `retired` rather than `synced`.

Also verify the member-directory administrative save. After saving the directory, the existing Firestore administrative source is preserved, while the backend must synchronize the directory and current `rental-config` version into PostgreSQL so subsequent profile validation remains PostgreSQL-based.

## User validation URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres&policyContent=postgres&boardContent=postgres&legacyReadFallback=off&memberProfileAuthority=postgres
```

Open My Page and change a reversible profile field. Expected behavior:

```text
authority/source: PostgreSQL
profile Firestore mirror: retired
Phase 31 authority error: -
```

Reload My Page and confirm the PostgreSQL value persists.

If possible, test a profile value that would duplicate another active PostgreSQL identity. The backend must reject the conflicting identity rather than accepting it and relying on Firestore claims.

## Regression checks
Confirm Phase 30 remains healthy:

- administrator login stays on `/admin`;
- administrator member list source remains PostgreSQL;
- member-status mirror remains retired;
- user rental history remains `postgresql-authoritative`;
- legacy Firestore rental fallback remains disabled and blocked fallback count stays zero;
- footer parity fallback can still protect an incomplete PostgreSQL footer until site-content data reaches parity.

## Rollback
Set Heroku:

```text
FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=false
```

and Vercel:

```text
VITE_MEMBER_PROFILE_IDENTITY_POSTGRES_AUTHORITY_ENABLED=false
```

then redeploy both. Migration 023 is additive and does not need to be rolled back.

## Protected production resources
Do not change Production Clerk, `gh-pages`, production DNS, or `https://notebook.recruit.kro.kr` during Phase 31.
