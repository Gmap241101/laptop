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

## Phase 34 PostgreSQL payload mapping hotfix (2026-08-12)

If migration 026 and the Phase 34 backend are already applied but both user/admin UI show `공개 설정을 PostgreSQL에서 불러오지 못했습니다`, deploy the frontend mapping hotfix. The prior 1612 frontend called the removed Firestore-era `reviveValue()` helper after a successful `/api/site-content/:domain` response, causing a browser ReferenceError. No additional SQL migration is required for this hotfix. Heroku may stay on the current Phase 34 backend; Vercel must be redeployed with the new frontend. Diagnostics must show `Frontend mapping revision: phase34-postgresql-payload-mapping-hotfix-20260812-1635`.

## 2026-08-12 Runtime regression + PostgreSQL reset restoration hotfix

Revision: `phase34-rental-request-restriction-content-reset-hotfix-20260812-1740`

### Deployment
- Deploy the full package to Heroku Staging first because the backend adds the current-user rental-restriction authority endpoint and PostgreSQL reset API behavior.
- Migration 027 remains the newest migration; this hotfix adds no migration. If 027 is already applied, release should report it as already applied.
- Redeploy Vercel Staging after the Heroku revision is live.
- No Firebase configuration or Firebase service is required.

### Required browser checks
1. Existing converted member: login, confirm no rental-restriction error, create a rental request, verify no `rental_request_id_invalid`.
2. Newly created member: repeat the same rental-restriction and rental-request tests.
3. Administrator > Home screen: create a hero, promotion and quick-link banner; confirm no `createSiteContentDomainDocument is not defined`.
4. Administrator > Popup/Footer: create a popup and footer menu page; confirm PostgreSQL persistence and public rendering.
5. Administrator > System > Data management > Backup/Reset: Owner selects scopes, scans target counts, creates the mandatory full backup, enters `테스트 데이터 전체 초기화`, confirms and runs the selected PostgreSQL reset. Do this only with disposable Staging data.

### Reset safety contract
- Schema migrations are preserved.
- Administrator account/role registry is preserved.
- Clerk authentication identities are preserved.
- Member reset removes PostgreSQL member profile/consent state but does not delete Clerk identities.
- Site settings are reseeded with a safe PostgreSQL default row; rental-config is recreated by the Phase 34 canonical self-heal.
- Browser JSON restore remains intentionally separate because a safe PostgreSQL restore needs FK/schema-version validation.

## 2026-08-12 Settings repository + member createdAt hotfix

Revision: `phase34-settings-repository-member-createdat-hotfix-20260812-1835`

### Root cause fixed
- `server/src/content/site-content-repository.mjs` defined repository methods as arrow functions but called `this.getDomain()` / `this.getRentalConfigBootstrapContext()`. PostgreSQL writes could COMMIT successfully and then throw `TypeError` while building the API response. This affected holiday and rental-policy settings saves and could make a successful DB write appear as a failed save.
- Administrator member profile edit responses omitted `createdAt`, and member detail/edit timestamp formatting only supported the old Firestore `toDate()` shape. After an edit, the selected member state could therefore lose the visible signup timestamp even though PostgreSQL still retained it.

### Fix
- Site-content repository now uses closure-bound `getDomain`, `replaceDomain`, and `getRentalConfigBootstrapContext` functions; no arrow-function `this` calls remain.
- Rental policy failures now surface the actual error code/name.
- PostgreSQL member profile projection preserves `createdAt` and `updatedAt`.
- Administrator member list/detail/edit views share a PostgreSQL-compatible timestamp formatter that accepts both historical `toDate()` values and ISO/timestamp strings.
- Administrator member edit state merges the server response into the previous account and explicitly preserves `createdAt`.

### Required Staging check
1. Heroku and Vercel both need redeployment because backend repository/member projection and frontend display logic changed.
2. No new SQL migration is required; migration 027 remains latest.
3. Save a rental policy change, then create/update/delete a holiday. No `TypeError` should appear and the values must remain after reload.
4. Edit an existing member's name/team/phone. The detail panel must continue to show the original signup timestamp after the save and after reloading the member list.
5. Confirm diagnostics/root JSON show `phase34SettingsRepositoryMemberRevision=phase34-settings-repository-member-createdat-hotfix-20260812-1835`.
