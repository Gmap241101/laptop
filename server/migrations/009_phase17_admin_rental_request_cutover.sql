ALTER TABLE app_rental_requests
  ALTER COLUMN app_user_id DROP NOT NULL;

ALTER TABLE app_rental_requests
  ADD COLUMN IF NOT EXISTS admin_memo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extension_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_extension_approved_date TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_extension_request_date TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extension_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS user_action_request JSONB NULL,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS actual_return_date TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS overdue_days_at_return BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overdue_penalty_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS overdue_penalty_batch_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS source_synced_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_rental_requests_extension_history_array'
  ) THEN
    ALTER TABLE app_rental_requests
      ADD CONSTRAINT app_rental_requests_extension_history_array
      CHECK (jsonb_typeof(extension_history) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS app_rental_requests_status_created_idx
  ON app_rental_requests (status, created_at DESC, request_id DESC);

CREATE INDEX IF NOT EXISTS app_rental_requests_status_due_idx
  ON app_rental_requests (status, due_date, start_date);

CREATE INDEX IF NOT EXISTS app_rental_requests_requester_uid_idx
  ON app_rental_requests (firebase_uid);

CREATE INDEX IF NOT EXISTS app_rental_requests_requester_email_idx
  ON app_rental_requests (lower(requester_email));

UPDATE app_rental_requests canonical
SET
  admin_memo = shadow.admin_memo,
  extension_count = shadow.extension_count,
  last_extension_approved_date = shadow.last_extension_approved_date,
  next_extension_request_date = shadow.next_extension_request_date,
  extension_history = shadow.extension_history,
  user_action_request = shadow.user_action_request,
  returned_at = shadow.returned_at,
  overdue_penalty_pending = shadow.overdue_penalty_pending,
  overdue_penalty_batch_id = shadow.overdue_penalty_batch_id,
  source_created_at = shadow.source_created_at,
  source_updated_at = shadow.source_updated_at,
  source_synced_at = shadow.source_synced_at,
  updated_at = GREATEST(canonical.updated_at, COALESCE(shadow.source_updated_at, canonical.updated_at))
FROM app_user_rental_request_shadows shadow
WHERE shadow.source_request_id = canonical.request_id;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'admin_rental_request_phase',
  jsonb_build_object(
    'phase', 17,
    'readAuthority', 'postgresql',
    'statusWriteAuthority', 'postgresql',
    'firestoreCompatibilityMirror', true,
    'adminSourceBootstrap', 'firebase-admin-token-through-security-rules',
    'dashboardRequestCounts', 'postgresql',
    'legacyAdminEditMemoAndUserActionReview', 'firestore-with-postgresql-resync'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
