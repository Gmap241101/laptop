# Phase 34 manual platform actions

## Deployment order

1. Keep the Phase 32 and Phase 33 PASS variables unchanged.
2. Deploy the full package to Heroku Staging.
3. Deploy the same full package to Vercel Staging with the new flag initially `false`.
4. Confirm the backend root contains:

```text
adminContentAuthorityRevision: phase34-admin-content-postgresql-authority-20260812-1200
```

5. Set the Vercel Staging variable below and redeploy:

```text
VITE_ADMIN_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

No PostgreSQL migration, Firebase Rules change, Firebase index change, Clerk configuration change, production deployment, GitHub Pages deployment, or DNS change is required.

## Staging validation

Sign in to the normal administrator URL and verify:

1. Diagnostics shows `Administrator content PostgreSQL authority requested: yes`.
2. Save site settings.
3. Create/edit/delete or reorder one home banner.
4. Create/edit one popup.
5. Edit footer common content and one footer page.
6. Save rental policy and holidays.
7. Create/edit/enable/archive/reorder a signup term and save the signup-terms policy.
8. Reload the administrator page and confirm every saved value remains.
9. Open the Staging user URL in a fresh tab and confirm the same public content/policy values.
10. Confirm there is no Firestore synchronization toast and no `site_content_clerk_session_missing` error.

The browser Network panel should show administrator mutations as:

```text
PUT /api/admin/site-content/<domain>
Authorization: Bearer <Clerk session>
```

There should be no Firebase authorization header on this Phase 34 endpoint.

## Rollback

For a short browser-session test only, use `?adminContent=firestore`. For an environment rollback, set:

```text
VITE_ADMIN_CONTENT_POSTGRES_AUTHORITY_ENABLED=false
```

and redeploy Vercel Staging. Do not run the old Firestore repair after PostgreSQL-only edits unless Firestore has first been deliberately reconciled, because it can replace the newer PostgreSQL domain.

## PASS rule

Phase 34 remains a deployment candidate until all administrator and user checks above pass on the normal Staging URLs. Phase 32 and Phase 33 PASS remain the protected baseline throughout.
