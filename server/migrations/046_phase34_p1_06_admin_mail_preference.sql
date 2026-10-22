-- Phase 34 P1-06: per-administrator mail opt-in, same existing PG database.
-- Legacy administrators retain previous recipient behavior (TRUE).
ALTER TABLE app_admin_identity_registry
  ADD COLUMN IF NOT EXISTS mail_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS app_admin_identity_mail_recipient_idx
  ON app_admin_identity_registry (lower(auth_email))
  WHERE status='active' AND mail_notifications_enabled=TRUE;
-- Persist scheduled mail context for cancellation when rental changes.
ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS source_request_id TEXT;
ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS source_due_date DATE;
ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS scheduled_for_date DATE;
CREATE INDEX IF NOT EXISTS app_mail_outbox_scheduled_source_idx
  ON app_mail_outbox (source_request_id) WHERE source_request_id IS NOT NULL;
-- Owner-only operational actions, never delete historical Outbox entries.
CREATE TABLE IF NOT EXISTS app_mail_queue_actions (
  id BIGSERIAL PRIMARY KEY,
  mail_outbox_id BIGINT NOT NULL REFERENCES app_mail_outbox(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('cancel')),
  actor_clerk_user_id TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_mail_queue_actions_mail_idx
 ON app_mail_queue_actions(mail_outbox_id,created_at DESC);
-- Immutable actor-attributed preference-change log (owner only).
CREATE TABLE IF NOT EXISTS app_admin_mail_preference_audit (
  id BIGSERIAL PRIMARY KEY,
  target_admin_key TEXT NOT NULL,
  changed_by_clerk_user_id TEXT NOT NULL,
  previous_enabled BOOLEAN NOT NULL,
  new_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_admin_mail_preference_audit_target_idx
 ON app_admin_mail_preference_audit (target_admin_key,created_at DESC);
