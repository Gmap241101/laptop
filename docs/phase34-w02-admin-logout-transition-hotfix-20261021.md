# Phase 34 W02 | Administrator logout transition follow-up (2026-10-21)

## Baseline and observed Staging evidence

- Source baseline: `rental-system-phase34-w02-recovery-admin-ux-20261021_deployment_package.zip`, SHA-256 `5140ba6c512bd1c8fd045d93d379bc7988aa646e8873485d5e92ee5e64bfd571`.
- Staging GitHub commit `cae6c712312c44ff6fa2dcfe7a47c8ee699678d6`; Heroku release `v268`; Migration 043 present; `/health` status OK.
- Device Trust policy `enabled=true`, revision `4`, sync revision `4`, status `synchronized`; the administrator explicitly confirmed that revision 2 -> 4 resulted from two intentional OFF/ON changes. The W02 operation table contains `committed` and `verified` synchronized records for revision 4. No policy anomaly.
- User-observed bug: administrator **login** now opens the dashboard correctly, but **logout** renders login, then `관리자 데이터를 확인하는 중입니다.`, then login again. Therefore AC-UX01 logout remains **FAIL** on deployed v268.

## Root cause and corrective changes

1. `src/features/auth/useAdminAuthenticationController.js`: `signOutClerkForRuntimeSurface('admin')` previously called `clerkStagingClient.signOut({redirectUrl:'/admin'})`. Since the user is already on the independent `/admin` React root, redirecting to the same page restarts authentication bootstrap while the logout screen is settling. Remove the redundant redirect; invoke Clerk sign-out without a redirect option. Retain Clerk session invalidation and the existing separate `/admin` route.
2. `src/selectors/appReadinessSelectors.js`: an anonymous admin session (`authenticatedAdminId=''`) previously required `firebaseAuthReady && currentAuthRoleReady && adminAccountsReady` before displaying the login form. A bootstrap that briefly resets a readiness flag therefore caused `login -> data check -> login`. Give a genuinely anonymous admin screen a stable login display regardless of asynchronous readiness, **only if** there is no in-flight admin authentication transition, no authenticated admin session, and no administrative load error. Do not grant admin access based on this display rule.
3. `src/admin/AdminApp.jsx`: supply `readAdminAuthTransition()?.status==='pending'` to the readiness selector so legitimate interactive login / OTP sign-in never bypasses authoritative authentication checks.
4. Regression tests assert (a) no same-path sign-out redirect, (b) anonymous post-logout readiness fluctuations do not show a data-check screen, (c) restored or pending sessions continue to block unauthorized access, and (d) existing account/Device Trust flows are unaffected.

## Scope and constraints

- No migrations beyond the existing 043; existing server, DB schema, Device Trust policy, W01/W02 recovery logic, and all Production resources unchanged.
- Source-only patch to the frontend and its tests. No extra database, worker, storage, dyno, add-on, billing, or Firebase deployment.
- Static and Mock tests are not a substitute for actual browser acceptance. Staging owner + administrator must test 5 sign-ins each, 10 sign-outs combined, no data-check splash, direct `/admin` navigation, refresh, session expiration, Clerk OTP/re-auth, and dashboard metrics unchanged.
- User-interface changes must not add explanations of internal authentication mechanisms. Existing 4:3 administrator layout and toast positions preserved.

## Operator instructions

1. Download this **new Full ZIP** plus `.sha256`; validate with `Get-FileHash -Algorithm SHA256`.
2. On `E:\project\rental-system\test_new`, verify `git status --short` and use `./deploy.ps1`: select package `2` by **absolute path**, Firebase `0`, `START`, and Production publish `N`. `vite build` must PASS, and `origin/gh-pages-3` must receive a new commit distinct from `cae6c712`.
3. Confirm Vercel Staging deployment is using the new commit; **backend Heroku redeployment is not necessary** because there is no server change. Do not rerun Migration 043.
4. On `https://mkrental.vercel.app/admin`, repeat owner and ordinary administrator login/logout; expected `dashboard -> signing out -> login` without an intervening administrator data check. Observe absence of unauthorized flash, console exceptions and stale route jumps. Confirm the existing eight-area regression if authentication changes suggest any impact.
5. If Chrome still uses a stale Vercel asset, confirm deployment's commit hash and hard refresh; avoid Production or database modifications.
6. Share the new Staging SHA, Vite build PASS, test runs and any browser error. Do not transmit tokens or Clerk Secret Keys.
