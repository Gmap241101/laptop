# Phase 26 Manual Platform Actions

## Scope
Phase 26 moves notice/FAQ public and administrator board operations toward PostgreSQL authority while retaining Firestore compatibility mirrors during staging.

## Heroku staging
1. Deploy the Phase 26 server source.
2. Set `SERVICE_VERSION=phase26`.
3. The existing Procfile release phase runs migration `018_phase26_notice_faq_board_authority.sql`.
4. No new secret is required.
5. Confirm `/health` reports `version: phase26`, `status: ok`, and database `status: ok`.

## Vercel staging/test (`mkrental`)
Add and redeploy:

```text
VITE_BOARD_CONTENT_POSTGRES_READ_ENABLED=true
VITE_BOARD_CONTENT_POSTGRES_WRITE_ENABLED=true
```

Do not remove existing Phase 9–25 environment variables.

## First staging bootstrap
After both deployments, open the full Phase 26 administrator test URL, authenticate, and click **Notice / FAQ PostgreSQL bootstrap** once. This imports the current Firestore server data for `noticeBoard/config`, `noticePosts`, `faqBoard/config`, `faqCategories`, and `faqPosts` into PostgreSQL.

## Clerk / Firebase / GitHub / DNS
- Clerk Development: no new setting or secret.
- Firebase Auth: retain compatibility session.
- Firestore Rules/indexes: no Phase 26 changes.
- GitHub: apply only to `gh-pages-3`.
- `gh-pages`, production DNS, Production Clerk, and `notebook.recruit.kro.kr`: do not change.
