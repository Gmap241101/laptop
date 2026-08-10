# Phase 25 Manual Platform Actions

## Vercel — required

Project: `mkrental`
Environment: `Production` for this staging/test Vercel project.

Add:

```text
VITE_POLICY_CONTENT_POSTGRES_READ_ENABLED=true
VITE_POLICY_CONTENT_WRITE_THROUGH_ENABLED=true
```

Keep all Phase 9-24 values. Save and redeploy because `VITE_*` values are build-time.

## Heroku staging — required

Deploy the Phase 25 server source and set:

```text
SERVICE_VERSION=phase25
```

Migration 017 records the Phase 25 runtime contract. No new backend secret is required.

## Clerk Development

No new setting or secret. Keep Client Trust enabled.

## Firebase Console

No new setting. Firebase Auth, Firestore Rules and indexes remain unchanged. Transaction-time reads of `rentalSystem/publicConfig`, signup terms policy validation, consent states and consent logs remain Firestore-authoritative in this phase.

## GitHub

Apply only to `gh-pages-3`. Do not change `gh-pages`.

## DNS

No change.

## Administrator bootstrap

Open the full administrator URL, log in, confirm that the page remains on `/admin`, then click `Policy content 전체 동기화` once. Expected diagnostics:

```text
Policy content PostgreSQL requested: yes
Policy content write-through requested: yes
Policy content last domain: all
Policy content PostgreSQL sync: synced
Policy content error: -
```

## Full administrator Phase 25 validation URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres&policyContent=postgres&policyContentWrite=postgres
```

## Full user Phase 25 validation URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres&policyContent=postgres
```

## Full administrator rollback URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres&policyContent=firestore&policyContentWrite=firestore
```

## Full user rollback URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres&policyContent=firestore
```
