# GitHub Education Phase 33 - User Clerk-only Authentication + Public Content PostgreSQL Authority

## Confirmed baseline

Phase 32 was confirmed in actual Staging/browser testing on 2026-08-11.

```text
rental-system-github-education-phase32-new-member-runtime-authority-hotfix-20260811_2141_deployment_package.zip
SHA-256: c249a1b7f6587e94af0b5d0ab45c0c69004ed80b36675312eb3e00c9306f333e
```

Phase 32 browser confirmation included new native member signup/approval/login/profile/rental/withdrawal paths and user/admin diagnostics with `phase32-new-member-runtime-authority-20260811-2108`.

## Phase 33 purpose

Phase 33 retires Firebase Authentication as a normal **user** runtime dependency and finishes the public site-shell/policy read authority transition to PostgreSQL. Administrator Firebase compatibility is deliberately preserved because administrator settings/policy management still has transitional Firestore CRUD/onSnapshot paths that are scheduled for Phase 34 cleanup.

## User authentication authority

When both backend and frontend Phase 33 retirement flags are enabled:

```text
User sign-in authority     = Clerk + PostgreSQL member status
User signup authority      = PostgreSQL account lifecycle + Clerk native identity
User password verification = Clerk
User password change       = Clerk
User password reset        = Clerk reset_password_email_code
User withdrawal authority  = PostgreSQL + Clerk cleanup
User Firebase Auth session = retired
```

A Phase 33 native user no longer requires a Firebase Authentication account. Existing converted users continue to resolve their PostgreSQL member account through the already-linked Clerk identity.

## PostgreSQL legacy member compatibility key

The current PostgreSQL schema still contains columns historically named `firebase_uid`. Destructive schema renaming is intentionally deferred. Native Phase 33 users therefore receive an internal compatibility key shaped as:

```text
clerk-native:<sha256(normalized-email)>
```

This value is not a Firebase identity. It is a PostgreSQL compatibility key that lets existing foreign-key/read-model contracts continue to work until Phase 34 schema cleanup. Diagnostics describe this as:

```text
Legacy member key source: postgresql-compatibility-key
```

## Password reset

Phase 32 deliberately retained Firebase reset-email delivery. Phase 33 changes the normal user flow to Clerk email-code reset:

1. PostgreSQL account-recovery identity verification succeeds.
2. Backend ensures the member has a usable Clerk identity.
3. Frontend starts Clerk `reset_password_email_code` preparation.
4. User enters the emailed code and a new password.
5. Clerk completes the password reset.

Firebase `sendPasswordResetEmail` remains only in explicit rollback compatibility mode.

## User routes no longer requiring Firebase ID tokens

Under Phase 33 retirement mode, active PostgreSQL/Clerk user routes authenticate with Clerk and PostgreSQL member authority rather than requiring a Firebase ID token. This includes:

- profile update;
- member-directory verification;
- rental restriction read;
- rental create/edit/cancel/extend;
- password change;
- withdrawal.

Firebase token validation remains available only where a legacy/rollback mirror path genuinely requires it.

## Public site-shell PostgreSQL authority

New frontend authority flag:

```text
VITE_SITE_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

Once enabled, public user reads for site settings/home/popup/footer use PostgreSQL as authority. A PostgreSQL read failure fails closed or uses the existing safe local default where applicable; the normal public path does **not** silently return to Firestore parity fallback.

Administrator site-content management/write-through remains transitional in Phase 33 so the administrator can perform the final content synchronization before enabling public authority.

## Public policy/terms content PostgreSQL authority

New frontend authority flag:

```text
VITE_POLICY_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

Once enabled, public rental policy and terms-definition reads use PostgreSQL authority and do not silently fall back to Firestore. Administrator policy management/onSnapshot/write-through remains preserved until Phase 34.

## Required content synchronization before authority enablement

The confirmed Phase 32 user diagnostics showed a real popup parity mismatch (`PostgreSQL enabled count=0`, Firestore server enabled count=5). Therefore the authority flags must **not** be enabled blindly.

Before enabling the Phase 33 public content authority flags:

1. Deploy Phase 33 code with retirement/content authority flags still disabled.
2. Use the administrator transitional content management/synchronization controls.
3. Synchronize site settings, home content, popup posts and footer pages to PostgreSQL.
4. Synchronize rental policy and terms definitions to PostgreSQL.
5. Verify PostgreSQL counts/content are complete.
6. Only then enable the Phase 33 public content authority flags and redeploy the frontend.

## Backend flag

New Staging backend flag:

```text
FIREBASE_USER_AUTH_COMPATIBILITY_DISABLED=true
```

When false, the rollback-compatible Phase 32 user Firebase flow remains available. When true, normal user authentication/session/password/withdrawal routes operate without Firebase Auth.

## Administrator compatibility deliberately preserved

Phase 33 does **not** remove administrator Firebase compatibility. Administrator policy/settings CRUD still has transitional Firestore reads/writes, and the existing administrator Clerk authority remains layered with its compatibility Firebase session.

Expected diagnostics:

```text
Admin Firebase Auth compatibility: preserved
```

Administrator Firebase removal is a Phase 34 task after direct Firestore management is retired.

## No database migration

Phase 33 adds no SQL migration. Existing Phase 32/31 tables and identity links are reused. Schema naming cleanup and removal of legacy Firebase-named columns are deferred to Phase 34.

## Production protection

Phase 33 applies only to:

```text
gh-pages-3
https://mkrental.vercel.app
Heroku Staging
Clerk Development
```

Do not change `gh-pages`, Production Clerk, production DNS, or `https://notebook.recruit.kro.kr` without explicit user approval after final Staging validation.
