# Phase 18 — Admin Rental Request Mutation Completion

Phase 18 completes the remaining independent administrator rental-request mutations that can safely move together after the Phase 17 list/status cutover.

## Combined scope
- Administrator direct request edit: PostgreSQL authoritative transaction + Firestore compatibility mirror.
- Administrator memo save: PostgreSQL authoritative transaction + Firestore compatibility mirror.
- Administrator status restore: PostgreSQL authoritative transaction + Firestore compatibility mirror.
- Administrator request processing history: PostgreSQL event read, with legacy `rentalRequestLogs` imported into `app_rental_request_events`.
- Legacy user-action review remains temporarily Firestore-authoritative, but after it succeeds only that request and its logs are synchronized back to PostgreSQL. Full `rentalRequests` bootstrap is no longer invalidated after every mutation.

## Data model
Migration `010_phase18_admin_rental_mutation_completion.sql` adds source identity/mode columns to `app_rental_request_events`, a unique legacy event identity index, and request/event ordering index. Existing migrations remain unchanged.

## Runtime safety
- Admin identity remains Clerk-authenticated and Firestore-admin-verified using the caller's Firebase ID token.
- PostgreSQL mutations use existing row/advisory locking and perform Firestore compatibility mirror before PostgreSQL commit.
- Firestore Rules/indexes and Firebase Admin credentials are unchanged.
- Staging/Production isolation remains controlled by the existing Phase 17 Vercel opt-ins and explicit query/session latch.

## Intentionally remaining for the next combined phase
The tightly coupled user self-service action lifecycle is not split across Phase 18:
- user cancel/change/extension/return action creation,
- administrator approve/deny review of those actions,
- related restriction/availability/asset side effects.
These should move together so one side is not PostgreSQL-authoritative while the corresponding reviewer side remains Firestore-authoritative.
