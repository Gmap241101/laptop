# Phase 29 manual platform actions

## Heroku staging
Set:

```text
SERVICE_VERSION=phase29
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

Keep existing Phase 28 variables, including:

```text
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
```

Deploy the Phase 29 backend. Migration `020_phase29_rental_transaction_postgresql_authority.sql` is applied by the existing release phase.

Expected health compatibility values:

```text
rentalRequestWriteMirrorDisabled: true
rentalTransactionSource: postgresql
retiredWriteMirrorDomains includes rental-requests
```

## Vercel staging/test project
Add:

```text
VITE_FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

Keep all prior Phase variables and redeploy because VITE variables are build-time values.

## Clerk / Firebase / GitHub / DNS
- Clerk Development: no change.
- Firebase Auth: keep enabled.
- Firestore Rules/indexes: no Phase 29 change.
- GitHub: deploy only to `gh-pages-3`.
- Production `gh-pages`, Production Clerk, Production DNS: do not change.
