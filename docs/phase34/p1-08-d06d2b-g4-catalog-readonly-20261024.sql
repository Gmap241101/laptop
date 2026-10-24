-- Phase34 P1-08 G4-PREP -- CATALOG ONLY. NOT A MIGRATION.
-- Run only after independent Staging read-only access authorization.
-- Does NOT inspect or alter personal records or Outbox content.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SET LOCAL lock_timeout = '1500ms';
SELECT current_database() AS database_name,
       current_user AS inspection_role,
       current_setting('transaction_read_only') AS transaction_read_only,
       current_setting('server_version') AS server_version;
SELECT t.nspname AS schema_name, c.relname AS relation_name,
       c.relkind AS relation_kind, c.relowner::regrole::text AS owner_role
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace t ON t.oid = c.relnamespace
WHERE t.nspname = 'public'
  AND c.relname IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY c.relname;
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY table_name, ordinal_position;
SELECT c.relname AS table_name, co.conname AS constraint_name, co.contype AS constraint_type,
       pg_catalog.pg_get_constraintdef(co.oid) AS definition
FROM pg_catalog.pg_constraint co
JOIN pg_catalog.pg_class c ON c.oid = co.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY c.relname, co.conname;
SELECT c.relname AS table_name, ix.relname AS index_name,
       i.indisunique AS is_unique, i.indisvalid AS is_valid,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS index_definition
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY c.relname, ix.relname;
SELECT c.relname AS table_name, tr.tgname AS trigger_name, tr.tgenabled AS enabled,
       pg_catalog.pg_get_triggerdef(tr.oid) AS trigger_definition
FROM pg_catalog.pg_trigger tr
JOIN pg_catalog.pg_class c ON c.oid = tr.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT tr.tgisinternal
  AND c.relname IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY c.relname, tr.tgname;
SELECT c.relname AS table_name,
       pg_catalog.has_table_privilege(current_user, c.oid, 'SELECT') AS can_select,
       pg_catalog.has_table_privilege(current_user, c.oid, 'INSERT') AS can_insert,
       pg_catalog.has_table_privilege(current_user, c.oid, 'UPDATE') AS can_update,
       pg_catalog.has_table_privilege(current_user, c.oid, 'DELETE') AS can_delete
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('app_mail_sandbox_review_reservations', 'app_mail_sandbox_review_audit')
ORDER BY c.relname;
COMMIT;
