# Phase 2 Heroku Deployment Hotfix

## Root cause
The previous Phase 2 deployment package used a root `.env.example` file. `deploy.ps1 v13.1` treats `.env*` as a protected path, so it rejected the package before applying it to `gh-pages-3`. Heroku therefore built the older branch state and did not see the Phase 2 `Procfile` or `server/` backend.

## Corrections
1. Removed `.env.example` from the deployment package entirely.
2. Replaced it with `docs/github-education/PHASE2_ENVIRONMENT_VARIABLE_TEMPLATE.txt`.
3. Updated backend documentation to point to the text template.
4. Added root `package.json` `engines.node = 22.x` so Heroku resolves Node 22 instead of an unspecified default.
5. Preserved the root `Procfile`:
   - `release: npm --prefix server run db:migrate`
   - `web: npm --prefix server start`
6. Preserved Heroku build hooks that install the server-only `pg` dependency.
7. Kept production `gh-pages`, `public/CNAME`, Firebase Auth/Firestore, Vercel routing, and `App.jsx` unchanged.

## Expected next Heroku build indicators
After this corrected package is successfully applied to `gh-pages-3`, the Heroku build should no longer report `engines.node: unspecified`, and process discovery should recognize the root Procfile rather than `Procfile declares types -> (none)`.
