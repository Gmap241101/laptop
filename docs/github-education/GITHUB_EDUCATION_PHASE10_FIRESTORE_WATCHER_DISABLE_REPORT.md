# GitHub Education Phase 10 - Member Profile Firestore Watcher Disable

## Baseline
`rental-system-github-education-phase9-member-profile-cutover-20260807_deployment_package.zip`

## Scope
- Dedicated `gh-pages-3` staging only.
- PostgreSQL member shadow becomes the primary profile read when explicit Phase 10 gates are enabled.
- `userAccounts/{uid}` Firestore client `onSnapshot` is not created in watcher-off mode.
- PostgreSQL failure uses at most one server-side Firestore document fallback read.
- Normal URLs and Production retain the existing realtime Firestore behavior.

## Activation gates
- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true`
- `VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED=true`
- URL contains `memberRead=postgres&memberWatcher=off`

## Backend
Added `GET /api/legacy/member-profile-firestore-fallback`, authenticated by the existing verified Firebase ID Token. It reads only the linked `userAccounts/{uid}` through Firestore REST and existing Security Rules.

## Runtime safety
PostgreSQL success path: zero Firestore member-profile reads and no member-profile watcher.
PostgreSQL failure path: one-time Firestore fallback read; no realtime listener is installed.
