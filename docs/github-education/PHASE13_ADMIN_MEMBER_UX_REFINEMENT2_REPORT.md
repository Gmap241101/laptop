# Phase 13 Admin Member Management UX Refinement 2 Report

## Baseline

`rental-system-github-education-phase13-admin-member-management-ux-refinement-20260808_deployment_package.zip`

Baseline SHA-256:

`af48e78a488892aca884b2c0775ec371c062b7401aaa88cd32cf5a63c9a52b0a`

## User-verified baseline status

The previous Phase 13 refinement was deployed successfully. The user confirmed:

- diagnostics panel internal scrolling works;
- member phone-number editing works;
- administrator member profile editing works;
- existing Phase 10-12 PostgreSQL/read-reduction behavior remains healthy.

## Requested correction

1. Make the member search input consume the unused gray toolbar width, following the Admin Rental Request list layout.
2. Make the member-list pagination summary/footer use the same visual pattern as Admin Rental Request management instead of the custom `server cursor page` box.
3. Do not render member detail as a table expansion row below the selected member. Clicking a member must switch the management body from list mode to a dedicated member-detail body, with an explicit `목록으로` action.

## Implemented changes

### Search toolbar

The toolbar now uses:

`md:grid-cols-[minmax(0,1fr)_160px_140px]`

The search field consumes all remaining horizontal space; the status selector and page-size selector remain fixed-width controls.

### Pagination footer

Removed the bordered `서버 커서 페이지 · N명씩 보기` section.

The footer now follows the Admin Request layout:

`검색 결과 N건 · current / total페이지`

with `이전` and `다음` buttons aligned on the right without a separate enclosing pagination card.

### Dedicated detail body

Removed the desktop `<tr><td colSpan={7}>...</td></tr>` expansion row and the mobile inline detail expansion.

List mode and detail mode are now mutually exclusive:

- list mode: search/filter/page-size controls + member list + pagination;
- detail mode: `목록으로` toolbar + member detail body.

Clicking a row selects the member and replaces the list body with the dedicated detail view. `목록으로` restores the existing list/filter/page state.

### Member detail actions

The dedicated detail body keeps:

- 약관 동의 내역
- 대여 이력 확인
- 회원수정

`회원수정` continues to open the existing edit modal. Existing identity/recovery/directory transaction invariants and PostgreSQL write-through behavior are unchanged.

## Data/backend impact

- No PostgreSQL migration.
- No backend API changes.
- No Firestore Rules or index changes.
- No new npm dependency.
- No environment-variable changes.
- Heroku `SERVICE_VERSION` remains `phase12`.

## Production safety

`src/App.jsx`, Firebase configuration, Firestore Rules/Indexes, CNAME, Vercel config, `src/main.jsx`, and root `package-lock.json` remain unchanged.

Production `gh-pages` remains frozen; deploy only to `gh-pages-3`.
