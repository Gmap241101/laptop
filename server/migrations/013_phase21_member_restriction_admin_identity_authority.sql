ALTER TABLE app_user_member_shadows
  ADD COLUMN IF NOT EXISTS authority_mode TEXT NOT NULL DEFAULT 'firestore-shadow',
  ADD COLUMN IF NOT EXISTS mirror_state TEXT NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_mutation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS authoritative_updated_at TIMESTAMPTZ;

ALTER TABLE app_user_rental_restriction_shadows
  ADD COLUMN IF NOT EXISTS authority_mode TEXT NOT NULL DEFAULT 'firestore-shadow',
  ADD COLUMN IF NOT EXISTS mirror_state TEXT NOT NULL DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_mutation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS authoritative_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS app_user_member_shadows_active_identity_key_uidx
  ON app_user_member_shadows (identity_key)
  WHERE identity_key <> '' AND status <> 'retired';


CREATE TABLE IF NOT EXISTS app_member_accounts (
  firebase_uid TEXT PRIMARY KEY,
  app_user_id BIGINT REFERENCES app_user_identities(id) ON DELETE SET NULL,
  email TEXT NOT NULL DEFAULT '',
  masked_email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  team TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  directory_member_id TEXT NOT NULL DEFAULT '',
  directory_verified_version BIGINT NOT NULL DEFAULT 0,
  profile_required_reason TEXT NOT NULL DEFAULT '',
  rejoined_account BOOLEAN NOT NULL DEFAULT FALSE,
  terms_consent_revision BIGINT NOT NULL DEFAULT 0,
  terms_consent_policy_version BIGINT NOT NULL DEFAULT 0,
  identity_key TEXT NOT NULL DEFAULT '',
  recovery_key TEXT NOT NULL DEFAULT '',
  previous_account_uids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_hash TEXT NOT NULL DEFAULT '',
  authority_mode TEXT NOT NULL DEFAULT 'firestore-bootstrap',
  mirror_state TEXT NOT NULL DEFAULT 'synced',
  last_mutation_id TEXT NOT NULL DEFAULT '',
  source_updated_at TIMESTAMPTZ,
  authoritative_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_member_accounts_previous_uids_array CHECK (jsonb_typeof(previous_account_uids) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_member_accounts_active_identity_key_uidx
  ON app_member_accounts (identity_key)
  WHERE identity_key <> '' AND status <> 'retired';
CREATE INDEX IF NOT EXISTS app_member_accounts_status_idx ON app_member_accounts (status);
CREATE INDEX IF NOT EXISTS app_member_accounts_email_idx ON app_member_accounts (lower(email)) WHERE email <> '';

INSERT INTO app_member_accounts (
  firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
  directory_member_id, directory_verified_version, profile_required_reason,
  rejoined_account, terms_consent_revision, terms_consent_policy_version,
  identity_key, recovery_key, previous_account_uids, source_hash,
  authority_mode, mirror_state, source_updated_at, synced_at, created_at, updated_at
)
SELECT firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
       directory_member_id, directory_verified_version, profile_required_reason,
       rejoined_account, terms_consent_revision, terms_consent_policy_version,
       identity_key, recovery_key, previous_account_uids, source_hash,
       'firestore-bootstrap', 'synced', source_updated_at, synced_at, created_at, updated_at
  FROM app_user_member_shadows
ON CONFLICT (firebase_uid) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_member_profile_events (
  id UUID PRIMARY KEY,
  app_user_id BIGINT REFERENCES app_user_identities(id) ON DELETE SET NULL,
  firebase_uid TEXT NOT NULL,
  actor_firebase_uid TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  before_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  firestore_mirror_state TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS app_member_profile_events_firebase_uid_created_idx
  ON app_member_profile_events (firebase_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS app_admin_identity_registry (
  firebase_uid TEXT PRIMARY KEY,
  admin_login_id TEXT NOT NULL DEFAULT '',
  auth_email TEXT NOT NULL DEFAULT '',
  organization_name TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  admin_role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  clerk_user_id TEXT,
  clerk_link_state TEXT NOT NULL DEFAULT 'unlinked',
  source_hash TEXT NOT NULL DEFAULT '',
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_admin_identity_registry_login_id_uidx
  ON app_admin_identity_registry (lower(admin_login_id))
  WHERE admin_login_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS app_admin_identity_registry_auth_email_uidx
  ON app_admin_identity_registry (lower(auth_email))
  WHERE auth_email <> '';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase21_member_restriction_admin_identity_authority',
  jsonb_build_object(
    'phase', 21,
    'member_profile_write', 'postgresql-authoritative-firestore-mirror',
    'rental_restriction_write', 'postgresql-authoritative-firestore-mirror',
    'admin_identity', 'postgresql-registry-preparation',
    'admin_authentication', 'firebase-auth-compatibility-retained',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
