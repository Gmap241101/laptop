-- Phase 34 P0: durable website-initiated full backup/isolated restore verification.
-- The verified archive is never stored in PostgreSQL; only non-sensitive metadata is retained.
CREATE TABLE IF NOT EXISTS app_backup_verification_jobs (
  id UUID PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('staging','production')),
  actor_clerk_user_id TEXT NOT NULL,
  actor_session_id TEXT NOT NULL,
  reverification_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','verified','failed','cancelled','interrupted')),
  phase TEXT NOT NULL DEFAULT 'queued',
  error_code TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  archive_key TEXT,
  archive_sha256 CHAR(64),
  encrypted_sha256 CHAR(64),
  table_count INTEGER,
  expires_at TIMESTAMPTZ,
  CONSTRAINT app_backup_jobs_reverify_unique UNIQUE (environment,actor_session_id,reverification_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS app_backup_jobs_single_active_environment_idx
  ON app_backup_verification_jobs (environment) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS app_backup_jobs_history_idx
  ON app_backup_verification_jobs (environment,created_at DESC);
