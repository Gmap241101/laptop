# Rental API - Phase 34 current runtime

## Current authority

- Authentication: Clerk
- Application data: PostgreSQL
- Administrator registry and security policy: PostgreSQL
- Rental requests, assets, members, boards, site content, policy content, and data-management operations: PostgreSQL
- Runtime server entry: `server/src/index.mjs`
- Main HTTP application: `server/src/app.mjs`

## Deployment

Heroku runs the Node.js API with `DATABASE_URL` and Clerk server credentials. Production GitHub Pages Actions builds and serves the Vite user and administrator frontend documents; Vercel provides Staging.

## Migrations

Applied migrations are immutable. Add a new numbered migration for future schema changes instead of editing an already-applied migration. The current Phase 34 line expects migrations through 038. Migration 028 consolidates the first duplicate legacy PostgreSQL stores into canonical tables/documents. Migration 029 performs the final verified physical cleanup: it moves rental restrictions into `app_rental_restrictions`, migrates any legacy rental-config borrower copy into `app_member_directory_entries`, removes obsolete sync/shadow tables, strips duplicate signup-term body copies, and derives status from canonical tables/views. Each destructive step is guarded by counterpart verification and the migration runner transaction.

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

Device Trust uses the existing **CLERK_SECRET_KEY** with the Clerk Backend API to set the per-user `bypass_client_trust` attribute. No separate Platform API credentials are required. Keep the Clerk Dashboard Device Trust setting enabled; the application policy determines the per-account bypass. The policy `device-trust-policy` and its `device-trust-sync-state` are retained during ordinary site-settings resets. Only the owner administrator may change or reconcile these policies.

If Clerk rejects an account update, the API attempts compensation and stores recovery status. The administrator Account Security page shows unresolved partial synchronization and an owner-only **기존 계정에 다시 적용** action. Never represent partial success as a completed security policy update.

## Verified destructive reset prerequisite

The web UI's JSON download is a selective application-data extract, **not** an entire PostgreSQL database backup. All destructive system-data resets now require a **single-use, one-hour full backup restore proof** recorded by `server/scripts/verify-full-backup-restore.mjs` after a `pg_dump` and a successful `pg_restore` into an empty, isolated disposable PostgreSQL database. The script compares all public table inventories and row counts. See `docs/phase34-p0-security-runbook-20261019.md` for safe operating steps. Do not run restoration against staging or production databases.

Migration 038 restores footer common content and inquiry-reset policies. Existing migrations must not be edited.

Migration 036 adds secure-attachment file-size metadata and atomic successful-download counters without exposing external target URLs. Existing attachment counts start at zero; file size is populated by safe metadata probing for new/changed URLs or by the first successful proxied download. Attachment display names are optional for new/changed external URLs: when omitted, the secure metadata probe uses the upstream Content-Disposition filename when available and otherwise falls back to the final HTTPS URL path filename.

Migration 037 makes notice-board view counts unique per browser profile. The browser keeps a random opaque viewer ID locally; the backend stores only its SHA-256 hash per notice and increments `view_count` only when that `(post_id, viewer_hash)` pair is first inserted. Existing historical `view_count` values are preserved as the pre-migration baseline.

## Phase 34 P0 JSON selective restore (2026-10-19)

- New migration: `039_phase34_p0_scoped_json_restore_audit.sql` (preserves earlier migrations 001–038).
- Owner-only endpoints: `POST /api/admin/system-data/restore/preview`, `POST /api/admin/system-data/restore/execute`.
- Maximum POST body: 8 MiB. Supported backup: `mk-rental-postgresql-backup-v1` (Migration 038 baseline and matching recorded migration hashes).
- Supported safe scopes: `site`, `boards`, `assets`, `organization`. Modes: `addMissing`, `overwrite` (no deletion). Member accounts, rentals, inquiries, Clerk identities, account security and external file originals are **not restored** by JSON.
- JSON exports now use one `REPEATABLE READ READ ONLY` PostgreSQL snapshot instead of separate pool query snapshots.
- Every execute requires: owner server authority, an exact confirmation phrase, an unchanged server-side preview, and a 60-minute single-use proof of **full PostgreSQL dump successfully restored in a disposable database**. Unsupported/redacted data, changed DB contents, schema mismatches and constraint violations fail closed.
- New audit table stores actor, mode, scopes, digest, counts, timestamp and sanitized error codes; never JSON backup bodies or credentials.
- Integration tests: `npm run server:phase34:scoped-restore:smoke` and `npm run frontend:phase34:scoped-restore:smoke`; both are included in `npm run verify:phase34`.
- Step-by-step Staging/Production runbook: `docs/phase34-p0-integrated-scoped-restore-runbook-20261019.md`.
- Emergency restore into a newly created **empty** PostgreSQL target from an existing verified custom-format dump: `node server/scripts/restore-full-db-to-empty-target.mjs`. Required environment: `EMPTY_RESTORE_DATABASE_URL`, `BACKUP_FILE`, `EXPECTED_DUMP_SHA256`, `CONFIRM_EMPTY_DATABASE_RESTORE=YES`. Never changes any application's `DATABASE_URL`.
