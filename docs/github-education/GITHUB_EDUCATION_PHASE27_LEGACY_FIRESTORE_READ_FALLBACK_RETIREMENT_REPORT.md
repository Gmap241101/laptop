# GitHub Education Migration — Phase 27 Legacy Firestore Read Fallback Retirement

## Scope
Phase 27 retires legacy Firestore **read fallback** for PostgreSQL domains that have already passed actual staging validation:

- member profile
- rental restriction
- user rental requests
- asset catalog / availability
- notice board
- FAQ board

The retirement is staging/test gated by `VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED=true` plus `legacyReadFallback=off` (latched in sessionStorage).

## Preserved compatibility
Phase 27 deliberately does **not** retire:

- Phase 25 site-shell parity fallback (home / popup / footer), because current staging data can still require parity fallback.
- policy/terms Firestore reads that are part of transaction-time authority or rollback compatibility.
- account recovery Firestore compatibility fallback.
- Firestore write mirrors for PostgreSQL-authoritative domains.
- Firebase Auth compatibility sessions and Firebase UID bridge.

## Failure behavior
When Phase 27 retirement is active, a PostgreSQL failure in a retired read domain does not silently read Firestore. The affected domain becomes `unavailable`, shows a targeted error, and records a blocked fallback diagnostic. This makes remaining PostgreSQL reliability issues visible instead of masking them with Firestore.

## Rollback
`legacyReadFallback=on` clears the session latch and restores the pre-Phase-27 fallback behavior without changing other PostgreSQL cutovers.

## Production safety
This phase changes staging/test frontend behavior only. No production branch, production DNS, Production Clerk, Firestore Rules, indexes, or backend schema changes are included.

## Final automated verification
- `npm run verify:phase27`: PASS, exit code 0.
- React source files: 166.
- Application contracts: 124; user routes: 11; administrator tabs: 20.
- Firestore strict audit: 137 total calls; 35 onSnapshot; 53 getDocs/server equivalents; 31 getDoc/server equivalents; 18 getCountFromServer; warnings 0; errors 0.
- `npm run build:staging`: prebuild audits PASS; final Vite execution unavailable in the assistant runtime (`vite: not found`, exit 127) because root node_modules is absent.
