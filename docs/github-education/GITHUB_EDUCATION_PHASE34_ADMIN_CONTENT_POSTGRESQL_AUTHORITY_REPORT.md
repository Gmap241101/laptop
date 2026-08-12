# Phase 34 — Firebase-free runtime authority

## Outcome

Phase 34 removes Firebase as an application runtime provider. The supported Staging architecture is now:

```text
Browser
  → Clerk session
  → Heroku API
  → PostgreSQL
```

The frontend no longer imports the Firebase Web SDK. The backend no longer contains Firebase token-verification or Firestore REST clients. Normal user/admin/public flows do not have a Firebase/Firestore network path.

## PostgreSQL/Clerk authority

- Administrator dashboard: PostgreSQL rental/member/asset APIs
- Administrator accounts: Clerk + `app_admin_identity_registry`
- Administrator/user security settings: `app_system_configuration`
- Members/profile/status/directory/recovery: PostgreSQL
- Rental restrictions/requests/actions/admin processing: PostgreSQL
- Assets/categories/availability: PostgreSQL
- Notice/FAQ: PostgreSQL
- Site shell/home/popup/footer: PostgreSQL
- Rental policy/signup terms/consent: PostgreSQL
- User/admin authentication and password lifecycle: Clerk

## Removed runtime components

- `firebase` npm package and `@firebase/*` dependency tree
- `src/firebase.js`
- Firebase project/bootstrap files used by the application runtime
- Firestore Rules/index files from the deployment source
- server Firebase ID-token verifier
- server Firestore REST/client modules
- administrator dashboard Firestore summary subscription
- browser Firestore backup/restore/reset runtime
- Firestore-to-PostgreSQL runtime synchronization controls
- Firebase administrator-account runtime CRUD

## Historical database names

Existing PostgreSQL columns/tables created in earlier migration phases still contain historical names such as `firebase_uid` and `app_user_firebase_links`. They now store/relate the existing legacy member key only. No request is made to Firebase with those values. Renaming these database columns is intentionally deferred because it would require a separate production data migration across existing foreign-key and history relationships.

## Migration

`025_phase34_hard_firebase_retirement.sql` adds:

- `app_system_configuration`
- administrator lock/retirement fields
- Phase 34 runtime metadata

No previously applied migration is modified.

## Safety boundary

This is Staging-only until browser validation passes. Production branch, Production Clerk, DNS and the current Firebase project are not deleted or changed by the source package. The Firebase project may be kept temporarily as an offline rollback archive; the deployed application does not depend on it.
