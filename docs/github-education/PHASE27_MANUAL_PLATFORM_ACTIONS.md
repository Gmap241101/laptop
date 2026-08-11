# Phase 27 Manual Platform Actions

## Vercel staging/test (`mkrental`)
Add to the same Vercel environment used for the current staging/test deployment:

`VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED=true`

Redeploy because this is a Vite build-time variable.

## Heroku
No Phase 27 backend source or migration changes. Keep the currently validated Phase 26 backend and `SERVICE_VERSION=phase26`.

## Firebase / Clerk / GitHub / DNS
No Firebase Auth, Rules, index, Clerk, production branch, or DNS changes.

## Test
Use the full Phase 27 URLs with `legacyReadFallback=off`. If a retired PostgreSQL read fails, the diagnostic panel must record the blocked domain instead of performing a Firestore fallback.

## Rollback
Use the full rollback URL with `legacyReadFallback=on`. This only restores the legacy read fallbacks; other PostgreSQL cutovers stay active.
