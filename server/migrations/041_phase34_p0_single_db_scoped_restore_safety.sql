-- Phase34 P0: same-database scoped JSON change journal; NOT a whole-database backup.
CREATE TABLE IF NOT EXISTS app_system_data_restore_preimages (
  restore_id UUID PRIMARY KEY,
  actor_clerk_user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('addMissing','overwrite')),
  scopes JSONB NOT NULL,
  snapshot_sha256 CHAR(64) NOT NULL,
  preimage JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restore_preimages_array_check CHECK (jsonb_typeof(preimage)='array')
);
CREATE INDEX IF NOT EXISTS app_system_data_restore_preimages_created_idx
  ON app_system_data_restore_preimages (created_at DESC);
