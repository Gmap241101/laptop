# Phase 28 — Asset / Board Firestore Write Mirror Retirement

## Baseline

Validated Phase 27 baseline:
`rental-system-github-education-phase27-legacy-firestore-read-fallback-retirement-20260811_deployment_package.zip`

## Scope

Phase 28 retires Firestore **write compatibility mirrors** for the domains that have the cleanest PostgreSQL authority boundary and have already been validated in staging:

- asset catalog / asset CRUD / asset categories / bulk asset registration
- notice posts and notice board config
- FAQ posts, FAQ categories, and FAQ board config

The PostgreSQL mutation remains authoritative. When Phase 28 is enabled on the backend, these mutations no longer require a Firestore document mirror to commit.

## Activation

Heroku:

`FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true`

Vercel diagnostic opt-in:

`VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true`

The backend value is authoritative. The Vercel value only tells the staging diagnostics that retirement is expected and lets it verify `/health` reports the same mode.

## Preserved compatibility

Phase 28 intentionally does **not** retire:

- Firebase administrator compatibility identity verification
- member profile / rental restriction write mirrors
- user/admin rental-request write mirrors
- site-shell Firestore write-through / parity fallback
- policy / terms Firestore transaction authority
- account recovery compatibility
- Firebase Auth / Firebase UID bridge

These remain because later phases still depend on their Firestore transaction or compatibility semantics.

## Rollback

Set both variables to `false` and redeploy the corresponding platform:

- Heroku: `FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=false`
- Vercel: `VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=false`

The old mirror code remains present and its default behavior remains covered by the Phase 20 and Phase 26 regression smoke tests.

## Safety boundary

With retirement enabled, asset and board edit/delete operations no longer read the mirrored Firestore document as a mutation prerequisite. Existence and concurrency validation are performed against PostgreSQL authoritative rows. Firebase administrator identity verification is still required.

## Automated validation

`npm run verify:phase28` completed with exit code 0. The Phase 20 and Phase 26 default mirror regressions still pass, while the Phase 28 disabled-mirror smoke proves asset/board Firestore source-read prerequisites and mirror writes are skipped.

Static audit remains at 137 Firestore call sites with 35 `onSnapshot`, 53 query reads, 31 document reads, and 18 count reads; warnings/errors are zero. The static count does not decrease yet because rollback/mirror source code remains packaged.

`npm run build:staging` passes all prebuild audits and reaches the existing environment limitation `vite: not found` (exit 127) because root `node_modules` is unavailable in the assistant runtime.
