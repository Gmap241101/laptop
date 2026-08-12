CREATE TABLE IF NOT EXISTS app_system_configuration (
  config_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_clerk_user_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_system_configuration (config_key, payload, updated_by_clerk_user_id)
VALUES
  ('admin-security', '{}'::jsonb, 'phase34-bootstrap'),
  ('user-session-policy', '{}'::jsonb, 'phase34-bootstrap')
ON CONFLICT (config_key) DO NOTHING;

ALTER TABLE app_admin_identity_registry
  ADD COLUMN IF NOT EXISTS lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_hard_firebase_retirement',
  jsonb_build_object(
    'phase', 34,
    'firebase_runtime', 'removed',
    'admin_dashboard', 'postgresql-authoritative',
    'admin_accounts', 'clerk-postgresql-authoritative',
    'system_configuration', 'postgresql-authoritative',
    'browser_firestore_maintenance', 'retired',
    'activation', 'staging-hard-retirement'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
