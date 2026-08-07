CREATE TABLE IF NOT EXISTS app_user_firebase_links (
  app_user_id BIGINT PRIMARY KEY REFERENCES app_user_identities(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL UNIQUE,
  firebase_email TEXT NOT NULL DEFAULT '',
  firebase_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  firebase_sign_in_provider TEXT NOT NULL DEFAULT '',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_firebase_links_uid_nonempty CHECK (length(trim(firebase_uid)) > 0)
);

CREATE INDEX IF NOT EXISTS app_user_firebase_links_email_idx
  ON app_user_firebase_links (lower(firebase_email))
  WHERE firebase_email <> '';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES ('identity_bridge_phase', 'phase6', NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
