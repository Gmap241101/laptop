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

Applied migrations are immutable. Add a new numbered migration for future schema changes instead of editing an already-applied migration. The current Phase 34 line expects migrations through 027.

## Legacy compatibility

Historical database-key names and migration-era compatibility repositories can remain until a separately approved schema-cleanup phase. They are not an active network authority and must not be re-enabled as runtime fallbacks.

## Validation

Run:

```bash
npm run verify:phase34
```

The verification suite checks migrations, Clerk authentication, PostgreSQL domain flows, user/admin application contracts, external retired-provider runtime access, package integrity, data management, and current Phase 34 regressions.
