# Phase 24 Manual Platform Actions

## Vercel — required

Project: `mkrental`
Environment: `Production` for this staging/test Vercel project.

Add:

```text
VITE_SITE_CONTENT_POSTGRES_READ_ENABLED=true
VITE_SITE_CONTENT_WRITE_THROUGH_ENABLED=true
```

Keep all Phase 9-23 values. Save and redeploy because `VITE_*` values are build-time.

## Heroku staging — required

Deploy the Phase 24 server source and set:

```text
SERVICE_VERSION=phase24
```

The existing Procfile release phase applies migration 016. No new backend secret is required.

## Clerk Development

No new setting or secret. Keep the existing Development instance and Client Trust settings.

## Firebase Console

No new setting. Do not disable Firebase Authentication. No Rules or index change is required. Do not add a Firebase Admin service-account private key.

## GitHub

Apply only to `gh-pages-3`. Do not change `gh-pages`.

## DNS

No change.

## Full administrator Phase 24 validation URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres
```

After administrator authentication, use `Site content 전체 동기화` in the diagnostics panel once before validating public PostgreSQL reads.

## Full user Phase 24 validation URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres
```

## Full administrator rollback URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=firestore&siteContentWrite=firestore
```

## Full user rollback URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=firestore
```
