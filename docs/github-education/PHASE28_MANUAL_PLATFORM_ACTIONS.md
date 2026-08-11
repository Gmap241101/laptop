# Phase 28 manual platform actions

## Heroku staging

1. Deploy the Phase 28 server source.
2. Set `SERVICE_VERSION=phase28`.
3. Set `FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true`.
4. Release phase applies migration `019_phase28_asset_board_write_mirror_retirement.sql`.
5. Verify `/health` reports database `ok` and `compatibility.assetBoardWriteMirrorDisabled=true`.

No new secret is required.

## Vercel staging/test project

Add:

`VITE_FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true`

Keep all existing Phase 9–27 variables. Redeploy because this is a Vite build-time variable.

## Firebase / Clerk / GitHub / DNS

- No Firebase Rules/index change.
- Do not disable Firebase Auth.
- No Clerk configuration change.
- Work only on `gh-pages-3`.
- No Production DNS or Production Clerk changes.
