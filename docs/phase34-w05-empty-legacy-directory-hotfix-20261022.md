# Phase 34 W05 — Empty retired directory false-positive hotfix (2026-10-22)

## Evidence and finding

The operator submitted W05 staging deployment log from 2026-10-22 10:53 KST:

- Full ZIP SHA-256 `CF98534F9AC154AC2FCB6BFE33A4E66072EBBE5E6C805D34327EC5B023675711` passed.
- Vite build succeeded (1,972 modules) and `gh-pages-3` pushed `1c41a7b518390449474a1cb5f551e26047abd2e8`.
- Production `gh-pages` not published and Firebase deployment skipped.
- `npm run audit:external-runtime:strict` passed with zero direct Firebase/retired-provider runtime references in 281 files.
- `npm run frontend:phase34:w05-retirement:smoke` failed with `Retired source must stay absent: server/src/firestore` at line 18.

The preceding source package's `REMOVED_FILES.txt` lists all 9 retired `server/src/firestore/*.mjs` files. The package does not contain those files. The original W05 test checked the **directory's existence**, not whether executable retired files remain. `deploy.ps1` can delete the manifest-listed files without removing now-empty parent folders; Windows Git does not track empty folders. This matches the reported result, although only an inspection of the user's local folder can establish that it is empty.

## Change

- Introduced `tools/lib/retired-source-paths.mjs` shared between W05 smoke, backend external-runtime smoke, backend runtime-retirement smoke and `server:check`.
- An absent or empty directory, including empty nested folders, passes. Any remaining file or symbolic link in a retired source path causes failure. `src/firebase.js` must still be absent entirely.
- Added deliberate regression fixtures for absent path, empty path, nested empty path and an actual retired `.mjs` file.
- Retained strict Firebase imports/URLs/headers scanning, 043 migration assertions, Clerk/PostgreSQL authority and backend data safeguards.
- Frontend runtime, backend runtime, DB migrations, production GitHub Actions and payment/infrastructure changes: **none**.

## Acceptance boundaries

This is a tooling false-positive repair. An initial local W05 PASS after the hotfix does not by itself constitute fresh browser-side eight-domain regression acceptance. Before declaring full W05 operational acceptance, the operator's current Staging deployment and relevant end-user workflows must be confirmed. There is no reason to alter Heroku staging backend, DB, Firebase or production for this testing-only change.

Original W03 AC-S04 independent full restore remains **not performed / not accepted** despite approval of the Z01–Z09 non-destructive substitute. The completed 2026-10-22 03:01 KST Heroku backup `a005` includes `app_device_trust_operations` and passed read-only archive validation (SHA256 `5BCAB64B38821BA81C7226CD504417A98B76906EAA2BBF060A978DB7179951AD`). No backup operation is required for this W05 hotfix.
