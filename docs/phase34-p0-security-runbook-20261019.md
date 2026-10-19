# Phase 34 P0 (excluding automatic email) — security and reset operations

**Code baseline:** 2026-10-07 13:35 Full deployment package, SHA-256 `63d5c4ed738ce8cd75d29a22385e65cf4e9774b4303e277630e1dbd2b4c3d33b`.

**Scope:** Device Trust policy and restoration, resetting site data, executable runtime-retirement regressions, JWT/migration operational check. **Email features are excluded.**

## 1. Changes and invariants

- Selecting `사이트·운영 설정` for data reset does not delete `device-trust-policy` or `device-trust-sync-state` from PostgreSQL. Clerk `bypass_client_trust` is unchanged by a site settings reset.
- Device Trust writes acquire a PostgreSQL session advisory lock across the Clerk account sync. A conflicting write returns `409 clerk_device_trust_change_in_progress`.
- All concurrent Clerk operations finish before compensation starts. All active account states are re-read and re-synchronized. On remaining mismatch, the sync record indicates `recovery_required`, visible to administrators without disclosing Clerk user IDs. The owner may use **기존 계정에 다시 적용**.
- A failed policy update does not report success. The authoritative policy stays the saved PostgreSQL value unless all active accounts have been synchronized and confirmed.
- The web JSON export is a limited application extract, NOT a full restorable database backup. Browsers cannot certify a full PostgreSQL restore.
- Destructive reset now requires a one-use full PostgreSQL restore proof. This is a **deliberate fail-closed behavior change**; the prior JSON download alone no longer enables reset. The proof expires 60 minutes after verification.
- `firebase_uid` legacy PKs remain. The removed Firebase SDK/runtime is **not** reinstated.

## 2. Validating a full DB backup (operator only; no live operation performed in this delivery)

**Never use Production or Staging as the restoration target.** Create a separate, isolated, EMPTY disposable PostgreSQL database with permission to restore schema and data. Install PostgreSQL command-line clients (`pg_dump`, `pg_restore`) with versions compatible with the source database. Keep the dump file on encrypted, access-controlled storage.

Use protected OS environment variables (do not paste secrets into chat or into command history):

- `DATABASE_URL` — source/Staging or Production DB; the script only dumps and later records a small proof in `app_runtime_metadata`
- `RESTORE_TEST_DATABASE_URL` — a DIFFERENT, EMPTY, disposable database. The script aborts if the database names are the same or destination has any public tables.
- `BACKUP_FILE` — new local custom-format backup filepath (script refuses overwrite)
- `CONFIRM_DISPOSABLE_RESTORE_DB=YES` — explicit acknowledgement that `pg_restore` **writes** to the disposable target database

Run in the package root after installing server dependencies:

```bash
node server/scripts/verify-full-backup-restore.mjs
```

Success criteria: nonzero table count, `pg_dump` and `pg_restore` zero exit codes, identical restored/source public table inventories and row counts, and a SHA-256 of the backup archive. Only then is a proof written to the source DB. If any stage fails, no proof is recorded. Retain the full backup file securely and restrict access. Restore/proof checks have **not** been performed against a live database in this development environment.

In the administrator UI choose the reset scopes and click **초기화 대상 확인** again. The reset button becomes available only while the new proof is valid and the confirmation phrase matches. A successful reset consumes the proof in the same transaction; a subsequent reset requires a new isolated restore validation.

The script compares table inventories and row counts. It does **not** prove that external object storage or Clerk accounts can be reconstructed from PostgreSQL. Verify those separately when those authorities are relevant. A new backup is needed after significant subsequent writes.

## 3. Operational auth and migration checks (requires credentials, not executed here)

1. Verify GitHub Actions `VITE_CLERK_PUBLISHABLE_KEY` and Heroku `CLERK_SECRET_KEY`/`CLERK_JWT_KEY` were all issued from the **same Production Clerk instance**. Never disclose secrets or full tokens in logs or chat.
2. Check `https://api.notebook.recruit.kro.kr/health` and Staging separately.
3. Test user and owner login in separate fresh-browser profiles; navigate, reload, let sessions expire, and verify `/api/users/auth/session` and `/api/admin/auth/session` statuses. A `401 invalid_signature` means this gate fails. Do not weaken JWT verification as a workaround.
4. Confirm `038_phase34_footer_reset_recovery_inquiry_reset.sql` in `schema_migrations` on EACH environment; test content and inquiries reset on an isolated copy only, including idempotent migration behavior.
5. For Device Trust, test OFF→ON, ON→OFF, 0/1/many account sync, `404`, `429`, `503`, partial rollback, retry, new Clerk account creation and two simultaneous policy changes. Verify actual new-device email-code requirements on the corresponding Clerk instance.
6. Run `npm run verify:phase34`, `npm run server:phase34:p0-security-recovery:smoke`, `npm run server:phase34:runtime-retirement:smoke`, `npm run frontend:phase34:runtime-retirement:smoke`, and `npm ci && npm run build:production:pages` in a properly provisioned CI environment.

## 4. Deployment distinction

`deploy.ps1 v13.5` applies the whole ZIP to `gh-pages-3` with Firebase deployment disabled and Production direct publishing set to **N**. These changes touch the Backend: deploy the new `gh-pages-3` commit to `rental-api-production-01` **only after Staging and restoration preflight**, then promote GitHub Pages via the approved promotion script. The baseline schema migrations 001–038 are unchanged; no new migration is required by this package.

Production JWT/key matching, real external backup recovery and actual user new-device OTP are external operational gates and are not asserted PASS by mock/static tests.
