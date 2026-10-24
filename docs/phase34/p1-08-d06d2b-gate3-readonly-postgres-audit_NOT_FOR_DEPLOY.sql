-- Phase34 P1-08 D06-D2B-G3: OPTIONAL READ-ONLY PostgreSQL catalog inspection.
-- No DDL, DML, transaction, new DB/schema/worker/resource, no mail delivery.
-- Requires separate approval to access Staging PostgreSQL; may be used on a local copy.
-- Expected as of accepted Staging v299: reviewed G2 draft tables NOT installed.
-- REVIEW DB permissions carefully; actual PG concurrency/trigger tests NOT performed here.
SELECT current_database() AS database_name, current_user AS sql_user,
       to_regclass('public.app_mail_sandbox_review_reservations') AS reservation_table,
       to_regclass('public.app_mail_sandbox_review_audit') AS audit_table;
SELECT table_schema, table_name, table_type FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN
 ('app_mail_sandbox_review_reservations','app_mail_sandbox_review_audit')
 ORDER BY table_name;
SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name IN
 ('app_mail_sandbox_review_reservations','app_mail_sandbox_review_audit')
 ORDER BY table_name,grantee,privilege_type;
SELECT t.tgname AS trigger_name,c.relname AS table_name,t.tgenabled,
       pg_get_triggerdef(t.oid) AS trigger_definition
 FROM pg_trigger AS t JOIN pg_class AS c ON c.oid=t.tgrelid
 JOIN pg_namespace AS n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
 AND c.relname IN ('app_mail_sandbox_review_reservations','app_mail_sandbox_review_audit')
 ORDER BY c.relname,t.tgname;
SELECT c.relname AS table_name,con.conname,con.contype,
       pg_get_constraintdef(con.oid) AS constraint_definition
 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 AND c.relname IN ('app_mail_sandbox_review_reservations','app_mail_sandbox_review_audit')
 ORDER BY c.relname,con.conname;
