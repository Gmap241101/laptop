# Phase 33 manual platform actions

## Scope

Phase 33 retires Firebase Authentication for normal user runtime and moves public site-shell/policy reads to PostgreSQL authority. Administrator Firebase compatibility is deliberately preserved until Phase 34 because administrator settings/policy management still contains transitional Firestore CRUD/onSnapshot paths.

## Important: deploy in two stages

Do **not** enable the final public content authority flags before PostgreSQL content is complete. Phase 32 Staging diagnostics showed a real popup mismatch (PostgreSQL enabled count 0 vs Firestore server enabled count 5).

### Stage A - deploy Phase 33 code while compatibility remains on

Deploy the new Phase 33 backend and frontend source first, but keep:

```text
FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED=false
VITE_USER_FIREBASE_AUTH_COMPATIBILITY_DISABLED=false
VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=false
VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=false
```

Keep all previous Phase 32 PostgreSQL authority/write-retirement flags unchanged.

Expected runtime revision after code deployment:

```text
phase33-user-clerk-content-authority-20260811-2210
```

### Stage B - synchronize public content from the administrator UI

While administrator Firebase compatibility remains available:

1. Sign in at `/admin`.
2. Run the existing site-content full synchronization/write-through controls.
3. Verify PostgreSQL site settings, home data, popup posts and footer pages match the published Firestore content.
4. Run the existing policy/terms synchronization/write-through controls.
5. Verify rental configuration and signup/terms definitions are complete in PostgreSQL.
6. Re-open public home/popup/footer/policy views before final cutover and verify there is no missing PostgreSQL content.

Do not proceed to Stage C if PostgreSQL counts/content are incomplete.

### Stage C - retire normal-user Firebase Auth and enable public content authority

Heroku Staging:

```text
SERVICE_VERSION=phase33
FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED=true
```

Keep:

```text
FIRESTORE_ACCOUNT_LIFECYCLE_COMPATIBILITY_DISABLED=true
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
FIRESTORE_MEMBER_PROFILE_WRITE_MIRROR_DISABLED=true
```

Redeploy/restart Heroku Staging.

Vercel Staging:

```text
VITE_USER_FIREBASE_AUTH_COMPATIBILITY_DISABLED=true
VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

Keep all existing Phase 32 PostgreSQL cutover variables true/off as previously validated, especially:

```text
VITE_ACCOUNT_LIFECYCLE_POSTGRES_AUTHORITY_ENABLED=true
VITE_USER_CLERK_AUTH_ENABLED=true
VITE_USER_CLERK_LIFECYCLE_ENABLED=true
VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true
VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED=true
VITE_MEMBER_PROFILE_POSTGRES_WRITE_ENABLED=true
VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED=true
VITE_RENTAL_RESTRICTION_POSTGRES_WRITE_ENABLED=true
VITE_RENTAL_REQUEST_POSTGRES_READ_ENABLED=true
VITE_RENTAL_REQUEST_FIRESTORE_WATCHER_DISABLED=true
VITE_RENTAL_REQUEST_POSTGRES_WRITE_ENABLED=true
VITE_RENTAL_REQUEST_USER_ACTION_POSTGRES_WRITE_ENABLED=true
VITE_LEGACY_FIRESTORE_READ_FALLBACK_DISABLED=true
```

Redeploy Vercel Staging.

## Heroku verification

Open the Staging backend root/health endpoint and confirm the Phase 33 runtime contract contains:

```text
runtimeRevision: phase33-user-clerk-content-authority-20260811-2210
userFirebaseAuthCompatibilityDisabled: true
userAuthenticationSource: clerk-postgresql
userLegacyMemberKeySource: postgresql-compatibility-key
passwordResetDelivery: clerk-email-code
adminFirebaseAuthCompatibility: preserved
```

No SQL migration is required.

## Clerk Development requirement

The Development instance must support the password reset email-code strategy used by the custom reset flow. Test a real disposable account before Phase 33 is declared PASS.

Do not change Production Clerk during this Phase.

## User validation - plain URL is mandatory

Use:

```text
https://mkrental.vercel.app/
```

A Phase 33 PASS must not depend on a long query-string cutover URL.

Expected diagnostics after relevant views have loaded:

```text
Runtime revision: phase33-user-clerk-content-authority-20260811-2210
User Firebase Auth retirement requested: yes
User Firebase Auth retirement backend applied: yes
User authentication source: clerk-postgresql
Legacy member key source: postgresql-compatibility-key
Password reset delivery: clerk-email-code
Public site content PostgreSQL authority requested: yes
Public policy content PostgreSQL authority requested: yes
Phase 33 authority error: -
Firebase signed in: no
```

The older Phase 32 diagnostics should remain healthy where retained for historical cutover status.

## User browser regression matrix

Test at minimum both an existing converted member and a newly created Phase 33 native member.

### Existing converted member

1. Login without Firebase Auth session.
2. Stay logged in for 30-60 seconds.
3. My Page profile display/edit.
4. Rental restriction state.
5. Rental request list.
6. Create/edit/cancel/extend as applicable.
7. Terms compliance/read/save.
8. Password verification/change.
9. Account recovery reset via Clerk code.
10. Withdrawal blocker behavior; do not withdraw a valuable test identity unless disposable.

### New native member

1. Create a new account.
2. Verify no Firebase Auth account/session is required by the user runtime.
3. For pending approval policy, approve from administrator member management.
4. Login after approval.
5. Confirm name/team/phone canonical PostgreSQL profile.
6. Rental restriction no-row case is treated as unrestricted.
7. Create a rental request and confirm it in My Rental Requests.
8. Test edit/cancel/extend as applicable.
9. Test My Page password change.
10. Test password reset with Clerk email code.
11. Test withdrawal on a disposable member with no blockers.

## Public content regression

After authority flags are enabled:

- home content comes from PostgreSQL;
- published popups come from PostgreSQL;
- footer pages/links come from PostgreSQL;
- site settings come from PostgreSQL;
- rental configuration comes from PostgreSQL;
- signup/terms definitions come from PostgreSQL;
- normal public reads do not report `firestore-parity-fallback` or `firestore-onSnapshot` as active authority.

If PostgreSQL content is missing, do not re-enable silent public Firestore fallback. Roll back the authority flag and synchronize/fix PostgreSQL content deliberately.

## Administrator regression

Use the administrator Staging URL and verify:

1. Clerk administrator login succeeds.
2. `/admin` remains persistent for at least 10 seconds and across menu navigation.
3. Administrator Firebase compatibility may still show signed-in; this is expected in Phase 33.
4. Member list/profile/status/restriction management remains PostgreSQL authority.
5. Rental request/asset/notice/FAQ administration remains PostgreSQL authority.
6. Settings/policy Firestore transitional editor/onSnapshot + PostgreSQL write-through still works.
7. Full site/policy synchronization controls still work.

## Rollback

User Firebase retirement rollback:

```text
Heroku: FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED=false
Vercel: VITE_USER_FIREBASE_AUTH_COMPATIBILITY_DISABLED=false
```

Public content authority rollback:

```text
VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=false
VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=false
```

For a deliberate per-session frontend test, the Phase 33 source retains rollback query modes such as `userFirebaseAuth=firebase`, `siteContent=firestore`, and `policyContent=firestore` where implemented. Do not use those for normal PASS validation.

No migration rollback is required because Phase 33 adds no migration.

## Protected Production resources

Do not change:

```text
gh-pages
Production Clerk
Production DNS
https://notebook.recruit.kro.kr
```

Production promotion remains a separate user-approved operation after final Staging cleanup.

## Administrator diagnostics render hotfix — 2026-08-11 23:20 KST

If the administrator test URL shows the full-page message `화면을 불러오는 중 오류가 발생했습니다.`, deploy the Phase 33 diagnostics-render hotfix before continuing Phase 33 validation.

Confirmed cause:

```text
ClerkStagingDiagnostics
→ Phase 32 section referenced PHASE32_RUNTIME_REVISION
→ constant definition was removed during Phase 33 rename
→ ReferenceError during diagnostics render
→ shared RootErrorBoundary replaced the whole application UI
```

The hotfix restores the Phase 32 constant and isolates the diagnostics panel with its own error boundary. It also fixes the Phase 33 Clerk password-reset context slice so `passwordResetStage` reaches `UserAuthPanel`.

Expected diagnostics markers after Vercel redeploy:

```text
Clerk Staging Test · Phase 33
Runtime revision: phase33-user-clerk-content-authority-20260811-2210
Frontend hotfix revision: phase33-admin-diagnostics-render-hotfix-20260811-2320
```

For this hotfix:

```text
Vercel Staging redeploy: required
Heroku Staging redeploy: not required
PostgreSQL migration: none
New environment variables: none
Clerk change: none
Firebase Console change: none
Firestore Rules/index change: none
Production change: none
```

After the Vercel redeploy, reopen the administrator diagnostics URL first. The normal administrator UI and the Phase 33 diagnostics panel must both render. Only then continue the staged Phase 33 content synchronization and authority-flag validation described above.
