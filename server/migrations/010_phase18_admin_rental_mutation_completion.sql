ALTER TABLE app_rental_request_events
  ADD COLUMN IF NOT EXISTS source_event_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_mode TEXT NOT NULL DEFAULT 'postgresql-authoritative';

CREATE UNIQUE INDEX IF NOT EXISTS app_rental_request_events_source_event_unique_idx
  ON app_rental_request_events (source_event_id)
  WHERE source_event_id IS NOT NULL AND source_event_id <> '';

CREATE INDEX IF NOT EXISTS app_rental_request_events_request_created_desc_idx
  ON app_rental_request_events (rental_request_id, created_at DESC, id DESC);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'admin_rental_request_mutation_phase',
  jsonb_build_object(
    'phase', 18,
    'directEditAuthority', 'postgresql',
    'memoAuthority', 'postgresql',
    'statusRestoreAuthority', 'postgresql',
    'auditReadAuthority', 'postgresql',
    'firestoreCompatibilityMirror', true,
    'postMutationBootstrap', 'targeted-request-sync',
    'remainingLegacyMutation', 'user-action-review'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
