# Phase 34 manual platform actions — Firebase normal-runtime retirement

## Scope and deployment order

This is a Staging-only deployment. Preserve the Phase 32 and Phase 33 PASS baseline and do not change Production, DNS, GitHub Pages settings, Firebase Rules, or Firebase indexes.

1. Deploy this full package to Heroku Staging.
2. Set `FIREBASE_RUNTIME_DISABLED=true` on Heroku Staging and redeploy.
3. Deploy the same full package to the Staging frontend.
4. Set `VITE_FIREBASE_RUNTIME_DISABLED=true` and keep `VITE_CLERK_STAGING_ENABLED=true`, then redeploy.
5. Keep all Phase 32/33 PostgreSQL authority variables unchanged. The new global flag also forces those authorities on if an individual variable is accidentally omitted.

The backend may retain `FIREBASE_PROJECT_ID` as an ignored rollback value, but it is not read while `FIREBASE_RUNTIME_DISABLED=true`.

## Runtime validation

Use the normal Staging administrator and user URLs, not a diagnostic-only path.

1. Confirm the backend root/health compatibility payload reports `firebaseRuntime: retired`.
2. Sign in as an administrator with Clerk; confirm no Firebase administrator session is requested.
3. Save site settings, home banners, popup, footer, rental policy, signup terms, notices/FAQ, assets, member state, and a rental-request mutation.
4. Reload and confirm PostgreSQL persistence and the complete user-facing display.
5. Sign in as a normal user with Clerk and confirm profile, terms, request creation/edit/cancel/extension and withdrawal flows.
6. In a fresh private window, confirm the public home, banners, popup, footer, policies, notices/FAQ, and asset catalog.
7. In browser Network, filter for `firebase`, `firestore`, `googleapis`, `identitytoolkit`, and `securetoken`. The normal flow must have zero requests to those services.
8. Confirm backend requests use only `Authorization: Bearer <Clerk session>` and do not include `X-Firebase-Authorization`.

GitHub Pages or another static frontend host displaying current content does not prove Firestore is the database. The decisive check is the Network panel plus the Heroku/PostgreSQL authority response: the static page can display data fetched from the Heroku PostgreSQL API.

## Deliberately retired legacy tools

The old browser-side Firebase backup/restore/reset tools and Firebase administrator-account CRUD are blocked while Firebase runtime retirement is active. They must not silently reconnect to Firebase. Existing Clerk/PostgreSQL administrator sign-in remains available. Treat replacement of these two management surfaces with server-side PostgreSQL tools as follow-up work before declaring feature-complete retirement if those tools are required operationally.

## Rollback

Rollback Staging only:

```text
FIREBASE_RUNTIME_DISABLED=false
VITE_FIREBASE_RUNTIME_DISABLED=false
```

Redeploy backend and frontend together. A one-browser diagnostic rollback is available with `?firebaseRuntime=compatibility`, but it must not be used as the normal runtime.

## PASS rule

This package is a deployment candidate. Mark Phase 34 PASS only after all normal Staging flows above pass with zero Firebase network calls and the disabled legacy management-tool decision is accepted or replaced. Phase 32 and Phase 33 remain PASS regardless of this candidate result.
