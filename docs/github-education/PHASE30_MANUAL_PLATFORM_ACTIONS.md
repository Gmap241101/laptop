# Phase 30 manual platform actions

## Scope
Phase 30 moves **administrator member-status reads/writes and status-related rental-restriction writes** to PostgreSQL authority and retires their Firestore write mirrors.

This phase deliberately does **not** retire the member-profile edit mirror. Name/team/phone edits still update Firestore identity/directory/recovery compatibility documents until the next account-lifecycle cutover.

## Heroku staging
Keep all existing Phase 28/29 variables and set:

```text
SERVICE_VERSION=phase30
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
```

Keep:

```text
FIRESTORE_ASSET_BOARD_WRITE_MIRROR_DISABLED=true
FIRESTORE_RENTAL_REQUEST_WRITE_MIRROR_DISABLED=true
```

Deploy the Phase 30 backend. The existing release phase must apply:

```text
022_phase30_member_status_restriction_write_mirror_retirement.sql
```

Expected first deployment:

```text
[migration] applying: 022_phase30_member_status_restriction_write_mirror_retirement.sql
[migration] complete; newly applied=1
```

Expected `/health` compatibility values:

```text
memberStatusRestrictionWriteMirrorDisabled: true
memberStatusSource: postgresql
retiredWriteMirrorDomains includes member-status
retiredWriteMirrorDomains includes rental-restriction-status
```

## Vercel staging/test
Add and redeploy:

```text
VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=true
```

No new npm package is required.

## Administrator validation URL

```text
https://mkrental.vercel.app/admin?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&adminRequestRead=postgres&adminRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&assetWrite=postgres&adminIdentity=postgres&adminAuth=clerk&siteContent=postgres&siteContentWrite=postgres&policyContent=postgres&policyContentWrite=postgres&boardContent=postgres&boardWrite=postgres&legacyReadFallback=off
```

Open **회원 계정 관리**. Required Phase 30 diagnostics:

```text
Member status/restriction retirement requested: yes
Member status/restriction backend applied: yes
Member status source: postgresql
Admin member list source: postgresql
Phase 30 retired domains: member-status / rental-restriction-status
Phase 30 retirement error: -
```

Change a test member through reversible states where possible, for example `승인 대기 → 활성`, `활성 → 차단`, and `차단 → 활성`. After each change, leave the member-management screen and reopen it. The PostgreSQL state must persist and the list/count cards must refresh.

After a Phase 30 status mutation, diagnostics should show:

```text
Last member status mirror: retired
```

If activation restores an inherited restriction, also expect:

```text
Last restriction authority: postgresql
```

## User regression URL

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWrite=postgres&restrictionRead=postgres&restrictionWatcher=off&restrictionWrite=postgres&rentalRequestRead=postgres&rentalRequestWatcher=off&rentalRequestWrite=postgres&rentalRequestActionWrite=postgres&assetRead=postgres&accountRecovery=postgres&userAuth=clerk&userLifecycle=clerk&siteContent=postgres&policyContent=postgres&boardContent=postgres&legacyReadFallback=off
```

Verify login, home, rental application/history, My Page, notices and FAQ still work. Existing Phase 27/29 PostgreSQL-only read/write diagnostics must remain healthy.

## Preserved compatibility
Phase 30 intentionally preserves:
- member profile edit Firestore mirror and its identity/directory/recovery-key documents;
- full member-directory audit/profileRequired repair Firestore-first behavior with PostgreSQL write-through;
- Firebase administrator compatibility identity verification;
- a narrow rejoined-account inherited-restriction Firestore snapshot read only when no PostgreSQL restriction snapshot exists;
- site-shell parity fallback/write-through;
- policy/terms transaction reads;
- account-recovery compatibility and Firebase reset delivery.

## Rollback
Set on Heroku:

```text
FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=false
```

and on Vercel:

```text
VITE_FIRESTORE_MEMBER_STATUS_RESTRICTION_WRITE_MIRROR_DISABLED=false
```

Then redeploy both. Migration 022 is metadata-only and does not need to be rolled back.

## Protected production resources
Do not change Production Clerk, `gh-pages`, production DNS, or `https://notebook.recruit.kro.kr` during this phase.

## Phase 30 Staging hotfix actions
This hotfix supersedes the first Phase 30 candidate after browser validation found three migration-boundary defects.

- No new environment variable is required.
- No new migration is added; migration 022 remains the latest Phase 30 migration.
- Redeploy Heroku because `server/src/index.mjs`, member authority, and Firestore bootstrap reader changed.
- Redeploy Vercel because the rental read client and footer parity read changed.
- On the first administrator visit to **회원 계정 관리** after the hotfix, the backend performs a one-time administrator-authorized Firestore `userAccounts` full bootstrap into `app_member_accounts` if `phase30_member_accounts_full_bootstrap` is not already marked complete. Later list reads stay PostgreSQL-only.
- User rental history must report `postgresql-authoritative` and no blocked fallback.
- If PostgreSQL footer pages are incomplete, the user footer must temporarily report `site_content_footer_parity_mismatch` and display the full Firestore-server page set rather than a partial PostgreSQL set.
- Administrator member status mutations must report Firestore mirror `retired`, not `synced`, when the Phase 30 backend flag is enabled.
