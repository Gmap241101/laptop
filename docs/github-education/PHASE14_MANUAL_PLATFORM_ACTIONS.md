# Phase 14 Manual Platform Actions

Phase 14 is a Staging-only PostgreSQL shadow/parity phase. Do not publish `gh-pages` and do not change the Production site.

## 1. Vercel — one new build-time variable

Project: `mkrental`

Environment: **Production** inside this dedicated Vercel project, because `mkrental.vercel.app` is the project's Production Deployment even though it is operationally Staging.

Menu path:

`Vercel Dashboard -> mkrental -> Settings -> Environment Variables`

Add:

```text
Key:   VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED
Value: true
Environment: Production
```

Keep the existing variables unchanged, including:

```text
VITE_CLERK_STAGING_ENABLED=true
VITE_API_URL=<Heroku Staging API URL>
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_MEMBER_PROFILE_POSTGRES_READ_ENABLED=true
VITE_MEMBER_PROFILE_FIRESTORE_WATCHER_DISABLED=true
VITE_MEMBER_PROFILE_WRITE_THROUGH_ENABLED=true
VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED=true
```

After adding/changing a `VITE_*` variable, create a new Vercel deployment so Vite receives the value at build time.

Do **not** put any of these backend secrets in Vercel:

- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
- Firebase service-account private keys

## 2. Heroku — no new secret/config required

Phase 14 reuses:

- `FIREBASE_PROJECT_ID=laptop-system-mk`
- `FIRESTORE_REST_TIMEOUT_MS` (optional existing/default behavior)
- the existing Clerk and PostgreSQL configuration.

Recommended version label update:

Menu path:

`Heroku Dashboard -> <Staging API app> -> Settings -> Config Vars`

Set:

```text
Key: SERVICE_VERSION
Value: phase14
```

No new Firebase Admin credential is required or desired.

The new migration `007_phase14_rental_request_foundation.sql` runs through the existing Heroku Release Phase:

```text
release: npm --prefix server run db:migrate
```

If that release migration fails, do not treat the new Heroku release as successfully deployed.

## 3. Clerk — additional setting 없음

Keep using the same Clerk Development instance:

- frontend `pk_test_...`
- Heroku `CLERK_SECRET_KEY=sk_test_...`
- Heroku `CLERK_JWT_KEY=<same Development instance public key>`

Do not mix `pk_live_` or `sk_live_` into Staging.

## 4. Firebase Console — additional setting 없음

No Firestore Rule change, index change, Firebase Authentication change, or service-account key is required.

The Phase 14 backend reads `rentalRequests` through Firestore REST using the signed-in user's verified Firebase ID token, so the existing Security Rules remain authoritative.

## 5. GitHub — additional setting 없음

Deploy only through the existing `gh-pages-3` Staging workflow.

Do not publish or merge to `gh-pages` as part of Phase 14.

Do not reinitialize Git, delete `.git`, force-push, or recreate the repository.

## 6. DNS — additional setting 없음

No DNS record needs to change. Production `https://notebook.recruit.kro.kr` remains untouched.

## Recommended execution order

1. Apply/deploy the Phase 14 full deployment package only to `gh-pages-3` using the existing `deploy.ps1 v13.1` flow.
2. Confirm the Heroku release phase applies migration 007 successfully.
3. In Heroku Config Vars, update `SERVICE_VERSION=phase14` if the deployment process does not already set it.
4. In Vercel `mkrental`, add `VITE_RENTAL_REQUEST_POSTGRES_PARITY_ENABLED=true` to Production Environment Variables.
5. Redeploy the Vercel Production Deployment for the `mkrental` staging project.
6. Open the Phase 14 diagnostic URL and perform the browser parity procedure in the Phase 14 report/final deployment report.
7. Only after browser parity passes should this package be promoted as the next working baseline.
