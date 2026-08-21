# Production API Custom Domain Setup — api.notebook.recruit.kro.kr

## 1. Purpose

The Production frontend remains:

```text
https://notebook.recruit.kro.kr
```

The Production backend canonical origin becomes:

```text
https://api.notebook.recruit.kro.kr
```

All browser-to-backend traffic uses the same `VITE_API_URL`, including authentication/session checks, member APIs, rental APIs, board/FAQ APIs, inquiries, administrator APIs, site/policy settings, assets, and secure attachment downloads.

This package does **not** hard-code the Production API origin into application source. It enforces the origin at Production build/deploy time. Staging can therefore continue to use its current Heroku staging origin.

## 2. DNS architecture

```text
notebook.recruit.kro.kr
  -> GitHub Pages frontend

api.notebook.recruit.kro.kr
  -> CNAME
  -> Heroku-assigned *.herokudns.com DNS target
  -> Production Heroku API
```

Changing the authoritative nameserver is not required. A CNAME record for the `api.notebook.recruit.kro.kr` subdomain is sufficient.

Do not change `public/CNAME`; it must remain `notebook.recruit.kro.kr` because that file belongs to the GitHub Pages frontend.

## 3. Add the custom domain to the Production Heroku app

Use the actual Production app name:

```powershell
heroku domains:add api.notebook.recruit.kro.kr -a <PRODUCTION_HEROKU_APP>
heroku domains -a <PRODUCTION_HEROKU_APP>
```

Copy the DNS Target returned by Heroku. It must be the Heroku-assigned `*.herokudns.com` value.

Example only:

```text
api.notebook.recruit.kro.kr  CNAME  example-123456.herokudns.com
```

Do not invent the target and do not use the staging app's `*.herokuapp.com` URL as the CNAME target.

## 4. Create the DNS CNAME record

At the DNS provider that currently manages `recruit.kro.kr`, create one CNAME record.

Typical form when the DNS zone is `recruit.kro.kr`:

```text
Type:   CNAME
Host:   api.notebook
Target: <the exact Heroku DNS Target from `heroku domains`>
```

Some DNS control panels require the complete hostname instead of `api.notebook`. Follow that provider's input convention; the resulting FQDN must be exactly `api.notebook.recruit.kro.kr`.

## 5. Enable and verify HTTPS on Heroku

For a Common Runtime app, use Heroku Automated Certificate Management (ACM):

```powershell
heroku certs:auto:enable -a <PRODUCTION_HEROKU_APP>
heroku certs:auto -a <PRODUCTION_HEROKU_APP>
```

After DNS propagates and ACM is ready, verify:

```powershell
curl.exe -I https://api.notebook.recruit.kro.kr/health/live
curl.exe -I https://api.notebook.recruit.kro.kr/health
```

`/health/live` confirms the web process is reachable. `/health` also exercises readiness, including the database readiness path used by the API.

## 6. Configure Production Heroku origin policy

The API hostname is **not** the browser Origin allow-list. The browser Origin is the frontend domain.

Set:

```powershell
heroku config:set APP_ENV=production `
  CORS_ALLOWED_ORIGINS="https://notebook.recruit.kro.kr" `
  CLERK_AUTHORIZED_PARTIES="https://notebook.recruit.kro.kr" `
  -a <PRODUCTION_HEROKU_APP>
```

Retain the Production database, Clerk backend keys, service settings, and all other canonical Phase 34 variables required by the Production Heroku app.

Then run the new package validation command inside Heroku:

```powershell
heroku run "npm --prefix server run config:production-domain:check" -a <PRODUCTION_HEROKU_APP>
```

Expected result:

```text
[production-domain] backend origin contract PASS
APP_ENV=production
CORS_ALLOWED_ORIGINS=https://notebook.recruit.kro.kr
CLERK_AUTHORIZED_PARTIES=https://notebook.recruit.kro.kr
```

The check intentionally rejects a Production backend that still allows the Vercel staging origin.

## 7. Configure the Production frontend build

Before a Production build/publish, expose this environment value to the build process:

```powershell
$env:VITE_API_URL="https://api.notebook.recruit.kro.kr"
```

Do not store the value in a committed `.env` file. The deployment package guard intentionally excludes `.env*` files.

The new Production build contract runs automatically through:

```powershell
npm run build:production
```

and rejects:

- missing `VITE_API_URL`
- `http://` API origins
- direct `*.herokuapp.com` Production origins
- API origins with a path, query, or fragment
- any origin other than `https://api.notebook.recruit.kro.kr`

## 8. Production publish guard

The existing Production publish remains opt-in. Only after Staging validation, Production backend/domain validation, and a separate Production Clerk cutover approval:

```powershell
$env:VITE_API_URL="https://api.notebook.recruit.kro.kr"
$env:CONFIRM_PRODUCTION_DEPLOY="notebook.recruit.kro.kr"
npm run deploy:production
```

The deployment flow now performs:

```text
1. existing Phase 34 prebuild audits
2. Production API origin preflight
3. Vite Production build
4. dist/CNAME verification
5. compiled bundle contains api.notebook.recruit.kro.kr
6. compiled bundle does not contain a direct *.herokuapp.com origin
7. publish to gh-pages only after all checks pass
```

## 9. Runtime result

After a valid Production cutover, examples become:

```text
https://api.notebook.recruit.kro.kr/api/boards/...
https://api.notebook.recruit.kro.kr/api/inquiries/...
https://api.notebook.recruit.kro.kr/api/assets/...
https://api.notebook.recruit.kro.kr/api/attachments/att-.../download
```

The secure attachment proxy remains unchanged. The visible attachment endpoint is the branded API domain, while the actual externally registered file URL remains server-side and is not returned to the browser.

## 10. Staging remains isolated

Do not set `api.notebook.recruit.kro.kr` on the existing Vercel Staging project simply to test the Production hostname. Staging should continue to use its current Staging API origin until the Production cutover.

This prevents Staging traffic from accidentally mutating Production PostgreSQL data.

## 11. Production Clerk blocker that is intentionally not changed here

Phase 34 still contains legacy frontend naming/guards from the staged Clerk migration, including `VITE_CLERK_STAGING_ENABLED` and a `pk_test_` publishable-key assumption in the current Clerk frontend configuration path.

Therefore:

```text
API custom-domain readiness != full Production Clerk readiness
```

Before publishing `gh-pages` as the new Clerk/PostgreSQL Production application, perform a separate Production Clerk cutover that supports the Production Clerk publishable key and removes/renames the legacy staging-only gate without reintroducing Firebase runtime compatibility.

This package deliberately does not broaden that scope.

## 12. Rollback

If the API custom domain fails before Production frontend publication:

1. leave `gh-pages` unchanged;
2. restore/remove the `api.notebook.recruit.kro.kr` DNS CNAME as required;
3. keep the Production Heroku app accessible by its Heroku system hostname for administrator diagnosis only;
4. do not point the Production frontend at the staging backend.

If the frontend has already been published and an API-domain incident occurs, restore the immediately preceding verified Production build and its corresponding backend/DNS configuration as one coordinated rollback. Do not switch the Production frontend to the Staging database/API as an emergency shortcut.
