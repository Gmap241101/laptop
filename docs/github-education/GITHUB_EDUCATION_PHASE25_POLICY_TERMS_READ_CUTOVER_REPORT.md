# Phase 25 — Rental Public Config + Signup Terms PostgreSQL Preferred Read

## Scope

- Stabilize the administrator post-login route so a successful administrator authentication remains on `/admin` instead of briefly returning to the user home route.
- Add PostgreSQL preferred reads for `rentalSystem/publicConfig` on the public/user runtime path.
- Add PostgreSQL preferred reads for the signup terms policy used by signup and on-demand terms screens.
- Keep Firestore authoritative inside rental/member/signup transactions that require atomic policy validation.
- Keep `userTermConsentStates` and `userTermConsentLogs` Firestore-authoritative.
- Keep notice/FAQ pagination, counts, view counters and CRUD out of Phase 25.

## Authority boundary

User-facing policy/terms definitions use PostgreSQL preferred read with one-time Firestore fallback when the Phase 25 staging opt-in is active. Administrator writes remain Firestore authoritative and synchronize the corresponding PostgreSQL content domains. Transaction-time policy reads remain Firestore so existing atomic validation semantics are unchanged.

## Administrator route correction

After a successful administrator authentication, the controller now reasserts `/admin`, the dashboard tab, and the admin React view immediately, in a microtask, on the next animation frames, and at short 150 ms / 600 ms checkpoints. This targets the observed post-auth SPA route race without changing administrator authentication or authorization criteria.

## PostgreSQL storage

Phase 25 reuses `app_site_content_documents` and `app_site_content_syncs` from Phase 24. Migration 017 adds only the runtime contract metadata; it does not duplicate content tables. New domains are `rental-config` and `terms`.

## Explicit exclusions

- Notice/FAQ board pagination/count/view semantics.
- Consent state/log authoritative writes.
- Firebase Auth removal.
- Compatibility mirror removal.
- Production promotion.
