# GitHub Education Phase 4 Vercel Mode Fix Report

## Baseline

`rental-system-github-education-phase4-clerk-frontend-bridge-20260807_deployment_package.zip`

## Problem

The Phase 4 Clerk staging bridge required both `VITE_CLERK_STAGING_ENABLED=true` and a Vite mode of `staging`, `development`, or `test`. The existing `gh-pages-3` test site is deployed as the Production Branch of a dedicated Vercel staging project (`mkrental.vercel.app`). Vercel can therefore run a normal Vite production build even though the project is operationally a staging environment. The previous mode gate suppressed the diagnostic panel even when `?clerkTest=1` was present.

## Fix

- `VITE_CLERK_STAGING_ENABLED=true` is now the explicit compile-time enable switch.
- `?clerkTest=1` remains the separate runtime UI gate.
- A Clerk Development publishable key (`pk_test_...`) is still mandatory.
- Non-local API URLs must still use HTTPS.
- Existing Firebase login and Firestore flows remain unchanged.
- No new npm dependency was added.

## Required Vercel variables

Set these on the dedicated `mkrental` Vercel project, then redeploy:

```text
VITE_CLERK_STAGING_ENABLED=true
VITE_API_URL=https://<HEROKU-STAGING-APP>
VITE_CLERK_PUBLISHABLE_KEY=pk_test_<CLERK-DEVELOPMENT-KEY>
```

The variables are injected at build time by Vite, so a new deployment is required after changing them.
