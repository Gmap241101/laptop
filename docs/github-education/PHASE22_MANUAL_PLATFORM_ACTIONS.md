# Phase 22 manual platform actions

## Phase 22 Client Trust hotfix note

The first Phase 22 browser validation exposed an expected Clerk Client Trust state:

```text
needs_client_trust
```

This is not treated as a wrong-password failure. The Phase 22 hotfix keeps Clerk Client Trust enabled and extends the custom administrator sign-in UI to continue the same sign-in attempt with a verification code.

Preferred supported strategies:

```text
email_code
phone_code
```

If Clerk only exposes `email_link`, the administrator UI stops with an explicit unsupported-strategy diagnostic instead of silently bypassing Client Trust. For this staging flow, keep an email verification-code option enabled in the Clerk Development instance.

## Full Staging browser validation URLs

Always use the complete URLs below for Phase 22 validation instead of supplying query fragments only.

### User test URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres
```

### Administrator test URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk
```

### Explicit rollback URLs

User account-recovery rollback:

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=firestore
```

Administrator-auth rollback:

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=firebase
```

## Vercel / mkrental

Environment: **Production** (this Vercel project is the Staging/Test site).

Keep:

```text
VITE_ACCOUNT_RECOVERY_POSTGRES_READ_ENABLED=true
VITE_ADMIN_CLERK_AUTH_ENABLED=true
```

Keep all Phase 9-21 staging variables. No additional Vercel environment variable is introduced by the Client Trust hotfix.

Because frontend source changed, deploy/redeploy the hotfix package so Vercel builds the updated administrator custom sign-in flow.

No backend secret belongs in Vercel `VITE_*` variables.

## Heroku / rental-api Staging

No new secret, migration, or Config Var is introduced by the Client Trust hotfix.

The Phase 22 backend remains on:

```text
SERVICE_VERSION=phase22
```

and Migration 014 remains the current Phase 22 migration:

```text
014_phase22_account_recovery_admin_clerk_auth.sql
```

If the Phase 22 backend and Migration 014 have already been successfully deployed, a second Heroku deployment is not required solely for this frontend Client Trust hotfix. If Phase 22 backend deployment was not completed, deploy the full Phase 22 package using the existing staging procedure.

Keep the existing `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES`, `FIREBASE_PROJECT_ID` and Firestore REST timeout values unchanged.

## Clerk Development

Use the existing **Development** instance only. No Production Clerk instance change is part of Phase 22.

Do **not** disable Client Trust to work around this issue.

Confirm that email-address + password sign-in remains available and that Client Trust can use an email verification code. The hotfix also supports an SMS verification code if that is the factor returned by Clerk.

The expected new-device administrator flow is:

```text
administrator email/password
→ Firebase compatibility authentication
→ Clerk password authentication
→ needs_client_trust
→ Clerk sends email/SMS verification code
→ administrator enters code in the same administrator login screen
→ Clerk session becomes active
→ backend verifies Clerk + PostgreSQL administrator registry
→ administrator workspace opens
```

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

Deploy only the full Phase 22 hotfix package into the Staging source branch/worktree for `gh-pages-3` using `deploy1.ps1`.

Do not publish or modify `gh-pages`.

## DNS

Additional settings: **none**. Do not change Production DNS.

## Administrator browser validation after the hotfix

1. Open the full administrator test URL above in the same browser that produced `needs_client_trust`.
2. Enter the existing administrator email and password.
3. If Clerk requests Client Trust, the form must change to a verification-code input instead of showing `admin_clerk_signin_incomplete`.
4. Confirm that a verification code arrives at the masked destination shown in the UI.
5. Enter the code and submit.
6. Confirm that the administrator workspace opens.
7. Confirm diagnostics show the Clerk authority and Client Trust completion, for example:

```text
Admin Clerk authority requested: yes
Admin auth source: clerk
Admin Firebase compatibility: signed-in
Admin Clerk user: user_...
Admin Client Trust: verified
Admin Client Trust strategy: email_code
Admin auth error: -
```

`Admin Clerk migration` may be `existing` or `firebase-admin-to-clerk` depending on whether the administrator identity had already been linked before the Client Trust challenge.

A wrong or expired verification code must not silently grant administrator access.

### Administrator first-login migration security boundary

For an administrator without a Clerk link, use the normal administrator login form. The Phase 22 controller first authenticates the existing Firebase administrator and immediately performs the controlled Clerk migration. The backend requires the Firebase token's authentication time to be no more than five minutes old. Do not try to bootstrap a Clerk administrator from an old persisted Firebase token.
