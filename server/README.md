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

Applied migrations are immutable. Add a new numbered migration for future schema changes instead of editing an already-applied migration. The current Phase 34 line expects migrations through 036. Migration 028 consolidates the first duplicate legacy PostgreSQL stores into canonical tables/documents. Migration 029 performs the final verified physical cleanup: it moves rental restrictions into `app_rental_restrictions`, migrates any legacy rental-config borrower copy into `app_member_directory_entries`, removes obsolete sync/shadow tables, strips duplicate signup-term body copies, and derives status from canonical tables/views. Each destructive step is guarded by counterpart verification and the migration runner transaction.

## Legacy compatibility

Historical migration files remain immutable, but the live schema after migration 029 must not retain the retired duplicate/shadow/sync stores. Compatibility identity fields such as `firebase_uid` and `app_user_firebase_links` remain because they still bridge historical identities to the Clerk/PostgreSQL account authority; they are not an external Firebase runtime authority.

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

Migration 036 adds secure-attachment file-size metadata and atomic successful-download counters without exposing external target URLs. Existing attachment counts start at zero; file size is populated by safe metadata probing for new/changed URLs or by the first successful proxied download.
