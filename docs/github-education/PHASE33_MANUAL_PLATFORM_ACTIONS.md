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
Frontend hotfix revision: phase33-clerk-session-hydration-hotfix-20260812-0015
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
\n\n## Public content write-through authority hotfix — 2026-08-12 00:01 KST\n\nIf administrator home/banner/popup/footer lists are correct but the user home is missing the main visual, promotion banners, quick-link banners or popups, this is a Firestore-admin / PostgreSQL-public synchronization split, not a public-read source-selection problem.\n\nWith this hotfix and these Phase 33 flags enabled:\n\n```text\nVITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=true\nVITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=true\n```\n\nadministrator write-through is now mandatory automatically. `siteContentWrite=postgres` and `policyContentWrite=postgres` are no longer required for normal administrator saves.\n\nOn the first authenticated `/admin` session after this hotfix is deployed, the frontend automatically performs one reconciliation per browser session:\n\n```text\nsite-settings\nhome (homePage/config + every homeBanners document)\npopup\nfooter\nrental-config\nterms\n\nFirestore administrator source\n→ PostgreSQL public authority\n```\n\nThis repairs content that was missed before the authority cutover. Existing per-save domain synchronization remains active for later edits.\n\nExpected frontend marker:\n\n```text\nFrontend hotfix revision: phase33-clerk-session-hydration-hotfix-20260812-0015\n```\n\nDeployment for this hotfix:\n\n```text\nVercel Staging redeploy: required\nHeroku Staging redeploy: not required for this hotfix\nPostgreSQL migration: none\nNew environment variables: none\nFirebase Rules/index: unchanged\nClerk: unchanged\nProduction: unchanged\n```\n\nAfter Vercel redeploy:\n\n1. Open `/admin` and complete administrator authentication.\n2. Keep the page open until no PostgreSQL synchronization error toast appears. The first authenticated admin session performs the full repair automatically.\n3. Open the user plain URL in a fresh/reloaded tab.\n4. Confirm main visual, promotion banners, quick-link banners and published popups are visible.\n5. Edit one home banner and one popup in the administrator UI **without relying on the long test URL**, save them, then reload the user home and confirm the changes appear.\n6. Confirm footer/site settings and rental policy/terms still load from PostgreSQL.\n\nIf automatic reconciliation reports an error, do not re-enable silent user Firestore fallback. Keep public PostgreSQL authority enabled and report the exact synchronization error code so the Firestore-to-PostgreSQL bridge can be fixed directly.\n

## Clerk session hydration synchronization hotfix — 2026-08-12 00:15 KST

Observed Staging error:

```text
공개 콘텐츠 PostgreSQL 동기화에 실패했습니다.
오류 코드: site_content_clerk_session_missing
```

The administrator diagnostics can already show a valid Clerk administrator authority and a Firebase administrator compatibility session while the automatic content-repair effect has fired earlier from a restored local admin session. The previous write-through code read `globalThis.Clerk.session` directly and did not initialize/hydrate ClerkJS first. A refresh could therefore race ClerkJS hydration, fail the one-shot repair, and leave PostgreSQL public content incomplete.

This hotfix changes the token contract for administrator content writes:

```text
clerkStagingClient.initialize()
→ ClerkJS load + session hydration
→ active Clerk session token
→ Firebase administrator compatibility token
→ Firestore server read
→ PostgreSQL synchronization
```

The same direct-global Clerk token race was removed from notice/FAQ administrator PostgreSQL writes as a preventive correction.

The automatic repair session key was bumped to:

```text
mk_phase33_public_content_authority_repair_20260812_0015
```

Therefore a browser session that failed the previous `2355` repair will perform a fresh full reconciliation after this frontend is deployed.

Expected frontend marker:

```text
Frontend hotfix revision: phase33-clerk-session-hydration-hotfix-20260812-0015
```

Deployment:

```text
Vercel Staging redeploy: required
Heroku Staging redeploy: not required
PostgreSQL migration: none
New environment variables: none
Firebase Rules/index: unchanged
Clerk configuration: unchanged
Production: unchanged
```

After deployment:

1. Open `https://mkrental.vercel.app/admin` and complete/restore administrator login.
2. Confirm the new frontend hotfix revision.
3. Do not manually re-enable Firestore fallback.
4. Wait for the first-session reconciliation. There must be no `site_content_clerk_session_missing` toast.
5. Reload `https://mkrental.vercel.app/` and confirm the main visual, promotion banners, quick-link banners, popup and footer.
6. Edit and save one home banner and one popup from the plain administrator URL, then reload the user home and confirm both edits appear.

## Public content cache invalidation/read-back hotfix — 2026-08-12 00:45 KST

Manual diagnostics synchronization buttons are **not** part of the normal Phase 33 runtime contract. If PostgreSQL synchronization reports success, user content must refresh without an operator repeatedly pressing test-panel buttons.

This hotfix fixes the remaining public-content freshness split:

```text
Administrator Firestore save
→ Clerk/Firebase administrator authenticated PostgreSQL write-through
→ full payload/key read-back verification
→ PostgreSQL domain cache invalidation
→ same-tab CustomEvent + cross-tab localStorage broadcast
→ user home/popup/footer/site-settings automatic PostgreSQL re-read
```

The previous module cache had no expiration. It is now limited to 5 seconds, and successful writes explicitly invalidate it.

User public content also refreshes on:

```text
window focus
pageshow
visibility hidden → visible
```

The full administrator repair key is now:

```text
mk_phase33_public_content_authority_repair_20260812_0045
```

Expected frontend revision:

```text
Frontend hotfix revision: phase33-public-content-cache-invalidation-hotfix-20260812-0045
```

New strict synchronization failure code:

```text
site_content_sync_payload_mismatch
```

This means PostgreSQL returned the same document count but not the same canonical keys/payload/metadata as the Firestore server source. It must be fixed at the bridge; do not enable silent public Firestore fallback.

Deployment:

```text
Vercel Staging: redeploy required
Heroku Staging: no redeploy required for this hotfix
Migration: none
New environment variables: none
Firebase Rules/index: unchanged
Clerk configuration: unchanged
Production: unchanged
```

Post-deployment validation requires no diagnostics action buttons:

1. Open `https://mkrental.vercel.app/admin` and authenticate normally.
2. Wait for the automatic first-session reconciliation; no synchronization error toast should appear.
3. Open or focus `https://mkrental.vercel.app/` in another tab. Main visual, promotion banners, quick-link banners, popup and footer must refresh automatically.
4. Save one home banner and one popup from plain `/admin`.
5. Focus the user tab again. The saved content must appear without a hard reload and without pressing a diagnostics button.
6. A full reload must also show the same PostgreSQL content.

Passive diagnostics (no button required) now also show:

```text
Home banners from PostgreSQL: <raw count>
Home active hero / promotion / quick-link: <hero> / <promotion> / <quick-link>
Popup posts from PostgreSQL / active: <raw> / <active>
```

These are populated by normal user-page PostgreSQL reads. If raw counts are nonzero but active counts are zero, inspect the enabled/start/end schedule in the administrator UI rather than re-running synchronization buttons.

## 2026-08-12 public content visibility authority hotfix

Apply the full deployment package containing revision:

```text
phase33-public-content-visibility-hotfix-20260812-0105
```

This hotfix changes both backend and frontend runtime. Redeploy Heroku Staging and Vercel Staging. No PostgreSQL migration, Firebase Rules/index change, Clerk setting change, or new environment variable is required.

After deployment, do not press any diagnostics synchronization button. Normal runtime must work without it.

1. Open the Heroku Staging root response and confirm:
   `publicContentVisibilityRevision = phase33-public-content-visibility-hotfix-20260812-0105`.
2. Open `/admin` normally and confirm administrator site-content saves still succeed.
3. Open the plain public `/` URL in a fresh tab. Main visual, promotion banners, quick-link banners and active popups must render according to the same enabled/start/end state shown by the administrator editor.
4. Change one active home banner and one active popup in the administrator UI, save them, return to the public tab, and confirm the changes without using test-panel buttons.
5. The public path must remain PostgreSQL-authoritative; do not re-enable Firestore parity fallback.

## 2026-08-12 complete Firestore server-source → PostgreSQL synchronization hotfix

This hotfix addresses the recurrence where administrator Firestore lists are complete but the PostgreSQL public copy is partial, and a post-Firestore save synchronization can fail with:

```text
메인 비주얼 저장에 실패했습니다. 오류 코드: unauthorized
```

The historical Phase 25 fix forced Firestore server snapshots in the browser. Phase 33 now removes the browser as the PostgreSQL replacement-source boundary entirely.

New synchronization path:

```text
Administrator Firestore mutation commits
→ frontend requests domain synchronization
→ Clerk administrator JWT verification
→ Firebase administrator ID-token verification
→ backend reads the complete Firestore domain through Firestore REST
→ backend transactionally replaces the PostgreSQL domain
→ backend returns Firestore source count + PostgreSQL persisted count
→ counts must match
→ public PostgreSQL cache invalidation / user refresh
```

The browser no longer supplies `homeBanners`, `popupPosts`, `footerPages`, site settings, rental config, or terms documents as the PostgreSQL replacement payload.

### Authentication repair

If the first synchronization request returns:

```text
401 / unauthorized
```

the frontend performs exactly one forced Clerk JWT refresh:

```text
session.getToken({ skipCache: true })
```

and retries. A rejected Firebase credential similarly gets one forced Firebase ID-token refresh. This retry happens inside the normal save/synchronization flow and does not require a diagnostics button.

### Automatic full repair

The repair key is now:

```text
mk_phase33_public_content_authority_repair_20260812_0117
```

After deploying this package, a normal administrator login automatically re-synchronizes:

```text
site-settings
homePage/config + every homeBanners document
all popupPosts
siteFooter/config + every footerPages document
rentalSystem/publicConfig
signupTermsPolicy/current + every signupTerms document
```

Do **not** press diagnostics synchronization buttons for the validation below.

### Deployment

Both runtimes changed:

```text
1. Heroku Staging redeploy: required
2. Vercel Staging redeploy: required
3. PostgreSQL migration: none
4. New environment variables: none
5. Firebase Rules/index: unchanged
6. Clerk configuration: unchanged
7. Production / DNS / gh-pages: unchanged
```

Heroku root must show:

```text
publicContentSyncRevision = phase33-public-content-full-server-sync-hotfix-20260812-0117
```

Frontend diagnostics must show:

```text
Frontend hotfix revision: phase33-public-content-full-server-sync-hotfix-20260812-0117
```

### Staging validation without test-panel buttons

1. Deploy Heroku, then Vercel.
2. Open plain `https://mkrental.vercel.app/admin` and authenticate normally.
3. Do not press `Site content 전체 동기화` or any other diagnostics synchronization button.
4. Wait for the automatic repair to complete. There must be no `unauthorized`, `site_content_clerk_session_missing`, source-count mismatch, or source-invalid toast.
5. Open `https://mkrental.vercel.app/` in a fresh user tab.
6. Confirm all currently active main visuals, promotion banners, quick-link banners and popups are present. The quick-link set must no longer be a partial subset such as only one provider when more active records exist in the administrator list.
7. In the administrator UI, edit/save one active main visual. The save itself must complete successfully.
8. Edit/save one quick-link banner and one popup.
9. Return to the user tab. The PostgreSQL public view must reflect each change without pressing a diagnostics button.
10. In diagnostics, compare complete source/persisted counts. Labels are now `Firestore server document count` and `PostgreSQL document count`; they refer to all documents, not only enabled items.
11. User diagnostics `Home banners from PostgreSQL` and `Home active hero / promotion / quick-link` must match the administrator records and their current enabled/schedule state.

If a full-domain synchronization fails after this hotfix, use the exact new error code. Do not manually re-enable the public Firestore parity fallback; PostgreSQL remains the Phase 33 public authority.

## Plain administrator Clerk authority coupling hotfix — 2026-08-12 11:04 KST

The `0128` package still allowed a plain `/admin` session to remain Firebase-only unless
`?adminAuth=clerk` or the legacy session latch had previously enabled Clerk administrator
authentication. Phase 33 site/policy authority simultaneously forced PostgreSQL
write-through for every administrator save. The save could therefore commit to Firestore
and then fail before the backend request with `site_content_clerk_session_missing`.

This hotfix makes Clerk administrator authentication mandatory whenever either of these
Phase 33 authorities is enabled:

```text
VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

No query string or diagnostics button is required. A restored Firebase-only administrator
app session is not accepted as fully authenticated under those authority flags; the normal
administrator login completes both Clerk and Firebase compatibility authentication before
the automatic repair or a content save can run.

Expected frontend marker:

```text
Frontend hotfix revision: phase33-admin-clerk-authority-coupling-hotfix-20260812-1104
```

The backend full-domain synchronization revision remains:

```text
publicContentSyncRevision = phase33-public-content-full-server-sync-hotfix-20260812-0117
```

Deployment impact: Vercel Staging redeploy is required. Heroku Staging does not need a
second redeploy when the `0117` backend from the `0128` package is already active. There
are no environment-variable, migration, dependency, Clerk Console, Firebase Rules/index,
Production, DNS, or `gh-pages` changes.

## Phase 33 actual Staging PASS — 2026-08-12 KST

The deployed hotfix was confirmed in the real Staging browser environment:

```text
site_content_clerk_session_missing: resolved
administrator content save: PASS
complete public content visibility: PASS
```

Phase 33 is therefore an actual Staging PASS. Its intended boundary remains important:
public site/policy reads are PostgreSQL-authoritative, but transitional administrator
content editors still write Firestore first and synchronize the complete domain into
PostgreSQL. Full Firebase/Firestore retirement is not claimed by this phase. Phase 34
is authorized to replace the remaining administrator Firestore CRUD/onSnapshot paths
with direct PostgreSQL administration and then retire the compatibility bridge.
