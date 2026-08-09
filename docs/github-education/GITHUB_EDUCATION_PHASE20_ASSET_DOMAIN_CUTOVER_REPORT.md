# Phase 20 — Asset Domain PostgreSQL Cutover

## Scope
Phase 20 moves the asset domain into PostgreSQL in one large functional unit while preserving Firestore compatibility for staging rollback and remaining legacy paths.

Included:
- normalized PostgreSQL asset categories and asset master
- existing PostgreSQL rental reservation guards as the availability source
- public/user catalog PostgreSQL read
- administrator asset list PostgreSQL read
- administrator create/edit/delete PostgreSQL authority
- administrator bulk asset registration PostgreSQL authority
- administrator category add/rename/delete PostgreSQL authority
- dashboard asset metrics PostgreSQL overlay
- opt-in removal of `rentalAssets` and `rentalAvailability` realtime watchers
- one-time Firestore fallback only if PostgreSQL catalog/bootstrap fails
- Firestore compatibility mirrors for `rentalAssets`, `rentalAssetNumbers`, `publicCatalog/main`, and `rentalSystem/publicConfig.assetCategories`

## PostgreSQL migration
`012_phase20_asset_domain_cutover.sql` creates:
- `app_asset_categories`
- `app_rental_assets`
- `app_asset_catalog_syncs`

Availability remains derived from the already authoritative `app_rental_asset_reservation_guards` created in Phase 16.

## Runtime gates
- `VITE_ASSET_POSTGRES_READ_ENABLED=true` + `assetRead=postgres`
- `VITE_ASSET_POSTGRES_WRITE_ENABLED=true` + `assetWrite=postgres`

Without the explicit staging gates, the existing Firestore runtime is preserved.

## Compatibility and safety
The first administrator asset-domain entry bootstraps current Firestore assets/config into PostgreSQL once per Firebase administrator/session latch. PostgreSQL then supplies the user/admin catalog and availability. If PostgreSQL is unavailable, the browser performs a one-time Firestore fallback without creating realtime listeners.

Asset identity changes and deletion remain blocked while an active reservation exists. Asset-number uniqueness, catalog size, category integrity, and write operations are revalidated inside PostgreSQL transactions. Firestore compatibility mirrors must succeed before the PostgreSQL transaction commits.

## Automated validation summary
- `verify:phase20`: PASS
- React Hook audit: 159 source files
- Application flow audit: 124 contracts, 11 user routes, 20 administrator tabs
- Firestore strict audit: 131 total calls, 35 `onSnapshot`, 50 `getDocs`, 28 `getDoc`, 18 `getCountFromServer`, 52 approved risks, 0 unapproved warnings/errors
- No new npm dependency
- Root `App.jsx` is intentionally unchanged from the Phase 19 baseline.

## Runtime UI stability hotfix after first staging test
The first staging deployment exposed a frontend-only feedback loop in the Phase 20 asset read controller. The PostgreSQL catalog loader wrote a newly allocated `assetCategories` array into `splitPublicConfig` while the same array reference was also an effect dependency. This could repeatedly restart the loader, toggle `firebaseReady` back to false, temporarily apply the app-wide `pointer-events-none` loading state, and replace the same category list with a new array.

Observed runtime symptoms:
- administrator new-asset and edit buttons appeared unresponsive
- asset forms could fail to stay open
- category create/rename text was cleared immediately while typing
- temporary category edits/deletes were reset when the catalog loop re-synchronized unchanged category content

Fix:
- the asset catalog effect no longer depends on the category array it updates
- the latest category list needed by the one-time Firestore fallback is read through a ref instead
- the category editor reset effect now keys persisted categories by normalized content rather than array identity
- frontend Phase 20 smoke now rejects both regression patterns

No PostgreSQL schema, migration, API contract, Firestore Rules/index, App.jsx, or npm dependency change was required for this hotfix.

## Phase 20 runtime hotfix 2 — Firestore compatibility catalog path

Runtime verification after the UI-stability fix showed that PostgreSQL asset reads were healthy while create/edit/category mutations rolled back at the Firestore compatibility-mirror stage. The server mirror used the non-existent legacy path `publicCatalog/main`; the deployed client and Firestore Rules use `publicCatalog/main`.

The mirror now writes `publicCatalog/main`. Asset CRUD and category write failures also publish the backend error code into the Phase 20 diagnostic observation so a failed compatibility commit is visible instead of leaving the write fields as `-`.

No schema migration, Firestore Rules change, dependency change, or `src/App.jsx` change is required for this hotfix.
