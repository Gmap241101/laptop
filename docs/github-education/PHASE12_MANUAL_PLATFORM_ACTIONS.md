# Phase 12 Manual Platform Actions

Phase 12 moves the signed-in user's `rentalRestrictions/{uid}` read path to a PostgreSQL shadow in the dedicated staging site and disables that one Firestore realtime listener when explicitly opted in.

## 1. Vercel — add one environment variable

Project: `mkrental`

Settings -> Environment Variables -> Production:

```text
VITE_RENTAL_RESTRICTION_POSTGRES_READ_ENABLED=true
```

Keep all existing Phase 4-11 variables unchanged.

## 2. Publish only `gh-pages-3`

Use the Phase 12 full deployment package with `deploy.ps1 v13.1`. Do not publish `gh-pages`.

## 3. Vercel deployment

After the `gh-pages-3` push, verify the newest Vercel deployment is `Ready`, `Production`, branch `gh-pages-3`. Because a new VITE_ variable is involved, a new build is required.

## 4. Heroku

No new Config Var is required. If GitHub automatic deployment is disabled, manually deploy `gh-pages-3` to the existing staging API app.

Release Phase should apply migration `006_phase12_rental_restriction_shadow.sql` exactly once:

```text
001 already applied
002 already applied
003 already applied
004 already applied
005 already applied
006 applying
newly applied=1
```

After a successful code release, change:

```text
SERVICE_VERSION=phase12
```

The next release should show `006 already applied` and `newly applied=0`.

## 5. Health

Check `/health/live` and `/health`. Both must report `version=phase12`, `status=ok`; `/health` must also report `database.status=ok`.

## 6. Browser test

Open a new tab with:

```text
https://mkrental.vercel.app/?clerkTest=1&memberRead=postgres&memberWatcher=off&memberWriteThrough=on&restrictionRead=postgres&restrictionWatcher=off
```

Expected Phase 12 section:

```text
Restriction cutover requested: yes
Restriction watcher: disabled
```

On the first run only, if no PostgreSQL restriction shadow exists yet, one Firestore fallback/seed read is allowed:

```text
Restriction active source: firestore-one-time-fallback
Restriction one-time Firestore fallback reads: 1
```

Within about 15 seconds, or after reopening the same test URL, expected steady state is:

```text
Restriction active source: postgresql-shadow
Restriction watcher: disabled
Restriction one-time Firestore fallback reads: 0
Restriction fallback reason: -
```

A user with no restriction document is valid; PostgreSQL stores the explicit absent state rather than repeatedly reading Firestore.

## 7. Admin return test (optional but useful)

If a disposable test rental exists, process an overdue return through the existing admin UI. The Phase 12 write-through hook will re-read the affected `rentalRestrictions/{uid}` document with the authenticated admin Firebase token and refresh PostgreSQL. The user's watcher-off browser should see the PostgreSQL change within about 15 seconds.

The current administrator UI has no general-member profile edit path, so no such test is required.
