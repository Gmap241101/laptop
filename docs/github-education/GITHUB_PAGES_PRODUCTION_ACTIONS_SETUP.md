# GitHub Pages Production Vite build

Production frontend: `https://notebook.recruit.kro.kr`
Production source branch: `gh-pages`
Production API: `https://api.notebook.recruit.kro.kr`

## Why this workflow exists

`gh-pages` contains the React/Vite source tree. GitHub Pages must not publish the source `index.html` directly because that file references `/src/user-main.jsx`. The production workflow builds the Vite application and publishes only `dist/` as the Pages artifact.

## Repository setup

The workflow is `.github/workflows/pages-production.yml` and runs on pushes to `gh-pages` or manual dispatch.

A GitHub Actions secret is required:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
```

Do not put the Clerk Production publishable key in `.env*` inside a deployment package. The workflow injects it at build time.

The production build deliberately requires `pk_live_...`; a `pk_test_...` key fails the Production preflight.

## One-time Production promotion

First deploy this full package to the Staging source branch (`gh-pages-3`) with the existing deployment flow. Then run from the repository root:

```powershell
./tools/deployment/promote-github-pages-actions-production.ps1
```

The helper:

1. verifies GitHub CLI authentication;
2. detects `gh-pages-3` (or `gh-pages3`) and verifies the Production Pages workflow exists there;
3. creates `VITE_CLERK_PUBLISHABLE_KEY` if needed;
4. requires and preserves an existing `gh-pages2` rollback branch (it is never overwritten);
5. refuses to proceed if `gh-pages2` is missing, unless `-AllowCreateBackupFromCurrentProduction` is explicitly supplied;
6. changes GitHub Pages `build_type` to `workflow`;
7. promotes the verified Staging source SHA to `gh-pages` with `--force-with-lease`;
8. waits for the push-triggered Production workflow and verifies the final branch SHAs.

The Pages setting is switched before the `gh-pages` source push so that the same push starts the Vite Production workflow.

## Artifact contract

`npm run build:production:pages` performs:

1. Phase 34 prebuild audits;
2. Production API-domain validation;
3. Production Clerk `pk_live_` validation;
4. Vite production build;
5. `dist/404.html` creation for direct user-route visits;
6. `.nojekyll` creation;
7. `dist/CNAME` and production API bundle validation;
8. rejection of raw `/src/*.jsx` references in the Pages artifact.

A successful deployed `index.html` must reference `/assets/*.js`, not `/src/user-main.jsx`.

## Backend prerequisite

The production backend is separate from this frontend workflow. Before production use, the Heroku Production app must already use the Production Clerk instance and production frontend origin, including:

```text
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://notebook.recruit.kro.kr
CLERK_AUTHORIZED_PARTIES=https://notebook.recruit.kro.kr
CLERK_SECRET_KEY=sk_live_...
CLERK_JWT_KEY=<Production Clerk JWT public key>
```

Do not point the Production frontend at the Staging Heroku/PostgreSQL environment.
