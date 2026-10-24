-- P1-08 Staging acceptance: READ ONLY. No INSERT/UPDATE/DELETE/DDL.
-- Designed against migrations 044-049. Run only on existing Staging.
-- This script intentionally excludes recipient_email, subject/body, claim_token,
-- provider_message_id, session digests and tokens.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5000ms';
SELECT current_database() AS database_name, current_setting('transaction_read_only') AS read_only_mode,
 current_setting('server_version') AS postgres_version;
SELECT to_regclass('public.app_mail_outbox') IS NOT NULL AS outbox_present,
 to_regclass('public.app_mail_preflight_reviews') IS NOT NULL AS preflight_review_present,
 to_regclass('public.app_mail_delivery_attempts') IS NOT NULL AS attempt_ledger_present;
SELECT state, COUNT(*) AS rows_in_state FROM public.app_mail_outbox GROUP BY state ORDER BY state;
SELECT id, event_key, state, attempt_count, max_attempts, available_at,
 lease_expires_at, created_at, updated_at, last_error_code
 FROM public.app_mail_outbox WHERE id=5;
SELECT id, review_result, created_at, blocker_codes
 FROM public.app_mail_preflight_reviews ORDER BY id DESC LIMIT 5;
SELECT mail_outbox_id, provider_name, outcome, reserved_at, completed_at, safe_error_code
 FROM public.app_mail_delivery_attempts WHERE mail_outbox_id=5 ORDER BY id DESC LIMIT 10;
COMMIT;
