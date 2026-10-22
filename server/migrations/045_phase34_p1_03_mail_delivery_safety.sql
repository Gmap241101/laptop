-- P1-03: attempt ledger inside the EXISTING PostgreSQL database.
-- Every provider attempt consumes a conservative quota slot, including uncertain outcomes.
-- No new DB, worker, addon, or sending permission.
ALTER TABLE app_mail_outbox DROP CONSTRAINT IF EXISTS app_mail_outbox_state_check;
ALTER TABLE app_mail_outbox ADD CONSTRAINT app_mail_outbox_state_check
  CHECK (state IN ('queued','processing','sent','retry','failed','cancelled','uncertain'));
ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE app_mail_outbox ADD CONSTRAINT app_mail_outbox_claim_token_length
  CHECK (claim_token IS NULL OR length(claim_token) <= 100);
CREATE TABLE IF NOT EXISTS app_mail_delivery_attempts (
  id BIGSERIAL PRIMARY KEY,
  mail_outbox_id BIGINT NOT NULL REFERENCES app_mail_outbox(id) ON DELETE RESTRICT,
  claim_token TEXT NOT NULL UNIQUE,
  provider_name TEXT NOT NULL CHECK (provider_name IN ('brevo','resend')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT NOT NULL DEFAULT 'reserved'
    CHECK (outcome IN ('reserved','accepted','retry','rejected','uncertain')),
  completed_at TIMESTAMPTZ,
  provider_message_id TEXT,
  safe_error_code TEXT
);
CREATE INDEX IF NOT EXISTS app_mail_delivery_attempts_recent_idx
  ON app_mail_delivery_attempts (reserved_at DESC);
CREATE INDEX IF NOT EXISTS app_mail_delivery_attempts_outbox_idx
  ON app_mail_delivery_attempts (mail_outbox_id, reserved_at DESC);
CREATE INDEX IF NOT EXISTS app_mail_outbox_processing_lease_idx
  ON app_mail_outbox (lease_expires_at)
  WHERE state = 'processing';
