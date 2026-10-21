-- W01: security audit originals, separate from resettable site settings.
-- No changes to existing migrations or existing business data.
CREATE TABLE IF NOT EXISTS app_device_trust_audit_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id TEXT NOT NULL DEFAULT '',
  actor_clerk_user_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  policy_revision BIGINT NOT NULL DEFAULT 0 CHECK (policy_revision >= 0),
  previous_enabled BOOLEAN,
  requested_enabled BOOLEAN,
  final_enabled BOOLEAN,
  result_status TEXT NOT NULL,
  account_count INTEGER NOT NULL DEFAULT 0 CHECK (account_count >= 0),
  failed_account_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_account_count >= 0),
  skipped_account_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_account_count >= 0),
  error_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_device_trust_audit_events_created_idx
  ON app_device_trust_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_device_trust_audit_events_operation_idx
  ON app_device_trust_audit_events (operation_id, created_at DESC);
