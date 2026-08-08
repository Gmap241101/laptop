CREATE TABLE IF NOT EXISTS app_user_rental_restriction_shadows (
  firebase_uid TEXT PRIMARY KEY,
  app_user_id BIGINT NULL UNIQUE REFERENCES app_user_identities(id) ON DELETE SET NULL,
  restriction_exists BOOLEAN NOT NULL DEFAULT FALSE,
  restriction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_document_path TEXT NOT NULL DEFAULT '',
  source_updated_at TIMESTAMPTZ NULL,
  source_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_user_rental_restriction_shadows_app_user_idx
  ON app_user_rental_restriction_shadows(app_user_id);
