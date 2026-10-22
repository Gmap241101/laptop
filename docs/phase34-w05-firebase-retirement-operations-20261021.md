# Phase 34 W05 — Firebase runtime retirement / current operating policy

- Date: 2026-10-21
- Candidate baseline: W03 Staging frontend source `a078e4e484e47cadd3cd543a26a171fc5d0ca8fb` (operator-provided build and push evidence), current Full ZIP `rental-system-phase34-w03-single-db-safety-preview-ttl-20261021_deployment_package.zip`
- Scope: **W05 test and documentation normalization only**. No frontend or backend runtime behavior change, no database migration or external deployment.
- W03: preview TTL staging verification PASS; **AC-S04 still missing**. Do not treat W05 as approval of AC-S04 or W03's proposed changed acceptance policy.

## 1. Verified design boundaries

| Item | Status | Evidence |
| --- | --- | --- |
| Firebase SDK packages in runtime | Removed | `package.json`, `package-lock.json`, `src/firebase.js` absence and W05 scanner |
| External Firebase network endpoints/headers in frontend + server | 0 permitted | `tools/audit-external-runtime-access.mjs --strict` and W05 independent regression |
| Clerk session and PostgreSQL canonical data | Kept | Backend/client source and existing tests |
| Historical `firebase_uid` and bridge schema | **Kept** | `server/migrations/003_phase6_firebase_identity_bridge.sql`, later migrations |
| `retiredLegacyDataCompat.js` | Kept, no Firebase network authority | Local placeholder for historical unreachable paths; do not delete speculatively |
| Migration line | 001–043 | `server/migrations/043_phase34_w02_device_trust_operation_recovery.sql` |
| Single-DB scoped JSON restore | Allowed with safety guards | `system-data-restore.mjs`, `app.mjs`, migration 041 |
| Full destructive DB reset without independent proof | **Blocked** | `backup-verification-single-db.mjs` and reset API |

## 2. Tests

- Existing retired-external-provider smoke pair: `npm run server:phase34:external-runtime:smoke`; `npm run frontend:phase34:external-runtime:smoke`.
- Existing newer retirement smoke pair: `npm run server:phase34:runtime-retirement:smoke`; `npm run frontend:phase34:runtime-retirement:smoke`.
- Added W05 regression: `npm run frontend:phase34:w05-retirement:smoke`. This recursively scans current frontend/server JS for direct Firebase module imports, network endpoints and legacy authorization headers, verifies legacy schema preservation, current documentation and Production workflow invariants.
- Full check: `npm run verify:phase34` (the W05 regression runs at its end).

These tests are source/Mock verification. Post-deployment browser regression is a separate acceptance action.

## 3. Deployment controls (read only unless authorized)

Staging backend remote: `heroku-staging` → `notebook-rental-api-staging-01`; source GitHub branch: `gh-pages-3`. Staging frontend: `https://mkrental.vercel.app`; admin login stays under `/admin` after logout.

Production promotion requires explicit separate operator approval and must use `tools/deployment/promote-github-pages-actions-production.ps1` and GitHub Pages Actions rather than `deploy.ps1` Production direct-publish. Existing `gh-pages-2` is historical and may not represent latest pre-promotion production state. GitHub Actions source currently uses `actions/checkout@v6`, `actions/setup-node@v6`, `node-version: 22`, Ubuntu latest; inspect actual workflow warning logs before making any environment changes.

**Never create a new** DB, dyno/worker, cloud storage, paid add-on, or upgrade any plan as part of W05. Never expose Clerk secrets, database URLs or user dumps in reports.

## 4. Pending W03 backup check (not part of W05 PASS)

Last observed completed archive is `a004` (`2026-10-20 18:03:09 UTC` = `2026-10-21 03:03 KST`), SHA `D61639D489453D041E0FE6F6916519A6EE419E84348D499AF2B1ECD13570F837`. It predates migration 043 and does not include `app_device_trust_operations`. Repeat `a004` downloads (including `latest.dump.1`) do not satisfy a postmigration backup check. Next backup ID and success cannot be assumed.

**Operator only after a new completed backup exists:**

```powershell
heroku pg:backups:schedules -a notebook-rental-api-staging-01
heroku pg:backups -a notebook-rental-api-staging-01
```

When a distinct backup ID appears and is `Completed`, use the read-only local verification script below. It stores the downloaded file outside the Git working tree and makes no DB changes.

```powershell
cd E:\project\rental-system\test_new
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\ops\verify-phase34-w03-postmigration-backup.ps1 -BackupId "ACTUAL_NEW_BACKUP_ID"
```

`ACTUAL_NEW_BACKUP_ID` is a placeholder; replace with the actual new Heroku ID. The script intentionally refuses historic IDs `a004`, `b003`, `a002`, `b001` and requires `app_device_trust_operations` in its TOC. This checks a schema backup, **not** AC-S04 recovery. Never share the dump itself.

## 5. Scope and status

- W01/W02: prior Staging acceptance PASS.
- W03: 1st Staging pass and existing `a004` archive integrity PASS; new post-043 backup check PENDING; original AC-S04 unaccepted; changed AC-W03-Z01–Z09 pending user approval.
- W05: source/Mock regression and README harmonization candidate; requires Windows Vite build and Staging 8-area regression before final operational acceptance. User approval still required before any Production promotion.
- P1-01~P1-08 email notification scope preserved unchanged.
