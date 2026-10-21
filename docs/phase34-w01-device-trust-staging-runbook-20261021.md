# Phase 34 W01 Staging acceptance runbook (2026-10-21)

## Deployment gate

- Baseline: `c772cb7b19bb8fff755f38318bc0a8db8db9707f`, ZIP SHA-256 `3b03a4a6034ca26ace8ed31ec681445a30f248c8d37d807dab2d6027c70eb286`.
- This W01 source ZIP is an **uncommitted development package**, not a Production release.
- **No Staging/Production server or database was changed during authoring.**
- Existing Production Backend v20 and GitHub Pages Actions 39448029099 remain the approved production baseline.
- **Important:** Real Clerk/PG Staging AC-S01 is NOT yet PASS. Production deployment requires a separate user decision.

## Operator sequence (Staging only)

1. On Windows, verify the new Full ZIP hash against the attached `.sha256` with `Get-FileHash`.
2. In `E:\project\rental-system\test_new`, run `./deploy.ps1` (PowerShell: `.\deploy.ps1`). Use option **2** and specify the exact newly approved Full ZIP. Firebase deployment **0**. Production branch publishing **N**. Do **not** select legacy direct Production publishing, which previously failed with `spawn ENAMETOOLONG`.
3. Ensure `origin/gh-pages-3` now points at exactly the intended tested source commit and the worktree is clean.
4. Because this package contains server code and Migration **042**, deploy **Staging Backend separately** after checking the destination remote:
   ```powershell
   git fetch origin
   git remote -v
   git push heroku-staging refs/remotes/origin/gh-pages-3:refs/heads/main
   heroku ps -a notebook-rental-api-staging-01
   ```
   The Heroku Release Phase runs `npm --prefix server run db:migrate`; confirm Migration 042 success and no checksum changes to Migration 001–041. Do not manually re-run destructive SQL.
5. Check Staging `/health` (HTTP 200), authenticated owner-only policy/audit API and PostgreSQL read-only `schema_migrations` / `app_device_trust_audit_events` existence.
6. Use only disposable Staging test accounts to verify ON→OFF→ON, new user creation, SDK-verified signup, administrator creation, safe account recovery and policy reconciliations. Confirm the *actual Clerk GET bypass_client_trust* and PostgreSQL policy at each checkpoint.
7. Do not create 1,000 real Clerk accounts: the bulk mutation proof is from a deterministic 1,000-account Mock. Use a small test set in Staging.
8. Confirm Clerk 404(active) produces `recovery_required`, and database policy read failure and missing Clerk response values do not yield a false successful account state. Only inject disruptive Clerk failures in an isolated Mock; do not sabotage real users.
9. Confirm data reset remains server-blocked. Do not execute full initializations, JSON overwrite on real records, or whole-DB restore.
10. Re-run 8 business areas in Staging: admin login/reverification, user login/Device Trust, rentals, assets, boards/inquiries, site settings, JSON data management, OTP/data verification. Include admin 4:3 layout, toast non-overlap, screen-reader labels.
11. Record logs, times, identifiers **masked**, before/after PG & Clerk facts, changes, failures and rollback/reconciliation observations in an acceptance report. If any S01-01…12 scenario fails or was not run, AC-S01 remains NOT ACCEPTED.

## Existing infrastructure, cost and safeguards

- Only current Heroku Basic web dyno, current Essential-0 PostgreSQL for each environment and existing Clerk instances.
- No new database/dyno/worker/S3/paid add-on, no plan upgrade, no additional automatic charges.
- Device Trust policy, sync-state and `system-settings-audit` survive any eventual authorized settings-only reset; the new `app_device_trust_audit_events` history is separate from site settings.
- New `GET /api/admin/clerk-device-trust/audit?limit=50` requires the authenticated highest administrator role (`owner`), and returns only recorded server-side audit fields.
- Existing full-database initialization remains blocked; backup logical checks are **not** proof of whole database restoration. AC-S04 remains untested.

## Production—do not run without separate approval

1. Validate newest manual PGBackups and dump structure; verify Staging test evidence and authorized commit SHA.
2. Deploy Production Heroku Backend **separately** using `heroku-production`, check release/migration/health.
3. Promote Production Frontend using `promote-github-pages-actions-production-v1.1.ps1` only, check GitHub Pages workflow build/deploy success.
4. User manually validates existing 8 areas in Production. Never use `deploy.ps1` Production direct publishing.

## Remaining work

W01 Staging AC-S01 acceptance → W02 partial failure / compensation / concurrent policy changes → W03 zero-additional-cost backup safety → W05 Firebase retirement test+docs → P0 final acceptance → unchanged email P1-01…08.
