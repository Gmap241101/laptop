CREATE TABLE app_user_identities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  primary_email TEXT,
  primary_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  image_url TEXT,
  clerk_created_at TIMESTAMPTZ,
  clerk_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_identities_clerk_user_id_not_blank CHECK (BTRIM(clerk_user_id) <> '')
);

CREATE INDEX app_user_identities_primary_email_lower_idx
  ON app_user_identities (LOWER(primary_email))
  WHERE primary_email IS NOT NULL;

INSERT INTO app_runtime_metadata (key, value)
VALUES (
  'clerk_user_identity',
  '{"phase":5,"source":"clerk-backend-api","table":"app_user_identities","authorization":"not-yet-migrated"}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();
