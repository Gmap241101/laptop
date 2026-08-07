# GitHub Education Phase 2 - Backend Foundation

Phase 2 adds a staging-only Node.js/PostgreSQL backend foundation without changing the existing React/Firebase business path.

## Added foundation
- Root `Procfile` with release migration and web process.
- `server/` Node 22.x backend.
- PostgreSQL connection pool using `DATABASE_URL`.
- Transactional/checksummed SQL migration runner.
- `/health/live`, `/health`, `/health/ready` endpoints.
- Exact-origin CORS allow-list.
- Heroku-specific dependency preparation hooks.

## Business impact
No existing React UI, Firebase Auth, Firestore access, Firestore rules, production CNAME, or Vercel routing is changed.
