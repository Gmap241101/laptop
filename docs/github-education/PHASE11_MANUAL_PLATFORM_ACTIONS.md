# Phase 11 Manual Platform Actions

Phase 11 keeps Firestore as the authoritative member-profile **write** source while synchronizing every covered `userAccounts/{uid}` mutation into the linked PostgreSQL member shadow. The Phase 10 Firestore member-profile realtime watcher remains disabled in the explicit staging test session. PostgreSQL becomes fresh through write-through events plus a 15-second PostgreSQL-only refresh for remote changes.

## 1. Vercel - one new Production environment variable

Open:

`Vercel Dashboard -> mkrental -> Settings -> Environment Variables`

Add to the Vercel **Production** environment used by `mkrental.vercel.app`:

- Key: `VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED`
- Value: `true`

Keep the existing variables unchanged:

- `VITE_CLERK_STAGING_ENABLED=true`
- `VITE_API_URL=https://<current Heroku staging app>`
- `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
- `VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true`
- `VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED=true`

Do not put `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `DATABASE_URL`, Firebase private keys, or any other server secret in a `VITE_*` variable.

The new Vercel variable is injected at build time, so a new Vercel deployment is required. The recommended sequence is to add the variable first, then publish the Phase 11 package to `gh-pages-3`; the Git push should trigger the new Vercel build. If it does not, use `mkrental -> Deployments` and redeploy the latest `gh-pages-3` commit.

## 2. Heroku

Phase 11 adds **no new Heroku Config Var** and **no database migration**. Keep all current values unchanged.

Deploy the latest `gh-pages-3` backend code to the existing Heroku staging app. If Automatic Deploy is disabled:

`Heroku -> staging app -> Deploy -> gh-pages-3 -> Manual Deploy -> Deploy Branch`

Expected Release Phase:

- migrations 001 through 005: `already applied`
- `newly applied=0`

Only after the code release succeeds, set:

`SERVICE_VERSION=phase11`

The config change may create one additional release. Its migration result must also remain `newly applied=0`.

Health acceptance:

- `/health/live` -> `environment=staging`, `version=phase11`, `status=ok`
- `/health` -> `version=phase11`, `status=ok`, `database.status=ok`

## 3. Start one explicit Phase 11 browser session

Open this exact URL in a fresh browser tab:

`https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on`

The Phase 9/10/11 test mode is latched in `sessionStorage` for the current tab. This is intentional because the application's SPA navigation replaces `/`, `/mypage`, `/admin`, etc. without preserving query parameters. After the initial opt-in URL, navigating inside the same tab must therefore keep the PostgreSQL/watcher/write-through test active.

To reset the PostgreSQL/watcher cutover in that tab, close the tab or navigate once with `?memberRead=firestore`.

## 4. Pre-test acceptance

Before modifying anything, confirm the Phase 11 panel shows the existing Phase 10 success state:

- `Active read source: postgresql-shadow`
- `Firestore member watcher: disabled`
- `One-time Firestore fallback reads: 0`
- `Fallback reason: -`
- `Write-through requested: yes`

If `Write-through requested: no`, do not continue. Confirm the Vercel variable, new deployment, and initial URL above.

## 5. User self-write test - required

Use the currently linked Firebase/Clerk test member. Navigate to My Page **inside the same tab** and make a safe member-profile change, preferably a phone-number change that is easy to restore and does not intentionally trigger the directory-mismatch policy.

After the Firestore transaction succeeds, Phase 11 performs a best-effort server write-through. The original Firestore write is not rolled back if PostgreSQL synchronization fails.

Expected diagnostics after a successful save:

- `Last write-through: synced`
- `Write reason: user-profile-save`
- `Write Firebase: <current Firebase UID>`
- `Write error: -`
- `synced` counter increases
- `Active read source: postgresql-shadow`
- `Firestore member watcher: disabled`
- `One-time Firestore fallback reads: 0`

Then click `회원 Shadow 조회`. The PostgreSQL shadow must show the updated value. The current application's member profile should also refresh from PostgreSQL without waiting for a Firestore realtime listener.

Restore the test value if needed and verify a second `synced` event.

## 6. Terms write-through test - recommended

If a harmless terms decision can be changed in the test account, save it through the normal My Page terms flow.

Expected last reason:

`user-terms-consent-save`

`회원 Shadow 조회` must show the updated terms revision/policy version after the save.

## 7. Remote administrator freshness test - recommended with a dedicated test account

Use two browser sessions if available:

- Member browser: Phase 11 URL, watcher disabled, PostgreSQL active source.
- Administrator browser: change the dedicated test member's account status through the normal admin UI.

The administrator's Firestore write is followed by server write-through using the administrator's Firebase ID token. The backend rereads the target `userAccounts/{uid}` through Firestore REST; existing Firestore Security Rules decide whether that administrator may read/synchronize the target.

The member browser does not use a Firestore watcher. It refreshes the PostgreSQL candidate every 15 seconds, so a remote admin change should appear within approximately 15 seconds. A blocked/pending/retired status may intentionally trigger the application's existing logout/status behavior; use a disposable test account for this test.

## 8. Write-through failure semantics

Phase 11 is deliberately fail-independent:

1. Firestore write commits first.
2. PostgreSQL write-through runs after success.
3. If write-through fails, the already-committed Firestore write remains successful.
4. Diagnostics report `Last write-through: failed` and the error code.
5. Do not proceed to the next migration phase until the shadow is repaired with the existing `회원 Shadow 동기화` action and `회원 Shadow 비교` returns equivalent.

This avoids turning an auxiliary migration path into a new failure mode for existing production-compatible Firebase writes.

## 9. Covered standard mutation paths

Phase 11 hooks these standard `userAccounts` mutations:

- user My Page profile save
- user membership withdrawal + rollback
- terms-consent revision/profile update
- automatic member-directory verification/status reconciliation
- administrator member status changes
- administrator directory-policy restore
- administrator member-directory audit/rebuild writes
- administrator member-directory save/index metadata writes

New Firebase signup is intentionally not write-through synchronized before a Clerk/PostgreSQL link exists. The existing Clerk identity -> Firebase link -> member shadow synchronization establishes the initial PostgreSQL profile later.

System backup/restore is a maintenance operation outside the normal write-through path. After a member-scope restore, run the existing member Shadow synchronization/equivalence checks before using watcher-disabled PostgreSQL reads.

## 10. Phase 11 acceptance criteria

Do not proceed until all are true:

- Heroku `phase11 / ok`
- DB `ok`
- migrations `newly applied=0`
- `Active read source: postgresql-shadow`
- `Firestore member watcher: disabled`
- initial `One-time Firestore fallback reads: 0`
- `Write-through requested: yes`
- at least one real member-profile Firestore mutation produces `Last write-through: synced`
- `회원 Shadow 조회` reflects the mutation
- normal member screens continue working
- no write-through `failed` counter remains unexplained
- if testing remote admin changes, the member session observes the PostgreSQL update within approximately 15 seconds without a Firestore profile watcher
