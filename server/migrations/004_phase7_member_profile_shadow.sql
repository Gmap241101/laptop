CREATE TABLE IF NOT EXISTS app_user_member_shadows (
  app_user_id BIGINT PRIMARY KEY REFERENCES app_user_identities(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL UNIQUE,
  source_collection TEXT NOT NULL DEFAULT 'userAccounts',
  source_document_path TEXT NOT NULL,
  uid TEXT NOT NULL,
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
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  source_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_member_shadows_uid_nonempty CHECK (length(trim(firebase_uid)) > 0),
  CONSTRAINT app_user_member_shadows_uid_matches_source CHECK (firebase_uid = uid),
  CONSTRAINT app_user_member_shadows_source_hash_nonempty CHECK (length(trim(source_hash)) > 0)
);

CREATE INDEX IF NOT EXISTS app_user_member_shadows_email_idx
  ON app_user_member_shadows (lower(email))
  WHERE email <> '';

CREATE INDEX IF NOT EXISTS app_user_member_shadows_status_idx
  ON app_user_member_shadows (status);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'member_profile_shadow_phase',
  jsonb_build_object(
    'phase', 7,
    'source', 'firestore-userAccounts',
    'mode', 'read-only-shadow',
    'authoritative', 'firestore',
    'payload_storage', 'selected-fields-plus-hash'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
