CREATE TABLE IF NOT EXISTS app_member_directory_entries (
  identity_key TEXT PRIMARY KEY,
  directory_member_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  team TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_member_directory_entries_enabled_order_idx
  ON app_member_directory_entries (enabled, sort_order, identity_key);

CREATE INDEX IF NOT EXISTS app_member_directory_entries_name_team_idx
  ON app_member_directory_entries (lower(name), lower(team));

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase31_member_profile_identity_recovery_authority',
  jsonb_build_object(
    'phase', 31,
    'member_profile_source', 'postgresql-authoritative',
    'member_identity_source', 'postgresql-active-identity-key-unique-index',
    'member_directory_source', 'postgresql-bootstrap-with-firestore-admin-sync-compatibility',
    'account_recovery_key_source', 'postgresql-member-account',
    'member_profile_firestore_write_mirror', 'retired-staging-opt-in',
    'preserved', jsonb_build_array('firebase-admin-identity','firebase-user-compatibility-session','signup-bootstrap','password-reset-delivery','terms-consent'),
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
