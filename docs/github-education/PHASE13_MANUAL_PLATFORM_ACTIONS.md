# Phase 13 Manual Platform Actions

## Scope
Phase 13 is a frontend/admin-management change only. No PostgreSQL migration, Heroku API route, Clerk setting, Firebase Rules, Firebase index, or Vercel environment variable is added.

## Required deployment
1. Use `rental-system-github-education-phase13-admin-member-management-ux-20260808_deployment_package.zip` with deploy.ps1 v13.1.
2. Publish only `gh-pages-3`. Do not publish `gh-pages`.
3. In Vercel > mkrental > Deployments, confirm the latest `gh-pages-3` deployment becomes `Ready`.
4. No new Vercel Environment Variable is required. Keep all Phase 12 variables unchanged.

## Heroku
Phase 13 contains no backend change. No manual Heroku deploy and no `SERVICE_VERSION` change is required. The health endpoint may continue to report `phase12`.
If Heroku Automatic Deploy is enabled for `gh-pages-3`, it may rebuild the unchanged backend; in that case migrations 001-006 must all report `already applied` and `newly applied=0`.

## Clerk / Firebase
No Clerk Dashboard change is required.
No Firebase Console, Firestore Rules, or index change is required.

## Browser validation
### Diagnostics panel
Open the existing Clerk diagnostic URL. The panel should remain within the browser viewport and show its own vertical scrollbar when its contents are taller than the screen. Browser zoom-out should no longer be necessary.

### Admin member list
Go to 관리자 > 회원 계정 관리.
- Verify desktop columns: 번호, 활성여부, 이름, 부서, 가입일시, 이용 재개/차단, 이용 종료.
- Verify there is no horizontal scrollbar at normal desktop width.
- Verify page-size choices 10 / 30 / 50.
- Verify search box is narrower and status/page-size controls sit next to it.
- Verify existing 가입 승인/이용 재개, 이용 차단, 이용 종료 actions still work.

### Member information edit
Click a member row or member name.
- Email and UID are read-only.
- Edit name, department/team, or phone and save.
- If registered-member directory policy is enabled, the name/team combination must exist in that directory; otherwise save is rejected.
- The edit transaction maintains member identity claim and account recovery indexes.
- On the staging environment, when the Phase 11 write-through environment is enabled, the saved Firestore member profile is also synchronized to PostgreSQL.
- Retired accounts are intentionally edit-locked until the account is resumed.

For a reversible test, changing only the phone number and then restoring it is recommended.
