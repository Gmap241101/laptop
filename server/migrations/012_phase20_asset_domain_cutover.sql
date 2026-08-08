CREATE TABLE IF NOT EXISTS app_asset_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_mode TEXT NOT NULL DEFAULT 'firestore-imported-legacy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_asset_categories_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT app_asset_categories_normalized_nonempty CHECK (length(trim(normalized_name)) > 0)
);

CREATE INDEX IF NOT EXISTS app_asset_categories_sort_idx
  ON app_asset_categories (sort_order, id);

CREATE TABLE IF NOT EXISTS app_rental_assets (
  asset_id TEXT PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES app_asset_categories(id) ON DELETE RESTRICT,
  asset_no TEXT NOT NULL,
  asset_no_normalized TEXT NOT NULL UNIQUE,
  serial_no TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  manufacture_date TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  base_status TEXT NOT NULL DEFAULT '대여가능',
  source_mode TEXT NOT NULL DEFAULT 'firestore-imported-legacy',
  source_created_at TIMESTAMPTZ NULL,
  source_updated_at TIMESTAMPTZ NULL,
  source_synced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rental_assets_asset_id_nonempty CHECK (length(trim(asset_id)) > 0),
  CONSTRAINT app_rental_assets_asset_no_nonempty CHECK (length(trim(asset_no)) > 0),
  CONSTRAINT app_rental_assets_asset_no_normalized_nonempty CHECK (length(trim(asset_no_normalized)) > 0),
  CONSTRAINT app_rental_assets_base_status CHECK (base_status IN ('대여가능', '대여불가'))
);

CREATE INDEX IF NOT EXISTS app_rental_assets_category_idx
  ON app_rental_assets (category_id, asset_no_normalized, asset_id);
CREATE INDEX IF NOT EXISTS app_rental_assets_base_status_idx
  ON app_rental_assets (base_status, asset_id);

CREATE TABLE IF NOT EXISTS app_asset_catalog_syncs (
  scope TEXT PRIMARY KEY,
  source_asset_count INTEGER NOT NULL DEFAULT 0,
  source_category_count INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL DEFAULT '',
  source_mode TEXT NOT NULL DEFAULT 'firestore-admin-bootstrap',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'asset_domain_phase',
  jsonb_build_object(
    'phase', 20,
    'readAuthority', 'postgresql',
    'writeAuthority', 'postgresql',
    'availabilitySource', 'app_rental_asset_reservation_guards',
    'userCatalogWatcher', 'disabled-when-opted-in',
    'adminAssetWatcher', 'disabled-when-opted-in',
    'adminCrud', 'postgresql-authoritative',
    'bulkUpload', 'postgresql-authoritative',
    'categoryWriteAuthority', 'postgresql',
    'firestoreCompatibilityMirror', true,
    'firestoreFallback', 'one-time-read-only'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
