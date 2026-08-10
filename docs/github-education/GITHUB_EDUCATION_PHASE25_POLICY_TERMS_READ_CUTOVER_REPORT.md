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

## 2026-08-10 site-shell visual content synchronization hotfix

Actual Phase 25 staging validation confirmed administrator routing, policy/terms synchronization, and PostgreSQL reads, but the user home lost popup/main-visual/promotion/quick-link content while Phase 24 site content reported PostgreSQL as the active source. The user home observation showed only 2 documents in the PostgreSQL `home` domain, which is insufficient to represent the existing configured home visual set.

The Phase 24/25 browser write-through helper previously used Firestore `getDoc()` / `getDocs()`. Those APIs may return cached data when a server result is unavailable. For administrator bootstrap/write-through, the source snapshot must be authoritative and complete, so the helper now uses `getDocFromServer()` / `getDocsFromServer()` and rejects a PostgreSQL response whose persisted document count differs from the Firestore server snapshot count.

During staging cutover, user `home` and `popup` reads also perform a one-time Firestore-server parity check of enabled document IDs and `updatedAt` values. When the PostgreSQL copy is incomplete or stale, the user UI uses the Firestore server snapshot for that load and publishes `firestore-parity-fallback` with the PostgreSQL and Firestore document counts. This correctness guard is transitional and should be removed together with compatibility fallbacks after PostgreSQL content authority is proven stable.

The Firestore static audit was extended so `getDocFromServer()` and `getDocsFromServer()` are counted as normal document/query reads rather than silently omitted from read totals.
