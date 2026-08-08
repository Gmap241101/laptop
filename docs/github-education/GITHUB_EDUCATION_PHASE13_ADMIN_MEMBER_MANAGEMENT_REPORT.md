# GitHub Education Phase 13 - Admin Member Management UX

## Baseline
`rental-system-github-education-phase12-rental-restriction-read-reduction-20260808_deployment_package.zip`

## Goals
1. Make the Clerk staging diagnostics usable without browser zoom-out by adding a viewport-bounded internal scrollbar.
2. Convert 관리자 > 회원 계정 관리 from large per-member cards to a compact board/table layout on desktop.
3. Add 10/30/50 page-size selection while retaining server cursor pagination and progressive search.
4. Keep existing resume/block/retire status actions.
5. Add safe administrator editing of member name, department/team, and phone.

## Member list UX
Desktop uses a fixed-layout table with no minimum width and columns:
- 번호
- 활성여부
- 이름
- 부서
- 가입일시
- 이용 재개 / 차단
- 이용 종료

The member name/row opens the detail/edit dialog. Mobile and narrow screens retain a card layout.

## Admin member edit safety
Email and Firebase UID are not editable. Those are authentication identifiers.
Name/team/phone edits use a Firestore transaction that updates:
- `userAccounts/{uid}`
- `memberIdentityClaims/{identityKey}`
- `accountRecoveryKeys/{recoveryKey}`
- directory verification fields when registered-member policy is enabled

Identity conflicts and directory mismatches are rejected rather than overwritten.
Retired users are edit-locked until resumed.

The existing Phase 11 PostgreSQL member-profile write-through is invoked after the Firestore transaction succeeds. Admin profile/status writes force write-through whenever the staging write-through environment is enabled, without requiring the diagnostic query string to remain present.

## Diagnostics panel
The fixed staging panel now has:
- `maxHeight: calc(100vh - 32px)`
- `overflowY: auto`
- contained overscroll and stable scrollbar gutter

## Backend and database impact
No server API code change.
No new PostgreSQL migration.
No Firestore Rules/index change.
No npm dependency change.
