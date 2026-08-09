# Phase 22 manual platform actions

## Vercel / mkrental

Environment: **Production** (this Vercel project is the Staging/Test site).

Add:

```text
VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED=true
VITE_ADMIN_CLERK_AUTH_ENABLED=true
```

Keep all Phase 9-21 staging variables. Save and redeploy because Vite reads `VITE_*` values at build time.

For initial browser validation, explicitly activate the Phase 22 session gates:

```text
user:  accountRecovery=postgres
admin: adminAuth=clerk
```

Rollback gates are:

```text
accountRecovery=firestore
adminAuth=firebase
```

No backend secret belongs in Vercel `VITE_*` variables.

## Heroku / rental-api Staging

No new secret is required. Deploy the Phase 22 server source. The existing Procfile Release Phase must apply:

```text
014_phase22_account_recovery_admin_clerk_auth.sql
```

Set the diagnostic marker:

```text
SERVICE_VERSION=phase22
```

Keep the existing `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`, `FIREBASE_PROJECT_ID` and Firestore REST timeout values unchanged.

After deployment, `/health` should report the expected service/environment/version and `database.status=ok`.

## Clerk Development

Use the existing **Development** instance only. No Production Clerk instance change is part of Phase 22.

Confirm that email-address + password sign-in remains available for the custom administrator sign-in flow. The backend uses the existing `CLERK_SECRET_KEY`; no additional Clerk secret is introduced.

Administrator provisioning remains private application behavior:

```text
existing administrator
→ Administrator ID Management
→ authenticated backend provision endpoint
→ Clerk administrator identity + PostgreSQL registry link
```

There is no public administrator Clerk self-signup path.

Newly provisioned administrator passwords must be at least 8 characters. An existing Firebase administrator may be migrated using the already verified current password through Clerk's migration password-check bypass; that bypass is not used for new administrator provisioning.

## Firebase Console

Additional settings: **none**.

Do not remove Firebase Authentication or change Firestore Rules/indexes in Phase 22. Firebase administrator authentication is demoted to compatibility-session/proof use, but downstream Firestore administrator Rules still require the Firebase identity during this staged cutover. Normal-user password reset delivery also remains Firebase Auth compatibility behavior.

Do not add a Firebase Admin service-account/private key.

## GitHub

Deploy only the full Phase 22 package into the Staging source branch/worktree for `gh-pages-3` using `deploy1.ps1`.

Do not publish or modify `gh-pages`.

## DNS

Additional settings: **none**. Do not change Production DNS.

### Administrator first-login note

For an administrator without a Clerk link, use the normal administrator login form. The Phase 22 controller first authenticates the existing Firebase administrator and immediately performs the controlled Clerk migration. The backend requires the Firebase token's authentication time to be no more than five minutes old. Do not try to bootstrap a Clerk administrator from an old persisted Firebase token.
