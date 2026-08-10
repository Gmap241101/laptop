ALTER TABLE app_member_accounts
  ADD COLUMN IF NOT EXISTS auth_authority_mode TEXT NOT NULL DEFAULT 'firebase-compatibility',
  ADD COLUMN IF NOT EXISTS lifecycle_authority_mode TEXT NOT NULL DEFAULT 'firestore-compatibility',
  ADD COLUMN IF NOT EXISTS clerk_linked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clerk_last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_authority_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clerk_account_state TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS app_member_accounts_auth_authority_idx
  ON app_member_accounts (auth_authority_mode, status);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase23_user_clerk_auth_lifecycle',
  jsonb_build_object(
    'phase', 23,
    'user_authentication', 'clerk-authoritative-firebase-compatibility-session',
    'existing_user_migration', 'recent-firebase-proof-to-clerk',
    'signup_auth_identity', 'firebase-bootstrap-then-clerk-link',
    'password_change', 'clerk-authoritative-firebase-compatibility-mirror',
    'withdrawal', 'postgresql-member-state-clerk-account-retirement-firebase-cleanup',
    'password_reset_delivery', 'firebase-auth-compatibility-retained',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
