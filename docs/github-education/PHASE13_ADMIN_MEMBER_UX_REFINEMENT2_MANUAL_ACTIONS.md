# Phase 13 Admin Member UX Refinement 2 — Manual Actions

## External platform configuration

No new configuration is required.

- Vercel: no new environment variable.
- Heroku: no new Config Var and no new migration. Keep `SERVICE_VERSION=phase12`.
- Clerk: no change.
- Firebase Console: no Rules/Indexes change.
- DNS: no change.

## Deployment

1. Deploy the new full package with `deploy.ps1 v13.1` to **gh-pages-3 only**.
2. Do not publish `gh-pages`.
3. In Vercel, confirm the newest `gh-pages-3` Production deployment is `Ready`.
4. Heroku does not require a manual deployment for this frontend-only correction. If Git integration redeploys Heroku automatically, migrations 001-006 must all be `already applied` and `newly applied=0`.

## Browser verification

Open:

`관리자 → 회원 계정 관리`

Verify:

1. The `회원 검색` input stretches across the available toolbar width and there is no unused gray cell to its right.
2. `상태` and `페이지당 표시` remain aligned to the right of the search input.
3. The bottom area matches the Admin Rental Request list style:
   - `검색 결과 N건 · 1 / N페이지`
   - `이전` / `다음`
   - no bordered `서버 커서 페이지 · 10명씩 보기` card.
4. Clicking a member row removes/replaces the list body and opens a dedicated member detail body. The detail must not appear as a row inserted below the selected member.
5. `목록으로` returns to the previous list/filter/page state.
6. The detail body provides `약관 동의 내역`, `대여 이력 확인`, and `회원수정`.
7. `회원수정` opens the existing edit modal; saving a safe field such as phone number still works.
