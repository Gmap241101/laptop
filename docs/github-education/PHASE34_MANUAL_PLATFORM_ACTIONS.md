# Phase 34 manual platform actions — Firebase-free runtime authority

## Deployment scope

Staging only:

- GitHub source branch: `gh-pages-3`
- Vercel: `https://mkrental.vercel.app`
- Heroku Staging backend
- Clerk Development
- Heroku PostgreSQL

Do not modify `gh-pages`, Production Clerk, DNS, or `https://notebook.recruit.kro.kr`.

## Deployment order

1. Deploy the Phase 34 full source package to the Staging source branch/worktree.
2. Deploy Heroku Staging backend.
3. Run PostgreSQL migrations and confirm migration `025_phase34_hard_firebase_retirement.sql` is already applied and migration `026_phase34_rental_config_postgresql_bootstrap.sql` succeeds.
4. Confirm Heroku root/health reports Phase 34 runtime authority and `firebaseRuntime: retired`.
5. Deploy Vercel Staging frontend from `gh-pages-3`.
6. Confirm the diagnostics runtime revision is `phase34-firebase-free-runtime-authority-20260812-1500`.

## Environment cleanup

Firebase runtime variables are no longer required by the application. After the new backend/frontend are confirmed deployed, remove obsolete Staging variables that only existed for Firebase compatibility, including Firebase project identifiers and the old FIREBASE/FIRESTORE compatibility-retirement switches if they are still present. They are ignored by the Phase 34 source.

Keep Clerk/PostgreSQL/API variables required by the current runtime.

## Browser validation

### Administrator

- Clerk administrator login and `/admin` route persistence
- Dashboard counts
- Member list/detail/edit/status/directory
- Rental request list/count/detail/status/action/history
- Asset/category CRUD
- Notice/FAQ/category CRUD
- Site settings/home banners/popup/footer
- Rental policy/signup terms
- Administrator account create/edit/lock/retire
- Administrator/user session security settings

### User

- Existing converted user login
- New native signup → approval → login
- My Page profile read/edit
- Rental restriction read
- Rental request create/edit/cancel/extend/history
- Terms consent
- Email/password recovery and reset through Clerk
- Withdrawal blocker and disposable-account withdrawal

### Public

- Site settings/header
- Main visual/promotion/quick-link banners
- Popup/footer
- Notices/FAQ
- Asset catalog
- Rental policy/terms

## Network validation

In browser DevTools Network, filter for:

```text
firebase
firestore
googleapis
identitytoolkit
securetoken
```

Normal application flows must produce zero Firebase/Firestore authentication/database requests. Application API requests should target the Heroku Staging API and use Clerk `Authorization: Bearer ...` where authentication is required.

## Firebase Console

No Firebase Console action is required to deploy this package. Do not delete the Firebase project yet. Keep it untouched until Phase 34 Staging is explicitly confirmed PASS and the user separately approves final archival/deletion.

## PASS rule

Phase 34 becomes the confirmed baseline only after the complete Staging matrix passes with zero Firebase runtime network requests. Production promotion remains a separate, explicitly approved step.

## Phase 34 rental-config PostgreSQL canonical bootstrap hotfix (2026-08-12 16:00 KST)

### Why this hotfix is required
Phase 34 removed the legacy Firebase/Firestore bootstrap path, but migration 025 did not guarantee that the PostgreSQL site-content domain `rental-config` contained the canonical `rentalSystem/publicConfig` document. A Staging database that had not previously synchronized that domain therefore returned `site_content_not_synchronized`/missing-document semantics to the public frontend.

### Backend/data fix
- Apply `server/migrations/026_phase34_rental_config_postgresql_bootstrap.sql`.
- The migration creates the canonical PostgreSQL document only when it is missing and refreshes `app_site_content_syncs` to `source_mode=postgresql-self-heal`.
- The public site-content repository also performs the same PostgreSQL-only self-heal at read time if the sync row or canonical document is missing. This prevents a single missing migration/data row from taking the site down.
- No Firebase/Firestore fallback is used.

### Canonical bootstrap sources
The generated policy is built only from PostgreSQL state: asset categories, member-directory teams/version/count, and the existing PostgreSQL terms policy. Operational policy defaults are conservative (admin approval enabled; member-directory signup restriction enabled when the PostgreSQL directory contains members).

### Required Staging order
1. Deploy the new package to the Staging source branch.
2. Deploy Heroku Staging; the release command must apply migration 026.
3. Confirm the root JSON shows `phase34PolicyBootstrapRevision=phase34-rental-config-postgresql-bootstrap-hotfix-20260812-1545`.
4. Confirm `GET /api/site-content/rental-config` returns `source=postgresql` and includes document key `rentalSystem/publicConfig`.
5. Deploy/redeploy Vercel Staging.
6. Open the plain user URL. No diagnostics/bootstrap button should be required.

### Expected behavior
- The message `공개 설정을 PostgreSQL에서 불러오지 못했습니다` must no longer appear when the canonical row was previously missing.
- Home banners, popup/footer and signup terms use PostgreSQL-only reads; their Firestore parity/fallback code was removed from these runtime paths.
- Administrator asset bulk upload no longer requires a Firebase administrator session or Firebase ID token.

### Asset authority hardening in this hotfix
- Administrator asset create/edit/delete/category-save no longer depend on `firebaseAuth.currentUser` or a Firebase ID token.
- The backend asset service is PostgreSQL-only and has no Firestore mirror client/bootstrap branch.
- Validate normal asset CRUD, category save, and bulk upload after deployment.
