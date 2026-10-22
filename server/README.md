# Rental API — Phase 34 current runtime and operations (2026-10-21)

## Authoritative services

- **Authentication and Device Trust:** Clerk. Server-side authorization, owner-only administration, recovery and audit are enforced by the Node API.
- **Application data:** PostgreSQL (Heroku Staging Essential-0; single existing database). Membership, rentals, assets, board content, settings and data maintenance are authoritative in PostgreSQL.
- **Runtime:** `server/src/index.mjs` starts `server/src/app.mjs`.
- **Firebase:** externally retired from the application runtime. `src/firebase.js`, server Firebase/Firestore clients and Firebase npm SDK are absent. Compatibility fields such as `firebase_uid` and the table `app_user_firebase_links` remain for historical identity reference. **Never delete those columns or tables merely to remove Firebase.** The locally implemented `retiredLegacyDataCompat.js` is not a live Firebase client.

## Environments and release control

- **Staging frontend:** `https://mkrental.vercel.app` (administrator path `/admin`); Staging source is GitHub `gh-pages-3`.
- **Staging backend:** Heroku app `notebook-rental-api-staging-01`; the Git remote must be `heroku-staging`.
- **Production backend:** configured separately; do **not** push to the `heroku` or `heroku-production` remotes while testing Staging.
- **Production frontend:** GitHub Pages from the `gh-pages` branch via `.github/workflows/pages-production.yml`. The workflow uses Node.js 22, checkout/setup-node v6, and `npm run build:production:pages`. The only standard production promotion mechanism is `tools/deployment/promote-github-pages-actions-production.ps1` (requires a separate explicit approval). `deploy.ps1 v13.5` is the Staging ZIP-apply/build/push operator flow; do not select its Production publish option as a production promotion substitute.
- `gh-pages-2` is a historical backup branch. It must not be assumed to be the commit immediately preceding a new production promotion.
- Historical GitHub Actions Node 20/runner warnings are maintenance issues to reassess against live GitHub workflow logs. Do not change Actions versions, secrets, runner or deployment settings without separate approval.

## Database migrations

Migrations **001–043** are present in the current Phase 34 source line, including:

- `038_phase34_footer_reset_recovery_inquiry_reset.sql`: footer and inquiry reset preservation.
- `039_phase34_p0_scoped_json_restore_audit.sql`: selective JSON restore audit.
- `040_phase34_p0_web_backup_verification_jobs.sql`: backup verification jobs.
- `041_phase34_p0_single_db_scoped_restore_safety.sql`: atomic selective-restore preimages in the existing DB.
- `042_phase34_w01_device_trust_security_audit.sql`: W01 policy audit.
- `043_phase34_w02_device_trust_operation_recovery.sql`: W02 recovery operations and policy convergence.

Never edit an already-applied migration. Staging reports migration 043 already applied. For any new schema change, add a new numbered migration and separately validate on Staging before seeking Production approval.

## System-data backup and restore — current behavior

Two operations **must not be confused**:

1. **Full database backup/restore:** Existing Heroku PGBackups archives can be downloaded and checked with SHA-256, `pg_restore --list` and a read-only SQL-generation pass (`pg_restore --file NUL` on Windows). This is an **archive integrity check**, not proof that the database was restored successfully. The original isolated-database restore acceptance requirement **AC-S04 remains not executed and not accepted** under the no-new-DB policy.
2. **Scoped application JSON restore:** `POST /api/admin/system-data/restore/preview` and `/execute` operate on four allowed scopes (`site`, `boards`, `assets`, `organization`) in `addMissing` or `overwrite` mode (neither deletes out-of-scope data). In `BACKUP_VERIFY_MODE=single-db`, the API uses migration 041's transaction-bound before-image journal and atomic PostgreSQL writes instead of requiring isolated restore proof for this **narrow JSON operation only**. The preview lasts **10-minute** server time (`previewIssuedAt`, `previewExpiresAt`), and execute rejects expired or mismatched previews before writes. Execution still requires owner access, confirmation, supported schema and state checks, and audit.

**Full database reset** (`POST /api/admin/system-data/reset`) is not the same as scoped JSON restore. In single-db mode, `backup_verification_independent_restore_required` or the corresponding reset-proof guard **blocks destructive reset** without actual independent full-restore proof. A read-only logical verification must not unlock it. No new DB, storage, worker or paid add-on is authorized.

Legacy materials describing a mandatory 60-minute independent restore proof for *every* JSON selective restore predate migration 041 and the W03 10-minute preview change. They must not override the current API contracts. The 60-minute proof model and the new 10-minute preview expiration are distinct concepts.

## Staging backup verification boundary

On 2026-10-21, the operator inspected completed backup `a004` (created 2026-10-21 03:03 KST, before migration 043). The downloaded `latest.dump` had 219,761 bytes, SHA-256 `D61639D489453D041E0FE6F6916519A6EE419E84348D499AF2B1ECD13570F837`, 205 TOC entries and passed `pg_restore --file NUL`. It **does not contain `app_device_trust_operations`**. Subsequent downloads of `a004` do not create a post-migration backup. A newly *created* completed PGBackups archive must be checked separately; never delete or overwrite user data to test backup health.

See `docs/phase34-w05-firebase-retirement-operations-20261021.md` for operator commands and W05 evidence. W03 acceptance Z01–Z09 is awaiting formal sign-off; original AC-S04 must remain unaccepted until actually proved by an approved isolated restore.

## Validation

```bash
npm run verify:phase34
npm run server:phase34:external-runtime:smoke
npm run frontend:phase34:external-runtime:smoke
npm run frontend:phase34:w05-retirement:smoke
```

This checks Clerk/PostgreSQL application flows, retired external Firebase SDK/API references, 001–043 migration contracts, W01/W02/W03 regression cases and the current W05 documentation. A green local test is **not** evidence of a Production release or a live isolated full-database restore.
