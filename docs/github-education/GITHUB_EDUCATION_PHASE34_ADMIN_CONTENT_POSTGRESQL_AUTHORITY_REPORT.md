# GitHub Education Phase 34 - Administrator Public Content PostgreSQL Authority

## Outcome

Phase 34 removes Firestore from the active administrator edit path for public site content and policy content. When the new staging flag is enabled, administrator reads and full-domain replacements use PostgreSQL through the authenticated backend API.

Covered domains:

- site settings
- home configuration and all home banners
- popup posts
- footer configuration and footer pages
- rental/public configuration, including rental policy and holidays
- signup terms policy and signup terms

The backend route `PUT /api/admin/site-content/:domain` requires the Clerk administrator session and replaces one PostgreSQL domain transactionally. It does not require a Firebase ID token.

## Safety boundary

The transition is separately gated by:

```text
VITE_ADMIN_CONTENT_POSTGRES_AUTHORITY_ENABLED=true
```

Until that flag is enabled, the Phase 33 Firestore compatibility path remains available. With the flag enabled, the Phase 33 Firestore-to-PostgreSQL repair controller is suppressed so an older Firestore snapshot cannot overwrite newer PostgreSQL administrator edits.

The deliberate session rollback is:

```text
?adminContent=firestore
```

Production GitHub Pages, production DNS, and production Firebase configuration are outside Phase 34 scope and must not be changed during staging validation.

## Remaining Firebase retirement work

Phase 34 retires Firebase only for the administrator public-content/settings-policy surface listed above. Other administrator operational domains may still use Firebase compatibility and are handled by later retirement phases. Legacy fallback code is retained for controlled rollback; it is inactive while Phase 34 authority is requested.

## Database and deployment

No SQL migration is required. Phase 34 reuses `app_site_content_documents` and `app_site_content_syncs`.

Deploy both backend and frontend. Enable the new Vercel staging flag only after both deployments are live.
