CREATE TABLE IF NOT EXISTS app_secure_attachments (
  attachment_id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT app_secure_attachments_owner_type_check CHECK (owner_type IN ('notice','faq','inquiry','inquiry_answer')),
  CONSTRAINT app_secure_attachments_name_nonempty CHECK (length(trim(display_name)) > 0),
  CONSTRAINT app_secure_attachments_target_nonempty CHECK (length(trim(target_url)) > 0),
  CONSTRAINT app_secure_attachments_sort_order_nonnegative CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS app_secure_attachments_owner_active_idx
  ON app_secure_attachments (owner_type, owner_id, sort_order, created_at, attachment_id)
  WHERE deleted_at IS NULL;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_secure_external_attachments',
  jsonb_build_object(
    'phase', 34,
    'scope', jsonb_build_array('notice','faq','inquiry','inquiry-answer'),
    'storage', 'external-url-server-only',
    'clientExposure', 'opaque-attachment-id-only',
    'downloadMode', 'server-proxy-no-redirect',
    'privateInquiryAccess', 'owner-or-admin',
    'ssrfProtection', 'https-public-network-only'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
