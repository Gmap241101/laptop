# GitHub Education Phase 24 — Site Content PostgreSQL Read Cutover

## Status

Phase 24 is a staging candidate. The confirmed source baseline is Phase 23 PASS:

`rental-system-github-education-phase23-user-session-transition-decoupling-trace-hotfix-20260810_deployment_package.zip`

SHA-256: `248090ccc77b6e74fdae64ce1bd4cc6e2b16d4c727c0e0953e4fb365915c6c0f`

## Scope

Phase 24 moves high-read, low-change site-shell content to PostgreSQL-preferred reads while preserving Firestore as the staged compatibility/write authority.

Included domains:

- `site-settings`: `siteSettings/config`
- `home`: `homePage/config`, `homeBanners/*`
- `popup`: `popupPosts/*`
- `footer`: `siteFooter/config`, `footerPages/*`

Explicitly excluded from this phase:

- `rentalSystem/publicConfig`
- signup terms / privacy consent transaction documents
- notice/FAQ board content
- board counters/view-count semantics

Those domains retain their existing Firestore behavior until a dedicated follow-up phase.

## Authority model

Public/site-shell read path when Phase 24 opt-in is enabled:

`PostgreSQL preferred -> one-time Firestore fallback on unsynchronized/unavailable PostgreSQL`

Administrator mutation path:

`existing Firestore authoritative write -> PostgreSQL whole-domain write-through synchronization`

No Firebase Admin service-account credential is introduced. Existing Clerk administrator authentication and the verified Firebase administrator compatibility token remain the authorization boundary for the sync endpoint.

## PostgreSQL

Migration: `016_phase24_site_content_read_cutover.sql`

Tables:

- `app_site_content_documents`
- `app_site_content_syncs`

The document table stores normalized domain/document-key rows and JSONB payloads. Domain synchronization uses a PostgreSQL transaction and advisory lock, then replaces the domain atomically and records source hash/count/sync metadata.

## Backend API

- `GET /api/site-content/:domain`
- `POST /api/admin/site-content/:domain/sync`

Allowed domains are restricted to `site-settings`, `home`, `popup`, and `footer`.

The administrator sync endpoint requires both a valid Clerk session and a verified Firebase administrator token whose UID matches the PostgreSQL admin identity registry.

## Frontend cutover

Opt-in query/session latch:

- `siteContent=postgres`
- `siteContentWrite=postgres`

Rollback:

- `siteContent=firestore`
- `siteContentWrite=firestore`

Vercel build-time flags:

- `VITE_SITE_CONTENT_POSTGRES_READ_ENABLED=true`
- `VITE_SITE_CONTENT_WRITE_THROUGH_ENABLED=true`

## Firestore impact

Phase 23 static total: 131 calls.
Phase 24 static total: 134 calls.

The three additional static calls are from the generic administrator write-through collector that re-reads the current Firestore domain before PostgreSQL synchronization (`getDoc`/`getDocs`). They are not new user/public read subscriptions.

Current strict audit:

- source files: 163
- total calls: 134
- onSnapshot: 35
- getDocs: 51
- getDoc: 30
- getCountFromServer: 18
- warnings: 0
- errors: 0

The user home fallback query is bounded with `limit(50)`.

## Diagnostics

`Clerk Staging Test · Phase 24` adds a Phase 24 site-content section and an administrator-only `Site content 전체 동기화` bootstrap action.

Expected bootstrap observation:

- Site content PostgreSQL requested: yes
- Site content write-through requested: yes
- Last domain: all
- PostgreSQL sync: synced
- Error: -

The diagnostics panel retains the lowered top offset required to avoid toast overlap.

## Compatibility and rollback

A PostgreSQL domain that has not yet been synchronized returns an unavailable/not-synchronized condition to the frontend, which uses the bounded one-time Firestore fallback. No existing Firestore document is deleted by Phase 24.

Production branch, production DNS, production Clerk, Firebase Auth removal, compatibility-mirror removal, and Firebase SDK removal are outside this phase.
