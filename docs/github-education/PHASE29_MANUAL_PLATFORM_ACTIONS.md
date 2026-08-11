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

## Hotfix re-deploy requirement
If the previous Phase 29 release showed PostgreSQL error `42703` for `metadata_key`, deploy the Phase 29 migration hotfix package. Migration 020 was rolled back and therefore should show `applying` again.

Before browser validation, Heroku must have:

```text
SERVICE_VERSION=phase29
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

Do not treat `version=phase29` alone as proof that Phase 29 is active. `/health` must also contain:

```text
rentalRequestWriteMirrorDisabled: true
rentalTransactionSource: postgresql
retiredWriteMirrorDomains: assets / notice / faq / rental-requests
```

## Second runtime hotfix requirement
After migration 020 is already applied, deploy the Phase 29 runtime hotfix package. The release phase must apply:

```text
021_phase29_rental_mirror_status_retired_constraint.sql
```

Expected result:

```text
[migration] applying: 021_phase29_rental_mirror_status_retired_constraint.sql
[migration] complete; newly applied=1
```

This migration permits `firestore_mirror_status=retired`. It is required before testing admin status/device saves or user rental mutations with the Phase 29 mirror-retirement flag enabled.

## Third runtime hotfix: administrator status persistence
If an administrator status change shows a success toast but the old status returns after leaving and reopening **기기 대여 신청관리**, deploy the Phase 29 administrator status persistence hotfix.

No new migration or environment variable is required. Keep:

```text
SERVICE_VERSION=phase29
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

Redeploy both the Phase 29 backend and frontend. In Phase 29 authoritative mode, administrator page entry and targeted sync must no longer import `rentalRequests` from Firestore. After deployment, change a test request to `대여중`, `보류`, or `불허`, leave the request-management screen, reopen it, and verify the changed PostgreSQL status remains persistent.

## Administrator list/routing hotfix redeploy
No new migration or environment variable is introduced by this hotfix. Keep migrations 020/021 and the existing Phase 29 flags.

Redeploy both Heroku and Vercel because the hotfix changes the PostgreSQL administrator list repository and frontend administrator routing/fallback behavior.

After redeploy verify:
1. administrator login lands directly on `/admin` and remains there;
2. pending/rental/closed/returned administrator tabs use PostgreSQL and `Admin cutover error` is `-`;
3. approve/hold/deny a request, leave the request-management tab, re-enter, and confirm the changed status remains in the correct tab;
4. Phase 29 must not show `Admin rental request active source: firestore-fallback`.
