# Phase 34 — Firebase normal-runtime retirement candidate

## Outcome

The Staging runtime now has one frontend/backend retirement switch:

```text
VITE_FIREBASE_RUNTIME_DISABLED=true
FIREBASE_RUNTIME_DISABLED=true
```

With both enabled, the normal architecture is `browser → Clerk session → Heroku API → PostgreSQL`. The frontend retains structurally valid Firebase SDK objects only so legacy modules can construct references safely, but disables Firestore networking and Firebase Auth persistence; the API client removes Firebase authorization headers; the backend does not configure a Firebase project or token verifier and forces all Firestore write mirrors off.

The global flag also activates the existing PostgreSQL authorities for users, account lifecycle, profiles, restrictions, rental requests, assets, boards, site content, policy content, and administrator content. Firestore bootstrap buttons return the existing PostgreSQL state instead of reading Firestore.

## Safety boundary

Phase 32 and Phase 33 PASS behavior remains the protected baseline. Production, DNS, GitHub Pages deployment configuration, Firebase Rules, and indexes are unchanged. The explicit Staging rollback is documented in `PHASE34_MANUAL_PLATFORM_ACTIONS.md`.

## Static hosting clarification

A page being served by GitHub Pages does not identify its database. GitHub Pages can serve the JavaScript application while that application reads current content from the Heroku PostgreSQL API. Authority is established by the actual network destination and backend response, not by the hostname that served the HTML.

## Remaining operational replacement

Two Firebase-specific browser tools are intentionally blocked in retirement mode so they cannot reconnect silently:

- Firebase administrator-account create/edit/delete/reset UI
- Firestore browser backup/restore/reset/integrity UI

Existing Clerk/PostgreSQL administrator authentication remains active. If these management capabilities are required, replace them with server-side Clerk/PostgreSQL endpoints before final feature-complete retirement approval.

## Database

No new SQL migration is required for this candidate. It uses the PostgreSQL schemas already established through Phase 33.
