# GitHub Education Phase 8 - Member Profile Parallel Read Report

## Baseline

Baseline package:
`rental-system-github-education-phase7-member-profile-shadow-20260807_deployment_package.zip`

Baseline SHA-256:
`4d8bd6b55741b96c1c48f391c0fa10feb2e8d2bab9c155a4d8974a9d25c78c6b`

Phase 7 was accepted from the user's live staging evidence: migration 004 applied successfully, health endpoints reported phase7/ok, the linked Firebase identity matched, and the member Shadow comparison reported equivalent with no changed fields.

## Objective

Phase 8 prepares a future PostgreSQL member-profile read path without changing the current application behavior.

The current application continues to use the existing Firestore `userAccounts/{uid}` `onSnapshot()` result. Phase 8 observes that exact application read and compares it with a PostgreSQL-only read candidate returned from Heroku.

## New server read contract

`GET /api/users/me/member-profile-candidate`

Authentication: Clerk Session JWT.

Source: existing `app_user_member_shadows` PostgreSQL row.

Response explicitly marks:
- `source: postgresql-shadow`
- `authoritative: false`

The candidate profile contains only the member fields already selected for the Phase 7 Shadow. The endpoint does not call Firestore and does not require a Firebase ID token.

## Actual application read observation

New module:
`src/features/members/memberProfileReadObservation.js`

The existing `useAuthIdentityPolicySubscriptionController` publishes a sanitized browser-local observation from the same `profileData` object received by the real Firestore `onSnapshot()` callback.

The observation is enabled only when the existing Clerk staging flag is true and `?clerkTest=1` is present. It does not modify `userProfile`, does not persist data, and does not make a network request.

## Parity comparison

The Phase 8 diagnostics panel receives the actual application Firestore observation and retrieves the PostgreSQL candidate. It compares:
- uid
- email
- maskedEmail
- name
- team
- phone
- status
- directoryMemberId
- directoryVerifiedVersion
- profileRequiredReason
- rejoinedAccount
- termsConsentRevision
- termsConsentPolicyVersion

The expected result after a Phase 7 synchronized Shadow is `equivalent=true` and an empty changed-field list.

## Safety

- Firestore remains authoritative.
- Existing Firebase `onSnapshot()` remains active and unchanged as the UI data source.
- No automatic Shadow synchronization is performed.
- No extra Firestore read is introduced by the Phase 8 parity check.
- PostgreSQL is read-only for the new candidate endpoint.
- No new migration.
- No new npm dependency.
- No new secret or external platform setting.
- Production `gh-pages`, CNAME, Firestore Rules, Firebase config, and App.jsx are not modified.

## Next gate

Only after repeated Phase 8 live checks show the actual app Firestore read and PostgreSQL candidate are equivalent should a later phase introduce an explicit staging-only PostgreSQL read mode with Firestore fallback.
