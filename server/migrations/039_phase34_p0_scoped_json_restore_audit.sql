-- Audit only; no backup payloads, personal data or credentials are stored here.
CREATE TABLE IF NOT EXISTS app_system_data_restore_audit (
  restore_id TEXT PRIMARY KEY,
  actor_clerk_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('preview','apply','failed')),
  mode TEXT NOT NULL,
  scopes JSONB NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  preview_sha256 CHAR(64) NOT NULL,
  affected_rows INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_system_data_restore_audit_created_at_idx
  ON app_system_data_restore_audit (created_at DESC);
