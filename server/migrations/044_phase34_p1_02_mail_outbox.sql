-- P1-02 durable mail outbox. Same existing PostgreSQL database. No delivery scheduler/worker.
-- No historical migrations are modified.
CREATE TABLE IF NOT EXISTS app_mail_outbox (
  id BIGSERIAL PRIMARY KEY,
  dedupe_key CHAR(64) NOT NULL UNIQUE,
  event_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','processing','sent','retry','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  CHECK (length(recipient_email) <= 254),
  CHECK (length(event_key) <= 80),
  CHECK (length(subject) <= 200),
  CHECK (length(body_text) <= 20000),
  CHECK (length(body_html) <= 32000)
);
CREATE INDEX IF NOT EXISTS app_mail_outbox_ready_idx
  ON app_mail_outbox (available_at, id)
  WHERE state IN ('queued','retry');
CREATE INDEX IF NOT EXISTS app_mail_outbox_state_created_idx
  ON app_mail_outbox (state, created_at DESC);
-- Reserved for P1-03 atomic quota reservation; P1-02 does not send or charge quota.
CREATE TABLE IF NOT EXISTS app_mail_delivery_quota (
  quota_day DATE PRIMARY KEY,
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
