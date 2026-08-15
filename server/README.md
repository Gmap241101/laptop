# Rental API - Phase 34 current runtime

## Current authority

- Authentication: Clerk
- Application data: PostgreSQL
- Administrator registry and security policy: PostgreSQL
- Rental requests, assets, members, boards, site content, policy content, and data-management operations: PostgreSQL
- Runtime server entry: `server/src/index.mjs`
- Main HTTP application: `server/src/app.mjs`

## Deployment

Heroku runs the Node.js API with `DATABASE_URL` and Clerk server credentials. Vercel serves the separate user and administrator frontend documents.

## Migrations

Applied migrations are immutable. Add a new numbered migration for future schema changes instead of editing an already-applied migration. The current Phase 34 line expects migrations through 028. Migration 028 consolidates duplicate legacy PostgreSQL storage into the current canonical tables/documents and removes the obsolete member/rental-request shadow tables only after counterpart verification.

## Legacy compatibility

Historical database-key names and migration-era compatibility repositories can remain until a separately approved schema-cleanup phase. They are not an active network authority and must not be re-enabled as runtime fallbacks.

## Validation

Run:

```bash
npm run verify:phase34
```

The verification suite checks migrations, Clerk authentication, PostgreSQL domain flows, user/admin application contracts, external retired-provider runtime access, package integrity, data management, and current Phase 34 regressions.

## Clerk Device Trust administrator control

The administrator **Account Security Settings** page can read and change the live Clerk Device Trust setting for the shared Clerk instance. This controls whether both user and administrator password sign-ins can be challenged for new-device verification.

The feature uses Clerk Platform API credentials on the Heroku server. These values are optional at server startup so the rest of the application can run without Platform API access, but the Device Trust control is read-only until all required values are configured:

```text
CLERK_PLATFORM_API_KEY=ak_...
CLERK_APPLICATION_ID=app_...
CLERK_INSTANCE_ID=ins_...
```

Optional overrides:

```text
CLERK_PLATFORM_API_URL=https://api.clerk.com
CLERK_PLATFORM_API_TIMEOUT_MS=8000
```

Do not expose the Platform API key to Vercel/browser environment variables. The browser calls the authenticated rental API, and the Heroku server performs the Clerk Platform API request.
