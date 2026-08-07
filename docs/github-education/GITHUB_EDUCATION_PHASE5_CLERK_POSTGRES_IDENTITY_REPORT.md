# GitHub Education Phase 5 - Clerk/PostgreSQL User Identity Mapping

## Baseline
`rental-system-github-education-phase4-clerk-frontend-bridge-20260807-fixed_deployment_package.zip`

## Goal
Persist a stable internal PostgreSQL identity for the already-verified Clerk session user without replacing the existing Firebase authorization/data path.

## Architecture
1. Browser signs in through the existing Phase 4 Clerk Development bridge.
2. Browser sends only the Clerk session JWT in `Authorization: Bearer ...`.
3. Backend verifies the JWT using the existing Phase 3 RS256 public-key boundary.
4. Backend uses the verified Clerk `sub` user ID and server-only `CLERK_SECRET_KEY` to fetch that exact user from Clerk Backend API.
5. Backend normalizes the trusted Clerk profile and upserts `app_user_identities` by unique `clerk_user_id`.
6. No role/admin authorization is migrated in this phase; Firebase remains authoritative for existing application permissions and rental flows.

## New PostgreSQL migration
`server/migrations/002_phase5_clerk_user_identity.sql`

Creates `app_user_identities` with:
- generated internal numeric ID
- unique Clerk user ID
- primary email + verified flag
- display/first/last names
- image URL
- Clerk created/updated timestamps
- synchronization timestamps

No Firebase data is migrated and no existing PostgreSQL table is deleted or rewritten.

## New backend endpoints
- `GET /api/users/me`
  - requires a valid Clerk session JWT
  - returns the existing PostgreSQL identity
  - returns HTTP 404 `profile_not_synced` before first sync
- `POST /api/users/me/sync`
  - requires a valid Clerk session JWT
  - obtains the profile from Clerk Backend API server-to-server
  - upserts by unique `clerk_user_id`
  - never accepts browser-supplied email/name profile fields

## Clerk Backend API secret
Phase 5 introduces one new backend-only configuration value: `CLERK_SECRET_KEY`.
- Staging requires a Development secret beginning `sk_test_`.
- Production is reserved for a future `sk_live_` cutover.
- The secret is never printed by `config:check`, never exposed in API responses, and must never use a `VITE_` prefix.

The API client uses built-in Node `fetch`; no new npm dependency was added.

## Frontend diagnostic extension
The existing `?clerkTest=1` panel now adds:
- Postgres user internal ID
- primary email + verified state
- **Postgres 동기화** button
- **Postgres 조회** button

The panel remains opt-in and only operates when the existing Phase 4 staging environment variables enable the Clerk bridge.

## Security boundaries intentionally preserved
- Existing Firebase Auth/Firestore code is not removed.
- Existing production `gh-pages` and `notebook.recruit.kro.kr` are untouched.
- Browser JWT is not rendered/logged/stored by the diagnostic client.
- Browser profile fields are not trusted for persistence.
- Clerk Secret Key is server-only.
- No application role, admin role, rental entitlement, or authorization decision is derived from the new PostgreSQL row in Phase 5.

## External/manual actions
See `docs/github-education/PHASE5_MANUAL_PLATFORM_ACTIONS.md`.
The required external action before Phase 5 deploy is adding the same Clerk Development instance's `sk_test_...` Secret Key to the existing Heroku staging app as `CLERK_SECRET_KEY`.

## Existing application impact
`src/App.jsx`, Firebase configuration, Firestore rules/indexes, `public/CNAME`, `vercel.json`, and the root `package-lock.json` remain byte-for-byte unchanged from the Phase 4 fixed baseline.
