# GitHub Education Phase 9 — Member Profile Opt-in Read Cutover Report

## Baseline

Phase 8 full deployment package:

`rental-system-github-education-phase8-member-profile-parallel-read-20260807_deployment_package.zip`

Phase 8 field validation supplied by the operator passed: Firestore live profile and PostgreSQL candidate were equivalent with no changed fields, Heroku was healthy at `phase8`, and migrations 001–004 were already applied.

## Goal

Move the **logical active source** of the current member `userProfile` from Firestore to PostgreSQL in the dedicated `gh-pages-3` staging environment, without removing the Firestore subscription yet.

The cutover is intentionally opt-in and fail-safe:

- Vercel environment flag required.
- Explicit `?memberRead=postgres` query required.
- Firebase ID Token authenticates the transitional backend read endpoint.
- PostgreSQL becomes active only when its candidate is equivalent to the live Firestore snapshot.
- Any error or mismatch falls back to the existing Firestore profile.
- Production `gh-pages` is untouched.

## Runtime contract gap discovered before cutover

The existing application uses three `userProfile` fields not included in the Phase 8 PostgreSQL shadow:

- `identityKey`
- `recoveryKey`
- `previousAccountUids`

They are required by existing withdrawal/account-history behavior. Cutting over without them could create functional regressions.

Phase 9 therefore adds migration `005_phase9_member_profile_runtime_contract.sql` and extends the shadow/read candidate with exactly these runtime fields before enabling the opt-in cutover.

## Backend changes

New Firebase-authenticated endpoint:

`GET /api/legacy/member-profile-cutover-candidate`

Authentication header:

`X-Firebase-Authorization: Bearer <Firebase ID Token>`

The server verifies the token, finds the existing one-to-one Firebase link, and returns the linked PostgreSQL member shadow. It does not read Firestore.

This transitional endpoint avoids requiring a Clerk session inside the production React member-state controller while the main application still uses Firebase Authentication.

## Frontend changes

New `memberProfileReadCutover.js` implements:

- staging environment gate
- explicit query opt-in
- Firebase-authenticated candidate request
- field-equivalence decision
- PostgreSQL preferred source selection
- Firestore fallback
- diagnostic observation event

`useAuthIdentityPolicySubscriptionController.js` still maintains the original Firestore `onSnapshot(userAccounts/{uid})` subscription. The live snapshot becomes the safety guard. The `userProfile` React state is set from PostgreSQL only while equivalence is true.

## Activation

Required Vercel staging variable:

`VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true`

Actual activation also requires:

`?memberRead=postgres`

Recommended test URL:

`https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres`

## Firestore quota impact

Phase 9 does **not** reduce Firestore reads yet because the existing `onSnapshot` remains active as the realtime guard/fallback.

This is intentional. The goal is to validate application correctness with PostgreSQL as the active state source before removing the legacy watcher in a later phase.

## Database impact

Migration 005 is additive only. It does not delete or rename existing columns/tables.

New shadow columns:

- `identity_key TEXT NOT NULL DEFAULT ''`
- `recovery_key TEXT NOT NULL DEFAULT ''`
- `previous_account_uids JSONB NOT NULL DEFAULT []`

Existing rows must be resynchronized once after migration 005 to populate these values from Firestore.

## Production impact

None. `src/App.jsx`, Firebase configuration, Firestore Rules/indexes, `public/CNAME`, `vercel.json`, and root `package-lock.json` remain unchanged from Phase 8.

## Change inventory versus Phase 8

- existing source/config files modified: 18
- new source/config/documentation files: 7
- deleted files: 0
- cumulative `REMOVED_FILES.txt`: unchanged from Phase 8
- total source/config manifest target before package metadata: 577 files

`src/App.jsx` remains byte-for-byte identical to Phase 8:

- 2,130 lines
- 66,036 bytes
- SHA-256 `b30af55defc814cac9b33e056f4c89263444eca04b565c89ef0517d96b4b1117`

Other production-sensitive files confirmed unchanged: `src/firebase.js`, `rules/firestore.rules`, `firestore.indexes.json`, `public/CNAME`, `vercel.json`, `src/main.jsx`, root `package-lock.json`.
