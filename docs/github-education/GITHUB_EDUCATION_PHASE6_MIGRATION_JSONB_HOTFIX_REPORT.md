# Phase 6 migration JSONB hotfix

## Incident

Heroku Release Phase failed while applying `003_phase6_firebase_identity_bridge.sql` with PostgreSQL error `22P02 invalid input syntax for type json`.

## Root cause

`app_runtime_metadata.value` was created in Phase 2 as `JSONB NOT NULL`, but Phase 6 attempted to write the SQL text literal `'phase6'` directly into that JSONB column:

```sql
VALUES ('identity_bridge_phase', 'phase6', NOW())
```

That value is not valid JSON input. The migration runner executes the migration batch inside `BEGIN` and issues `ROLLBACK` on failure, so the failed Phase 6 migration is not recorded in `schema_migrations` and its table/index changes are not committed.

## Fix

The metadata write now uses a PostgreSQL JSONB constructor:

```sql
VALUES (
  'identity_bridge_phase',
  jsonb_build_object('phase', 6, 'bridge', 'firebase-auth'),
  NOW()
)
```

This preserves structured metadata and avoids JSON text parsing ambiguity.

## Regression prevention

A new `tools/backend/validate-migrations.mjs` static check fails if the old plain-text Phase 6 JSONB write returns. `npm run verify:phase6` now executes this check before the other Phase 6 tests.

## Scope

No React UI, Firebase client code, Firestore rules/indexes, Clerk identity logic, PostgreSQL link schema, CNAME, or production publishing behavior was changed. Only the failed, unapplied migration's metadata expression, its invariant check, validation script, package script, and hotfix documentation changed.
