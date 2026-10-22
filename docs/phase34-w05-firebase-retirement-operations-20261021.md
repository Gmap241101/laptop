# Phase 34 W05 — Firebase runtime retirement / current operating policy

- First created: 2026-10-21; revised for 2026-10-22 W03 acceptance and W05 empty-directory false-positive
- Candidate baseline: W03 Staging frontend source `a078e4e484e47cadd3cd543a26a171fc5d0ca8fb` (operator-provided build and push evidence), current Full ZIP `rental-system-phase34-w03-single-db-safety-preview-ttl-20261021_deployment_package.zip`
- Scope: **W05 test and documentation normalization only**. No frontend or backend runtime behavior change, no database migration or external deployment.
- W03: non-destructive Z01–Z09 acceptance **approved by operator 2026-10-22** and W03 changed-scope task closed; original independent-restore AC-S04 remains **not performed / not accepted**. This W05 update does not waive AC-S04.

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

## 4. W03 postmigration archive evidence (closed; no repeat download needed)

Historical pre-migration archive `a004` (`2026-10-21 03:03 KST`), SHA-256 `D61639D489453D041E0FE6F6916519A6EE419E84348D499AF2B1ECD13570F837`, did not contain Migration 043's `app_device_trust_operations`.

The operator then checked completed **a005** (`2026-10-22 03:01:40 KST`, 229,307 downloaded bytes), SHA-256 `5BCAB64B38821BA81C7226CD504417A98B76906EAA2BBF060A978DB7179951AD`. `pg_restore --list` included `TABLE public app_device_trust_operations`, and read-only `pg_restore --file NUL` exited 0. **Z01/Z02 passed** for the a005 postmigration backup. This archive read check **is not proof of a real database restore**.

W03 changed non-destructive acceptance Z01–Z09 was approved; the original AC-S04 independent recovery remains unperformed/unaccepted and destructive full reset remains blocked.

The script `tools/ops/verify-phase34-w03-postmigration-backup.ps1` remains available for future new archive verification, not as a new compulsory W05 operator task.

## 5. Scope and status

- W01/W02: prior Staging acceptance PASS.
- W03: revised non-destructive Z01–Z09 criteria accepted and closed on 2026-10-22; `a005` backup integrity and post-043 table checks PASS; original AC-S04 remains unperformed/unaccepted.
- W05: initial Vite build and Staging push `1c41a7b` PASS; local regression encountered an obsolete empty-folder-existence assertion. Its 2026-10-22 hotfix recognizes genuinely empty Windows leftover directories but rejects all retired files. Operator validation and Staging 8-area regression are still required for final operational acceptance. User approval still required before any Production promotion.
- P1-01~P1-08 email notification scope preserved unchanged.
