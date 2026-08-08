CREATE TABLE IF NOT EXISTS app_user_rental_request_shadows (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_user_id BIGINT NOT NULL REFERENCES app_user_identities(id) ON DELETE CASCADE,
  source_request_id TEXT NOT NULL UNIQUE,
  requester_uid TEXT NOT NULL,
  requester_email TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',
  requester_team TEXT NOT NULL DEFAULT '',
  team TEXT NOT NULL DEFAULT '',
  borrower TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  admin_memo TEXT NOT NULL DEFAULT '',
  extension_count BIGINT NOT NULL DEFAULT 0,
  last_extension_approved_date TEXT NOT NULL DEFAULT '',
  next_extension_request_date TEXT NOT NULL DEFAULT '',
  extension_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_action_request JSONB NULL,
  requested_at_text TEXT NOT NULL DEFAULT '',
  returned_at TIMESTAMPTZ NULL,
  overdue_penalty_pending BOOLEAN NOT NULL DEFAULT FALSE,
  overdue_penalty_batch_id TEXT NOT NULL DEFAULT '',
  source_synced_at TIMESTAMPTZ NULL,
  source_document_path TEXT NOT NULL,
  source_created_at TIMESTAMPTZ NULL,
  source_updated_at TIMESTAMPTZ NULL,
  source_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_rental_request_shadows_source_request_nonempty CHECK (length(trim(source_request_id)) > 0),
  CONSTRAINT app_user_rental_request_shadows_requester_uid_nonempty CHECK (length(trim(requester_uid)) > 0),
  CONSTRAINT app_user_rental_request_shadows_extension_history_array CHECK (jsonb_typeof(extension_history) = 'array'),
  CONSTRAINT app_user_rental_request_shadows_source_hash_nonempty CHECK (length(trim(source_hash)) > 0)
);

CREATE INDEX IF NOT EXISTS app_user_rental_request_shadows_app_user_idx
  ON app_user_rental_request_shadows (app_user_id);

CREATE INDEX IF NOT EXISTS app_user_rental_request_shadows_requester_uid_idx
  ON app_user_rental_request_shadows (requester_uid);

CREATE INDEX IF NOT EXISTS app_user_rental_request_shadows_requester_email_idx
  ON app_user_rental_request_shadows (lower(requester_email))
  WHERE requester_email <> '';

CREATE INDEX IF NOT EXISTS app_user_rental_request_shadows_status_idx
  ON app_user_rental_request_shadows (status);

CREATE INDEX IF NOT EXISTS app_user_rental_request_shadows_created_idx
  ON app_user_rental_request_shadows (app_user_id, source_created_at DESC, source_request_id DESC);

CREATE TABLE IF NOT EXISTS app_user_rental_request_item_shadows (
  rental_request_shadow_id BIGINT PRIMARY KEY REFERENCES app_user_rental_request_shadows(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 1,
  laptop_id TEXT NOT NULL DEFAULT '',
  asset_category TEXT NOT NULL DEFAULT '',
  asset_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_rental_request_item_shadows_line_number CHECK (line_number = 1)
);

CREATE INDEX IF NOT EXISTS app_user_rental_request_item_shadows_laptop_idx
  ON app_user_rental_request_item_shadows (laptop_id)
  WHERE laptop_id <> '';

CREATE INDEX IF NOT EXISTS app_user_rental_request_item_shadows_asset_no_idx
  ON app_user_rental_request_item_shadows (asset_no)
  WHERE asset_no <> '';

CREATE TABLE IF NOT EXISTS app_user_rental_request_shadow_syncs (
  app_user_id BIGINT PRIMARY KEY REFERENCES app_user_identities(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL,
  source_request_count BIGINT NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_rental_request_shadow_syncs_uid_nonempty CHECK (length(trim(firebase_uid)) > 0),
  CONSTRAINT app_user_rental_request_shadow_syncs_source_hash_nonempty CHECK (length(trim(source_hash)) > 0)
);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'rental_request_shadow_phase',
  jsonb_build_object(
    'phase', 14,
    'source', 'firestore-rentalRequests',
    'mode', 'normalized-shadow-parallel-read',
    'authoritative', 'firestore',
    'tables', jsonb_build_array(
      'app_user_rental_request_shadows',
      'app_user_rental_request_item_shadows',
      'app_user_rental_request_shadow_syncs'
    ),
    'events', 'deferred-until-admin-domain-cutover'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
