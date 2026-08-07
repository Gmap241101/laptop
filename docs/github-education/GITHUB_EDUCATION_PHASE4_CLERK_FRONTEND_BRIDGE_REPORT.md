# GitHub Education Phase 4 - Clerk Frontend Staging Bridge

## Baseline
- rental-system-github-education-phase3-clerk-auth-foundation-20260807-fixed_deployment_package.zip

## Scope
Phase 4 adds an opt-in ClerkJS frontend bridge for gh-pages-3 staging validation only. Existing Firebase Auth and Firestore flows remain the active application authentication/data paths.

## Activation gates
The bridge requires all of the following:
1. Vite mode is `staging`, `development`, or `test`.
2. `VITE_CLERK_STAGING_ENABLED=true`.
3. `VITE_CLERK_PUBLISHABLE_KEY` is a Clerk Development key (`pk_test_...`).
4. `VITE_API_URL` is configured and HTTPS in staging.
5. The browser URL includes `?clerkTest=1` before the diagnostics panel is rendered.

A production-mode build hard-disables the bridge even if Vercel environment variables are accidentally copied.

## Clerk loading strategy
No new npm dependency was introduced. The bridge follows Clerk's supported JavaScript script-tag distribution model and loads `@clerk/ui@1` followed by `@clerk/clerk-js@6` from the Frontend API domain encoded in the Clerk Development publishable key.

## Authentication request
After Clerk sign-in, the bridge calls `session.getToken()` and sends the session token only in the HTTP `Authorization: Bearer ...` header to `GET /api/auth/session`. The token is never rendered or logged by the bridge.

## Existing app impact
`src/App.jsx`, Firebase configuration, Firestore rules/indexes, `public/CNAME`, and `vercel.json` are intentionally unchanged. The only existing application entry file changed is `src/main.jsx`, where the staging diagnostics component is mounted as a sibling after `<App />`.
