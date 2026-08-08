# GitHub Education Phase 14 Rental Request PostgreSQL Foundation Report

## Baseline

`rental-system-github-education-phase13-admin-member-management-ux-refinement2-20260808_deployment_package.zip`

Baseline SHA-256:

`e5548e3ac95a36471a2a38e3ee212e130299e3bf52ba8142aa2c19fbcbf9f8f2`

Phase 13 UX Refinement 2 is treated as already validated and is not reworked.

## Phase 14 scope

Phase 14 combines the following work into one staging-only migration step:

1. audit the existing Firestore rental-request domain,
2. define a normalized PostgreSQL shadow schema,
3. synchronize the current user's accessible Firestore requests into PostgreSQL,
4. expose a PostgreSQL read candidate API,
5. compare the existing Firestore application read with the PostgreSQL candidate.

Phase 14 does **not** cut over request creation, request edits, approval/denial, rental start, return processing, or administrator request processing to PostgreSQL. Firestore remains authoritative.

## Existing Firestore contract found in the baseline

### Primary request collection

`rentalRequests/{requestId}`

New request IDs are generated in the application as `REQ-<Firestore document id>`.

### Fields used by the current application

The current source and Firestore rules establish these request fields:

- `id`
- `requesterUid`
- `requesterEmail`
- `requesterName`
- `requesterTeam`
- `laptopId`
- `assetCategory`
- `assetNo`
- `team`
- `borrower`
- `startDate`
- `dueDate`
- `purpose`
- `status`
- `adminMemo`
- `extensionCount`
- `lastExtensionApprovedDate`
- `nextExtensionRequestDate`
- `extensionHistory`
- `requestedAt`
- `createdAt`
- `updatedAt`

Fields that can appear after later user/admin processing include:

- `userActionRequest`
- `returnedAt`
- `overduePenaltyPending`
- `overduePenaltyBatchId`
- `syncedAt`

The source uses Korean runtime statuses such as `신청중`, `대여중`, `보류`, `불허`, `반납완료`, `사용자취소`, and derived return/overdue states in related flows. Phase 14 stores the existing status value without inventing a replacement enum.

### Existing user read scope

The current user application creates Firestore queries for:

- the current Firebase UID,
- every UID in `userAccounts.previousAccountUids`,
- the normalized Firebase/member email as an additional compatibility query.

The results are merged by request ID. Phase 14 mirrors this scope on the backend so historical requests linked to previous account UIDs are not lost.

### Adjacent collections intentionally not migrated in Phase 14

The request flow also uses:

- `rentalAvailability`
- `rentalAssets`
- `rentalRestrictions`
- `rentalRequestLogs`

`rentalRequestLogs` is administrator-only for `get/list` under current Firestore Rules. Phase 14 therefore does not attempt to bypass Security Rules with a Firebase Admin private key. Request-event/audit normalization is deferred to the administrator request-domain cutover phase.

## PostgreSQL migration

New migration:

`server/migrations/007_phase14_rental_request_foundation.sql`

The migration creates three normalized shadow tables.

### `app_user_rental_request_shadows`

Stores the request header/business state and preserves the original Firestore request ID as `source_request_id`.

The row is linked to the existing `app_user_identities.id` through `app_user_id`.

Nested source structures that are genuinely nested in Firestore remain typed JSONB only where appropriate:

- `extension_history`
- `user_action_request`

The complete Firestore document is **not** copied into one generic JSONB blob.

### `app_user_rental_request_item_shadows`

Stores the current single-asset request item separately:

- `laptop_id`
- `asset_category`
- `asset_no`

The current source contract contains one requested device per `rentalRequests` document, therefore Phase 14 enforces `line_number = 1` while keeping the request/item boundary explicit for later migration work.

### `app_user_rental_request_shadow_syncs`

Stores the per-user synchronization marker, request count, source hash, and sync timestamp.

This table is required to distinguish:

- a user who has never synchronized a shadow, from
- a valid synchronized user whose Firestore request count is zero.

## Firestore REST source synchronization

New backend client:

`server/src/firestore/firestore-rental-requests.mjs`

It calls Firestore REST `documents:runQuery` with the **current user's verified Firebase ID token**. It does not use a service-account/Admin private key.

Queries are issued for each linked current/previous requester UID and for the requester's email. Duplicate documents are removed by Firestore document path before normalization.

## Rental request shadow service

New files:

- `server/src/rentals/rental-request-repository.mjs`
- `server/src/rentals/rental-request-service.mjs`

The service verifies:

- Clerk user -> PostgreSQL application identity exists,
- PostgreSQL application identity -> Firebase legacy link exists,
- member shadow exists,
- supplied Firebase token UID matches the linked Firebase UID,
- supplied Firebase token email does not conflict with the linked Firebase email.

The repository replaces the current user's normalized shadow inside one PostgreSQL transaction and removes stale request rows that no longer exist in the Firestore result set.

## Phase 14 APIs

### PostgreSQL read candidate

`GET /api/users/me/rental-requests`

Authentication: Clerk session JWT.

Response source:

`postgresql-shadow`

The response is explicitly marked `authoritative: false`.

If the current user has never synchronized a rental-request shadow, the API returns the `rental_request_shadow_not_synced` state instead of treating an unsynchronized shadow as an empty history.

### Shadow synchronization

`POST /api/users/me/legacy/rental-request-shadows/sync`

Authentication:

- Clerk session JWT, and
- verified Firebase ID token through `X-Firebase-Authorization`.

The Firebase ID token is used for the Firestore REST owner queries described above.

### Backend parity comparison

`POST /api/users/me/legacy/rental-request-shadows/compare`

Authentication is the same as the synchronization endpoint.

It re-reads the current Firestore source and compares source hashes/request IDs against the PostgreSQL shadow without changing application read authority.

## Frontend parallel parity

New module:

`src/features/requests/rentalRequestReadParity.js`

New Vercel build-time gate:

`VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED=true`

Runtime opt-in query:

`rentalRequestParity=1`

The opt-in is latched in `sessionStorage` for the current tab. `rentalRequestParity=0` clears the latch.

The existing Firestore subscription remains the actual application read. When Phase 14 parity is explicitly enabled, the subscription publishes a normalized observation for diagnostics.

Comparison covers the full request candidate contract, including:

- request ID and order,
- requester identity fields,
- asset/model identifiers,
- requested dates,
- purpose/status/admin memo,
- extension state/history,
- pending user action request,
- return/overdue fields,
- created/updated/sync timestamps.

Firestore Timestamp objects and REST/PostgreSQL ISO timestamps are normalized before comparison.

## Diagnostic panel

The staging diagnostic panel is advanced to `Clerk Staging Test · Phase 14` and adds:

- Rental request parity requested
- Rental request candidate source
- Firestore request count
- PostgreSQL request count
- Frontend parity
- Backend shadow parity
- Changed request IDs
- Changed request fields
- Shadow synchronized timestamp

The action button `대여신청 Shadow 동기화·병행검증` synchronizes the shadow and immediately performs both frontend and backend parity checks.

## Preserved behavior

No Phase 14 changes were made to:

- `src/App.jsx`
- `src/firebase.js`
- `rules/firestore.rules`
- `firestore.indexes.json`
- `public/CNAME`
- `vercel.json`
- `src/main.jsx`

There is no new npm dependency.

Request creation and all existing Firestore writes remain unchanged.

## Deferred to later phases

Phase 15: opt-in PostgreSQL-preferred user request-history read with Firestore fallback, followed by Firestore request watcher/query reduction after parity validation.

Phase 16: transactional PostgreSQL authority for new user rental requests, including restriction and asset availability checks.

Phase 17: administrator request management, status processing, return flow, counts/dashboard reads, and request audit/event migration.
