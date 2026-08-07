# Phase 3 deployment package compatibility fix

## Cause
The Phase 3 full deployment package incorrectly included `.env.example` in `package-meta/PACKAGE_FILES.txt`. `deploy.ps1 v13.1` treats all `.env*` paths as protected and correctly blocked deployment before replacement.

## Fix
- Removed `.env.example` from the package entirely.
- Moved non-secret configuration examples to `docs/github-education/HEROKU_CONFIG_VARS_TEMPLATE.txt`.
- Removed the `.gitignore` exception for `.env.example`; all `.env*` files remain ignored.
- Updated the backend foundation validator to read the safe config-template document.
- Added `tools/deployment/validate-package-manifest.mjs` and `npm run package:guard` to reject `.git`, `node_modules`, `dist`, secrets paths, `.env*`, and `deploy.ps1` entries in the package manifest.
- No application UI, Firebase logic, Firestore rules, CNAME, or database migration was changed.
