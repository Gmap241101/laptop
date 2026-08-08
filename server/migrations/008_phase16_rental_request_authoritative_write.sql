CREATE TABLE IF NOT EXISTS app_rental_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  app_user_id BIGINT NOT NULL REFERENCES app_user_identities(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL,
  requester_email TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',
  requester_team TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '신청중',
  requested_at_text TEXT NOT NULL DEFAULT '',
  source_mode TEXT NOT NULL DEFAULT 'postgresql-authoritative',
  idempotency_key TEXT NOT NULL,
  firestore_mirror_status TEXT NOT NULL DEFAULT 'pending',
  firestore_mirror_error TEXT NOT NULL DEFAULT '',
  firestore_mirrored_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rental_requests_request_id_nonempty CHECK (length(trim(request_id)) > 0),
  CONSTRAINT app_rental_requests_firebase_uid_nonempty CHECK (length(trim(firebase_uid)) > 0),
  CONSTRAINT app_rental_requests_date_order CHECK (due_date >= start_date),
  CONSTRAINT app_rental_requests_idempotency_nonempty CHECK (length(trim(idempotency_key)) > 0),
  CONSTRAINT app_rental_requests_mirror_status CHECK (
    firestore_mirror_status IN ('pending', 'synced', 'failed', 'legacy-source')
  ),
  CONSTRAINT app_rental_requests_user_idempotency_unique UNIQUE (app_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS app_rental_requests_app_user_created_idx
  ON app_rental_requests (app_user_id, created_at DESC, request_id DESC);

CREATE INDEX IF NOT EXISTS app_rental_requests_status_idx
  ON app_rental_requests (status);

CREATE TABLE IF NOT EXISTS app_rental_request_items (
  rental_request_id BIGINT PRIMARY KEY REFERENCES app_rental_requests(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 1,
  laptop_id TEXT NOT NULL,
  asset_category TEXT NOT NULL DEFAULT '',
  asset_no TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rental_request_items_line_number CHECK (line_number = 1),
  CONSTRAINT app_rental_request_items_laptop_id_nonempty CHECK (length(trim(laptop_id)) > 0)
);

CREATE INDEX IF NOT EXISTS app_rental_request_items_laptop_idx
  ON app_rental_request_items (laptop_id);

CREATE TABLE IF NOT EXISTS app_rental_asset_reservation_guards (
  request_id TEXT PRIMARY KEY,
  rental_request_id BIGINT NULL UNIQUE REFERENCES app_rental_requests(id) ON DELETE CASCADE,
  laptop_id TEXT NOT NULL,
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_mode TEXT NOT NULL DEFAULT 'firestore-snapshot',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rental_asset_reservation_guards_request_id_nonempty CHECK (length(trim(request_id)) > 0),
  CONSTRAINT app_rental_asset_reservation_guards_laptop_id_nonempty CHECK (length(trim(laptop_id)) > 0),
  CONSTRAINT app_rental_asset_reservation_guards_date_order CHECK (due_date >= start_date)
);

CREATE INDEX IF NOT EXISTS app_rental_asset_reservation_guards_asset_active_idx
  ON app_rental_asset_reservation_guards (laptop_id, active, start_date, due_date);

CREATE TABLE IF NOT EXISTS app_rental_request_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rental_request_id BIGINT NOT NULL REFERENCES app_rental_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_app_user_id BIGINT NULL REFERENCES app_user_identities(id) ON DELETE SET NULL,
  actor_firebase_uid TEXT NOT NULL DEFAULT '',
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_rental_request_events_type_nonempty CHECK (length(trim(event_type)) > 0),
  CONSTRAINT app_rental_request_events_payload_object CHECK (jsonb_typeof(event_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS app_rental_request_events_request_created_idx
  ON app_rental_request_events (rental_request_id, created_at, id);

INSERT INTO app_rental_requests (
  request_id, app_user_id, firebase_uid, requester_email, requester_name,
  requester_team, start_date, due_date, purpose, status, requested_at_text,
  source_mode, idempotency_key, firestore_mirror_status,
  firestore_mirrored_at, created_at, updated_at
)
SELECT
  shadow.source_request_id,
  shadow.app_user_id,
  shadow.requester_uid,
  shadow.requester_email,
  shadow.requester_name,
  shadow.requester_team,
  shadow.start_date::date,
  shadow.due_date::date,
  shadow.purpose,
  shadow.status,
  shadow.requested_at_text,
  'firestore-imported-legacy',
  'legacy:' || shadow.source_request_id,
  'legacy-source',
  shadow.source_updated_at,
  COALESCE(shadow.source_created_at, shadow.created_at, NOW()),
  COALESCE(shadow.source_updated_at, shadow.updated_at, NOW())
FROM app_user_rental_request_shadows shadow
WHERE shadow.start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND shadow.due_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO app_rental_request_items (
  rental_request_id, line_number, laptop_id, asset_category, asset_no
)
SELECT canonical.id, 1, item.laptop_id, item.asset_category, item.asset_no
FROM app_rental_requests canonical
JOIN app_user_rental_request_shadows shadow
  ON shadow.source_request_id = canonical.request_id
JOIN app_user_rental_request_item_shadows item
  ON item.rental_request_shadow_id = shadow.id
WHERE item.laptop_id <> ''
ON CONFLICT (rental_request_id) DO NOTHING;

INSERT INTO app_rental_asset_reservation_guards (
  request_id, rental_request_id, laptop_id, start_date, due_date,
  status, active, source_mode, synced_at
)
SELECT
  canonical.request_id,
  canonical.id,
  item.laptop_id,
  canonical.start_date,
  canonical.due_date,
  canonical.status,
  canonical.status IN ('신청중', '대여중', '보류'),
  'firestore-imported-legacy',
  NOW()
FROM app_rental_requests canonical
JOIN app_rental_request_items item
  ON item.rental_request_id = canonical.id
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO app_rental_request_events (
  rental_request_id, event_type, actor_app_user_id, actor_firebase_uid, event_payload
)
SELECT
  canonical.id,
  'legacy-imported',
  canonical.app_user_id,
  canonical.firebase_uid,
  jsonb_build_object('source', 'phase16-migration', 'requestId', canonical.request_id)
FROM app_rental_requests canonical
WHERE canonical.source_mode = 'firestore-imported-legacy'
  AND NOT EXISTS (
    SELECT 1
    FROM app_rental_request_events event
    WHERE event.rental_request_id = canonical.id
      AND event.event_type = 'legacy-imported'
  );

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'rental_request_write_phase',
  jsonb_build_object(
    'phase', 16,
    'authority', 'postgresql',
    'mode', 'postgresql-transaction-with-firestore-compatibility-mirror',
    'readCompatibility', 'phase15-shadow-plus-refresh',
    'tables', jsonb_build_array(
      'app_rental_requests',
      'app_rental_request_items',
      'app_rental_asset_reservation_guards',
      'app_rental_request_events'
    ),
    'firestoreMirror', 'required-before-postgresql-commit',
    'adminDomain', 'firestore-until-phase17'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
