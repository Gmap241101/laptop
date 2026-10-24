# Phase34 P1-08 G4: EXISTING LOCAL RESTORE DB INTEGRATION TESTKIT (not deployed)

## Purpose and current status
This is an **optional local execution tool**, not an executed PostgreSQL acceptance report. `--plan` is the default and makes **zero DB connections**. The tool tests the isolated G2/G3 repository logic on a separately consented pre-existing **local restore database**. It does not create a DB, connect to Heroku, change public/business tables, use an email API, or grant send permission. Brevo remains selected, Resend retained. Live SMTP/API, Staging/Production, Clerk runtime remain locked.

## Hard safety gates
- `G4_LOCAL_RESTORE_DATABASE_URL` must be a PostgreSQL URL pointing **only to localhost, 127.0.0.1 or ::1** with a database name matching `rental_restore_YYYYMMDD[_HHMMSS]` or `rental_staging_restore_YYYYMMDD[_HHMMSS]`.
- A local test run requires `--execute-local --allow-temporary-schema` **and** `G4_CONFIRM_LOCAL_SCHEMA=I_APPROVE_LOCAL_SCHEMA_CREATE_AND_DROP`. Never pass the real Staging URL.
- The runner creates unique `p34g4_<16 hex>` schema **inside the already existing local restore database**, uses only that schema, and drops it during cleanup. It never executes `050_mail_sandbox_review_schema_DRAFT_NOT_DEPLOY.sql`, `CREATE DATABASE`, or any app migrations.
- A crash/forced process termination before cleanup may leave the scratch schema. Inspect the local database before attempting any manual cleanup. If cleanup fails, the runner returns nonzero and never reports PASS.
- A report is only accepted if the CLI completes with exit code 0, scratch schema cleanup is confirmed, and all requested assertions pass. Use this only on a local copy that can be restored safely. An actual database's schema/role grants, production concurrency and app migration remain **separate** Staging acceptance gates.

## Commands (Windows PowerShell, when separately approved)
```powershell
cd E:\project\rental-system\test_new
npm run mail:p108:g4:local:plan
npm run server:phase34:p1-08-d06d2b-g4-local:smoke
# Explicit local-test consent (NOT for Staging!):
$env:G4_LOCAL_RESTORE_DATABASE_URL = 'postgresql://LOCAL_USER:LOCAL_PASSWORD@127.0.0.1:5432/rental_restore_20261020_112826'
$env:G4_CONFIRM_LOCAL_SCHEMA = 'I_APPROVE_LOCAL_SCHEMA_CREATE_AND_DROP'
node tools/backend/run-phase34-p1-08-d06d2b-g4-local.mjs --execute-local --allow-temporary-schema
Remove-Item Env:\G4_LOCAL_RESTORE_DATABASE_URL,Env:\G4_CONFIRM_LOCAL_SCHEMA -ErrorAction SilentlyContinue
```
Only replace the example URL **on your own PC**, never paste a real password into chat or Git. Require local `pg` dependency (`npm ci --prefix server` only if needed). No commands were run against the user's Windows PC or Heroku from this environment.

## Test contract
- Existing G2 repository actual PostgreSQL BEGIN/COMMIT/ROLLBACK, advisory locks and uniqueness conflicts.
- Synthetic approval/reauth/session/actor binding and duplicate rejection.
- Synthetic settlement uncertain quarantine and terminal state immutability.
- Audit triggers deny direct UPDATE/DELETE, reservation triggers deny DELETE/terminal replay.
- Concurrent duplicate synthetic reservations using independent pool connections.
- Scratch schema is dropped after completion/failure. Database name, host, commands and result counters can appear in logs; secrets/URL must never be logged.

## Not proven
Actual Staging PostgreSQL transaction behaviour/permissions, existing DB catalog consistency, real Clerk sessions/recent MFA, Outbox ID 5, v299 8-area regression, actual Brevo Sandbox HTTP, real mail, Production readiness. G4 and total 13-stage count **remain 7/13 = 53.8%** until independently verified actual PostgreSQL results and acceptance. **No deployment or new migration authorized.**
