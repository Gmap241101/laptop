-- Phase 34 P1-06 continuation: audit only definitively refused, safe manual retries.
-- Same existing DB; no new dyno/addon/worker, sending remains disabled.
ALTER TABLE app_mail_queue_actions DROP CONSTRAINT IF EXISTS app_mail_queue_actions_action_check;
ALTER TABLE app_mail_queue_actions ADD CONSTRAINT app_mail_queue_actions_action_check
  CHECK (action IN ('cancel','retry'));
