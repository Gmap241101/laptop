# Phase 23 Manual Platform Actions

## Vercel - required

Project: `mkrental`
Environment: `Production` for the staging/test Vercel project

Add:

```text
VITE_USER_CLERK_AUTH_ENABLED=true
VITE_USER_CLERK_LIFECYCLE_ENABLED=true
```

Keep all Phase 9-22 values. Save and redeploy because VITE values are build-time.

## Heroku staging - required

Deploy the Phase 23 server source and set:

```text
SERVICE_VERSION=phase23
```

The existing Procfile release phase applies migration 015. No new backend secret is required.

## Clerk Development - no new secret

Keep email/password sign-in enabled. Keep Client Trust enabled. Do not change the production Clerk instance. The existing CLERK_SECRET_KEY is reused by the backend.

## Firebase Console - no new setting

Do not disable Firebase Authentication yet. Do not add a service-account key. No Rules or index change is required by Phase 23.

## GitHub

Apply only to gh-pages-3. Do not change gh-pages.

## DNS

No change.

## Full user validation URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk
```

## Full administrator regression URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk
```

## Full user rollback URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=firebase&userLifecycle=firebase
```
