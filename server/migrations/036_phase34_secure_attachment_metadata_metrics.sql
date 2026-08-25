ALTER TABLE app_secure_attachments
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS download_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata_checked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='app_secure_attachments_file_size_nonnegative'
  ) THEN
    ALTER TABLE app_secure_attachments
      ADD CONSTRAINT app_secure_attachments_file_size_nonnegative
      CHECK (file_size_bytes IS NULL OR (file_size_bytes >= 0 AND file_size_bytes <= 52428800));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='app_secure_attachments_download_count_nonnegative'
  ) THEN
    ALTER TABLE app_secure_attachments
      ADD CONSTRAINT app_secure_attachments_download_count_nonnegative
      CHECK (download_count >= 0);
  END IF;
END $$;

UPDATE app_secure_attachments
   SET download_count=0
 WHERE download_count IS NULL;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_secure_attachment_metadata_metrics',
  jsonb_build_object(
    'phase', 34,
    'fileSize', 'server-probed-or-first-successful-download',
    'downloadCount', 'atomic-successful-download-completion-only',
    'historicalDownloadCount', 'starts-at-zero-on-migration',
    'clientExposure', 'display-name-size-download-count-only',
    'sourceUrlExposure', 'server-only'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
