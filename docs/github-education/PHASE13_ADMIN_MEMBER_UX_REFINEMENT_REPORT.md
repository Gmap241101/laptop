# Phase 13 Admin Member Management UX Refinement Report

## Baseline

- `rental-system-github-education-phase13-admin-member-management-ux-20260808_deployment_package.zip`
- This refinement changes only the administrator member-management UI and its static smoke coverage.
- No backend API, PostgreSQL migration, Firestore Rules, indexes, Vercel configuration, or Clerk configuration changes are introduced.

## User-validated Phase 13 state

Before this refinement the user verified:

- Clerk staging diagnostics panel internal scrolling works.
- Member phone edit works.
- Administrator member profile edit works.
- PostgreSQL member-profile cutover remains equivalent.
- Member Firestore watcher remains disabled in the staging cutover path.
- Member profile write-through remains synced.
- Rental restriction PostgreSQL read cutover remains healthy.

## Refinement scope

### 1. Compact member status buttons

The member list status controls were reduced from the previous large button dimensions to a compact table-action size.

Desktop/mobile action buttons now use the compact contract:

```text
small icon
10px action text
compact horizontal/vertical padding
smaller gap and radius
```

No status-transition rules were changed.

### 2. Consolidated use-management column

The former split columns:

```text
이용 재개 / 차단
이용 종료
```

were consolidated into:

```text
이용 관리
```

All existing applicable status actions are rendered inside this single cell.

A separate adjacent column is now:

```text
회원정보
```

with an explicit:

```text
회원 수정
```

button.

### 3. Row click no longer opens edit mode

Clicking a member list row now toggles an inline detail body instead of opening the edit popup.

The inline detail body displays read-only member information:

- name
- team/department
- phone
- email
- created timestamp
- current account status
- Firebase UID

It also keeps the existing auxiliary actions:

- 약관 동의 내역
- 대여 이력 확인
- 회원수정

### 4. Explicit edit action

Editing no longer begins merely because the row/detail was opened.

The administrator must explicitly select `회원 수정` either:

- from the list's `회원정보` cell, or
- from the expanded detail body next to the rental-history action.

Only then is the edit modal opened.

### 5. Edit modal simplified

The existing edit popup now contains only the actual edit workflow:

- name
- department/team
- phone
- read-only email/UID/status/created timestamp
- cancel
- save

Terms and rental-history actions were removed from the edit popup because they now belong to the read-only detail body.

## Data and functional impact

No data contract was changed.

The existing admin edit transaction remains unchanged and still preserves:

- member identity claims
- recovery keys
- directory policy validation
- Firestore transaction invariants
- PostgreSQL member-profile write-through

No Firestore read/write call was added by this refinement.

## Production safety

The following core files remain unchanged from the Phase 13 baseline:

- `src/App.jsx`
- `src/firebase.js`
- `rules/firestore.rules`
- `firestore.indexes.json`
- `public/CNAME`
- `vercel.json`
- `src/main.jsx`
- root `package-lock.json`

No new npm dependency was added.
No PostgreSQL migration was added.
