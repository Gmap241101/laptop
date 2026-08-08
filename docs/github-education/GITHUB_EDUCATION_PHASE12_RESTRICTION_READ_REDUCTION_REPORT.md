# GitHub Education Phase 12 — Rental Restriction Read Reduction

## Scope

Phase 12 extends the PostgreSQL staging cutover from the member profile to the signed-in user's rental restriction state.

### Added

- PostgreSQL table `app_user_rental_restriction_shadows`.
- Firebase-ID-token authenticated Firestore REST source reader for `rentalRestrictions/{uid}`.
- PostgreSQL candidate endpoint, one-time Firestore seed/fallback endpoint, and write-through endpoint.
- Staging opt-in restriction watcher disable.
- 15-second PostgreSQL refresh while the restriction watcher is disabled.
- Write-through hooks on real restriction mutation paths: overdue return and inherited restriction restoration.

## Safety model

- Firestore remains authoritative for restriction writes.
- The browser does not submit restriction payloads to PostgreSQL.
- Heroku reads the actual Firestore document using the actor's verified Firebase ID token, so existing Firestore Rules remain the authorization boundary.
- PostgreSQL success path creates no `rentalRestrictions/{uid}` realtime listener.
- If a shadow does not exist, one Firestore read seeds it; later reads use PostgreSQL.
- Production remains unchanged unless the dedicated staging Vercel gate and explicit URL opt-in are both active.

## Runtime impact

Member profile watcher reduction from Phase 10/11 remains intact. Phase 12 removes one additional signed-in-user realtime listener (`rentalRestrictions/{uid}`) in the opt-in staging session.

## Validation summary

`npm run verify:phase12` passes all Phase 3-12 regression suites. Static Firestore call counts remain 129/35 onSnapshot because legacy/production branches are intentionally retained, but the Phase 12 opt-in runtime branch does not create the signed-in user's `rentalRestrictions/{uid}` listener. The first unseeded session may perform one Firestore REST read to seed PostgreSQL; steady-state reads use PostgreSQL.

No frontend npm package was added. `App.jsx`, Firebase configuration, Firestore Rules/indexes, CNAME, Vercel configuration, `src/main.jsx`, and the root lockfile remain byte-identical to Phase 11.
