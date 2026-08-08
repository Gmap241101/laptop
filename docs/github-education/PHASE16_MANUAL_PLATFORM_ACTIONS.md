# Phase 16 manual platform actions

## Vercel
Project: `mkrental`
Environment: `Production`

Add:

```text
VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED=true
```

Keep all Phase 15 rental-request read variables enabled. Because `VITE_*` values are build-time values, create a new Vercel deployment after saving.

Do not place `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or Firebase private keys in Vercel frontend environment variables.

## Heroku
No new secret is required.

Recommended diagnostic value:

```text
SERVICE_VERSION=phase16
```

Migration `008_phase16_rental_request_authoritative_write.sql` is executed by the existing Procfile Release Phase. A migration failure must prevent a successful release.

## Clerk
Additional configuration: none. Continue to use the same Clerk Development instance (`pk_test_`, `sk_test_`).

## Firebase Console
Additional configuration: none. No Firestore Rules/index change and no Firebase Admin private key are required.

## GitHub
Additional configuration: none. Deploy only `gh-pages-3`. Do not publish `gh-pages`.

## DNS
Additional configuration: none. Do not change the Production domain/DNS.
