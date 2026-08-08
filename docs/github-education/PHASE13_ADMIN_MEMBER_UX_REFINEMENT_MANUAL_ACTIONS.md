# Phase 13 Admin Member UX Refinement — Manual Platform Actions

## Vercel

No new environment variables are required.

After publishing the new full package to `gh-pages-3`, verify:

```text
Vercel Dashboard
→ mkrental
→ Deployments
→ latest gh-pages-3 deployment
→ Ready
```

## Heroku

No backend source, migration, or Config Var change is required by this refinement.

If Heroku automatically redeploys because `gh-pages-3` changed, migration output must remain:

```text
001~006 already applied
newly applied=0
```

Keep `SERVICE_VERSION=phase12` because this refinement is frontend/admin UX only.

## Clerk

No changes.

## Firebase Console

No Rules or index changes.

## GitHub

Publish only `gh-pages-3`.
Do not publish `gh-pages`.

## Browser verification

1. Open administrator `회원 계정 관리`.
2. Confirm action buttons are visibly smaller.
3. Confirm the table uses one `이용 관리` column and adjacent `회원정보` column.
4. Click a normal row area: inline read-only detail must expand; edit modal must not open.
5. In the detail body, verify `약관 동의 내역`, `대여 이력 확인`, `회원수정`.
6. Click `회원 수정`: edit popup must open.
7. Close/save the edit popup and verify the expanded detail remains usable.
8. Verify existing status actions (resume/block/end) still behave as before.
