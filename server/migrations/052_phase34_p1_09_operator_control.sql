-- Production mail control - no separate database or worker.
-- Default off: a deploy/config change cannot enable delivery without a fresh owner OTP.
CREATE TABLE IF NOT EXISTS app_mail_runtime_approval_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_clerk_user_id TEXT NOT NULL,
  verification_digest TEXT UNIQUE,
  enabled_before BOOLEAN NOT NULL,
  enabled_after BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_mail_runtime_approval_actor_length CHECK (length(actor_clerk_user_id) BETWEEN 8 AND 128),
  CONSTRAINT app_mail_runtime_approval_otp_required CHECK (enabled_after=FALSE OR verification_digest IS NOT NULL)
);
-- Existing 'mail-notification-settings' JSONB retains user-configured event templates.
-- Missing payload.delivery.enabled is interpreted as FALSE (fail closed).
