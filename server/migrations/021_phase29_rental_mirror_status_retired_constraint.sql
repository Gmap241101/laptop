DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'app_rental_requests_mirror_status'
       AND conrelid = 'app_rental_requests'::regclass
  ) THEN
    ALTER TABLE app_rental_requests
      DROP CONSTRAINT app_rental_requests_mirror_status;
  END IF;

  ALTER TABLE app_rental_requests
    ADD CONSTRAINT app_rental_requests_mirror_status
    CHECK (
      firestore_mirror_status IN ('pending', 'synced', 'failed', 'legacy-source', 'retired')
    );
END
$$;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase29_rental_mirror_status_retired_constraint',
  jsonb_build_object(
    'phase', 29,
    'hotfix', 'rental-mirror-status-retired-constraint',
    'firestoreMirrorStatusRetired', true,
    'authoritativeReadLegacySyncBypass', true
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
