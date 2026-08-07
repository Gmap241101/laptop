# Rental API - Phase 2 backend foundation (hotfix)

This folder is the new Node.js + PostgreSQL backend foundation and is isolated from the existing React/Firebase production path.
Phase 2 exposes only health/readiness endpoints and the migration foundation; business APIs are not enabled yet.

## Runtime
- Node.js 22.x
- `pg` 8.22.0
- Heroku Postgres `DATABASE_URL`

## Endpoints
- `GET /` - service identity
- `GET /health/live` - process liveness without a DB query
- `GET /health` - readiness with a PostgreSQL query
- `GET /health/ready` - same readiness check

## Configuration
See `docs/github-education/PHASE2_ENVIRONMENT_VARIABLE_TEMPLATE.txt` at the repository root.
Do not place real `.env` or `.env.*` files in a deployment package or commit them to Git.

## Heroku
The root `Procfile` declares:
1. Release phase: `npm --prefix server run db:migrate`
2. Web process: `npm --prefix server start`

The root Heroku build hooks prepare `server` dependencies before the release phase.
Provision the Heroku Postgres add-on first so `DATABASE_URL` exists before migration runs.
