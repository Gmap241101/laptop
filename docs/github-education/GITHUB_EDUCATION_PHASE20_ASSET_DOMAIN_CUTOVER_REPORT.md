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
- Firestore compatibility mirrors for `rentalAssets`, `rentalAssetNumbers`, `publicAssetCatalog/main`, and `rentalSystem/publicConfig.assetCategories`

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
