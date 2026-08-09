# Phase 21 manual platform actions

## Vercel / mkrental

Environment: **Production**.

Add:

```text
VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED=true
VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED=true
VITE_ADMIN_IDENTITY_REGISTRY_ENABLED=true
```

Keep every Phase 9-20 staging variable already configured. Redeploy after saving because Vite reads `VITE_*` values at build time.

Do not expose backend secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, Firebase service-account private keys) through `VITE_*`.

## Heroku

No new secret is required. Deploy the Phase 21 server source so Release Phase can apply:

```text
013_phase21_member_restriction_admin_identity_authority.sql
```

Recommended diagnostic marker:

```text
SERVICE_VERSION=phase21
```

Existing `DATABASE_URL`, Clerk Development keys/public key, Firebase project ID and Firestore REST timeout remain unchanged.

## Clerk

No dashboard change in Phase 21. The current Development instance remains in use.

Phase 21 does **not** switch administrator login to Clerk. It creates/synchronizes a PostgreSQL administrator identity registry so the later administrator-auth migration can link Clerk identities without changing the existing rule that a new administrator is registered by an existing administrator.

## Firebase Console

No Rules, index or Auth configuration change is required. Firebase Auth / `adminAccounts` remains the administrator authentication authority for this phase, and PostgreSQL writes keep a Firestore compatibility mirror using the caller's verified Firebase token.

## GitHub / DNS

Deploy `gh-pages-3` only. Do not publish `gh-pages` or change Production DNS.
