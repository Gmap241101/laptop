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
3. Run PostgreSQL migrations and confirm migration `025_phase34_hard_firebase_retirement.sql` succeeds.
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
