ALTER TABLE app_admin_identity_registry
  ADD COLUMN IF NOT EXISTS auth_authority_mode TEXT NOT NULL DEFAULT 'firebase-compatibility',
  ADD COLUMN IF NOT EXISTS clerk_linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clerk_last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS app_admin_identity_registry_clerk_user_uidx
  ON app_admin_identity_registry (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL AND clerk_user_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS app_member_accounts_active_recovery_key_uidx
  ON app_member_accounts (recovery_key)
  WHERE recovery_key <> '' AND status <> 'retired';

CREATE INDEX IF NOT EXISTS app_member_accounts_recovery_lookup_idx
  ON app_member_accounts (recovery_key, status)
  WHERE recovery_key <> '';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase22_account_recovery_admin_clerk_auth',
  jsonb_build_object(
    'phase', 22,
    'account_recovery_read', 'postgresql-preferred-staging-opt-in',
    'password_reset_delivery', 'firebase-auth-compatibility-retained',
    'admin_authentication', 'clerk-authoritative-firebase-compatibility-session',
    'admin_provisioning', 'existing-admin-only-clerk-plus-firebase-compatibility',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
