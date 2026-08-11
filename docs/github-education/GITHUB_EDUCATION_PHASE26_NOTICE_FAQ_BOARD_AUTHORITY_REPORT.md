# GitHub Education Migration — Phase 26 Notice / FAQ Board Authority

## Objective
Phase 26 migrates notice and FAQ runtime board semantics from Firestore-first reads and writes to PostgreSQL-preferred reads and PostgreSQL-authoritative administrator mutations, while retaining Firestore as a compatibility mirror during staging.

## Included semantics
- Notice pinned/regular listing, pagination, search, detail reads, and view count.
- FAQ category list, pinned/regular listing, pagination, category filtering, search, and search-within-category.
- Administrator notice/FAQ create, edit, delete.
- Administrator page-size settings.
- FAQ category create, rename, delete with PostgreSQL usage protection.
- Firestore server bootstrap into PostgreSQL.
- Firestore compatibility mirror before PostgreSQL administrator mutation commit.

## PostgreSQL model
Migration `018_phase26_notice_faq_board_authority.sql` creates:
- `app_board_configs`
- `app_faq_categories`
- `app_board_posts`
- `app_board_syncs`

Notice and FAQ posts share the normalized `app_board_posts` authority table. FAQ category deletion is restricted while PostgreSQL posts reference the category.

## Authority boundary
- Public notice/FAQ read: PostgreSQL preferred when Phase 26 staging opt-in is active.
- Admin notice/FAQ read: PostgreSQL preferred when opt-in is active.
- Admin board mutation: PostgreSQL authoritative.
- Admin Firestore mirror: required before PostgreSQL transaction commit.
- Notice view count: PostgreSQL authoritative; the existing client Firestore +1 transaction remains as a best-effort compatibility mirror.
- Rollback path: query/session opt-out restores existing Firestore board behavior.

## Frontend cutover
`src/features/boards/boardContentCutover.js` provides the build-time/query/session gates and board APIs.

Read gate:
- `VITE_BOARD_CONTENT_POSTGRES_READ_ENABLED=true`
- `boardContent=postgres`

Write gate:
- `VITE_BOARD_CONTENT_POSTGRES_WRITE_ENABLED=true`
- `boardWrite=postgres`

Rollback:
- `boardContent=firestore`
- `boardWrite=firestore`

## App.jsx
Phase 26 does not change `src/App.jsx`; board authority remains in split feature controllers.

## Production boundary
Phase 26 changes staging/test only. No production branch, production DNS, Production Clerk, or production custom domain promotion is included.

## Automated verification result
Final Phase 26 source passed `npm run verify:phase26` with exit code 0.

Static metrics:
- React source files: 165
- Application contracts: 124
- User routes: 11
- Administrator tabs: 20
- Firestore calls: 137
  - `onSnapshot`: 35
  - `getDocs` / server-only equivalents: 53
  - `getDoc` / server-only equivalents: 31
  - `getCountFromServer`: 18
- Firestore unapproved warnings: 0
- Firestore unapproved errors: 0

The Phase 26 board path replaces the active notice/FAQ Firestore subscriptions and query/count reads when PostgreSQL cutover is enabled. The legacy Firestore paths remain available only as staged fallback/rollback compatibility paths, so static source call counts do not directly represent active PostgreSQL-session read volume.

Build prechecks pass. The assistant environment does not contain the root Vite executable, so `npm run build:staging` reaches `vite: not found` with exit 127 after all React/application/Firestore prebuild audits pass. Vercel remains the actual staging bundle check.
