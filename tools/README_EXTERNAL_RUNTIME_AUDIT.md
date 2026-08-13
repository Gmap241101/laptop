# External runtime access audit

The active Phase 34 runtime is Clerk + PostgreSQL.

Use:

```bash
npm run audit:external-runtime
npm run audit:external-runtime:strict
```

The audit scans `src` and `server/src` for imports, network endpoints, authorization headers, or hosted-resource domains belonging to a retired external data/authentication provider. Any match fails the audit.

Reports are written under `.performance-reports/external-runtime-access-audit.*`.

Historical migration documents and historical PostgreSQL column names are not runtime provider dependencies and are not used as deployment authority.
