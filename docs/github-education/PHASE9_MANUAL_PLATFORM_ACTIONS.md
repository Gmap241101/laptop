# Phase 9 Manual Platform Actions

## Purpose

Phase 9 is a staging-only member-profile read cutover test. The React application may use the PostgreSQL shadow as the active `userProfile`, but only when it exactly matches the live Firestore `userAccounts/{uid}` snapshot. Firestore remains subscribed as the guard/fallback in this phase.

This means Phase 9 validates correctness; it does **not** reduce Firestore read quota yet.

## Before deploy.ps1

### Vercel: add one new Production environment variable to the `mkrental` staging project

Open:

`Vercel Dashboard -> mkrental -> Settings -> Environment Variables`

Add:

```text
Key
VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED

Value
true
```

Apply it to the Vercel **Production** environment because `https://mkrental.vercel.app` is the Production deployment of the dedicated staging project.

Keep the existing values unchanged:

```text
VITE_CLERK_STAGING_ENABLED=true
VITE_API_URL=https://<current-heroku-staging-app>
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Do not create `.env`, `.env.local`, or `.env.example` files. Do not put `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, or `DATABASE_URL` into Vercel.

### Heroku

No new Config Var is required for Phase 9. Keep the existing Phase 8/Phase 6 settings, including:

```text
APP_ENV=staging
DATABASE_URL=<managed by Heroku>
DATABASE_SSL_MODE=require
FIREBASE_PROJECT_ID=laptop-system-mk
CLERK_JWT_KEY=<existing PEM public key>
CLERK_SECRET_KEY=<existing sk_test_...>
CLERK_AUTHORIZED_PARTIES=https://mkrental.vercel.app
CORS_ALLOWED_ORIGINS=https://mkrental.vercel.app
```

Before code deployment, keep `SERVICE_VERSION=phase8`.

### Clerk

No change.

### Firebase Console

No change. No Rules publication, service-account JSON, or Admin private key is required.

## deploy.ps1 v13.1

Deploy only the new Phase 9 full package to `gh-pages-3`.

Do not publish `gh-pages` and do not modify `notebook.recruit.kro.kr`.

## After deploy.ps1

### Heroku deployment

If GitHub Automatic Deploy for the staging API is disabled:

`Heroku Dashboard -> staging app -> Deploy -> gh-pages-3 -> Manual Deploy -> Deploy Branch`

The Release Phase must apply:

```text
005_phase9_member_profile_runtime_contract.sql
```

Expected first deployment:

```text
001 ... already applied
002 ... already applied
003 ... already applied
004 ... already applied
005_phase9_member_profile_runtime_contract.sql ... applying
newly applied=1
```

Migration 005 is additive. It adds only:

```text
identity_key
recovery_key
previous_account_uids
```

to `app_user_member_shadows`.

### Set service version only after the deployment succeeded

Heroku Config Vars:

```text
SERVICE_VERSION=phase9
```

This creates another Heroku release. The Release Phase should then report all migrations including 005 as already applied and `newly applied=0`.

### Health checks

Verify:

```text
https://<HEROKU-STAGING>/health/live
https://<HEROKU-STAGING>/health
```

Expected:

```text
environment = staging
version = phase9
status = ok
```

and `/health` must also contain:

```text
database.status = ok
```

## Required shadow refresh after migration 005

Existing Phase 7 shadow rows receive empty defaults for the three new Phase 9 runtime fields until they are resynchronized.

Therefore, before enabling the read cutover in the browser:

1. Sign in to the normal Firebase staging site.
2. Open:
   `https://mkrental.vercel.app/?clerkTest=1`
3. Sign in to Clerk if necessary.
4. Confirm `Clerk user = Backend user`.
5. Confirm `Firebase user = Linked Firebase`.
6. Click **회원 Shadow 동기화** once.
7. Click **회원 Shadow 비교**.
8. Require:

```text
Shadow equivalent: yes
Changed fields: -
```

If `identityKey`, `recoveryKey`, or `previousAccountUids` appears in Changed fields, do not continue until Shadow synchronization succeeds.

## Phase 9 opt-in browser test

Use this URL only for the cutover test:

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres
```

The `memberRead=postgres` parameter is required. Without it, the application remains in the normal Firestore-first behavior even if the Vercel environment variable is enabled.

Expected Phase 9 diagnostics:

```text
Cutover requested: yes
Active read source: postgresql-shadow
Cutover equivalent: yes
Cutover changed fields: -
Fallback reason: -
```

The existing Phase 8 parity section should also remain:

```text
Read equivalent: yes
Read changed fields: -
```

## Functional regression test while PostgreSQL is the active profile source

With the Phase 9 opt-in URL, verify at least:

1. Login state remains valid.
2. User workspace opens normally.
3. User name/team/status display correctly.
4. Rental request screen opens.
5. Request history loads, including historical account UIDs if the account has any.
6. My Page opens and current name/team/phone are correct.
7. Terms status behaves normally.
8. Logout and login again.
9. Reopen the opt-in URL and require `Active read source: postgresql-shadow` again.

Do not test destructive withdrawal solely for Phase 9 validation. The runtime keys required by withdrawal are included in the candidate and covered by automated contract checks.

## Automatic fallback behavior

Phase 9 intentionally keeps the Firestore `onSnapshot` subscription active.

The React state uses PostgreSQL only if the PostgreSQL candidate and the current live Firestore snapshot are equivalent. If any of the following occurs, it automatically uses Firestore instead:

- candidate API unavailable
- Firebase token rejected
- PostgreSQL shadow missing
- linked identity missing
- any compared profile field differs

The diagnostics will show:

```text
Active read source: firestore-onSnapshot
Fallback reason: <reason>
```

Typical mismatch:

```text
Fallback reason: profile-mismatch
Cutover changed fields: team
```

In that case, click **회원 Shadow 비교**, then **회원 Shadow 동기화** if the Firestore change is legitimate, and test again.

## Vercel deployment

Vercel environment variables affect new builds. If the `gh-pages-3` commit was already deployed before adding `VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true`, redeploy after adding the variable:

`Vercel -> mkrental -> Deployments -> latest gh-pages-3 deployment -> Redeploy`

## What not to change

Do not change:

- GitHub Pages production branch `gh-pages`
- `notebook.recruit.kro.kr`
- Firebase Rules
- Firebase indexes
- Firebase project
- Clerk Production instance
- Heroku database credentials

## Phase 9 pass criteria

Phase 9 is considered passed only when all are true:

```text
005 migration applied successfully
/health/live = phase9 / ok
/health = phase9 / ok / database ok
Shadow equivalent = yes
Read equivalent = yes
Cutover requested = yes
Active read source = postgresql-shadow
Cutover equivalent = yes
Cutover changed fields = -
Fallback reason = -
Core member screens work normally
Logout/login retest works normally
```
