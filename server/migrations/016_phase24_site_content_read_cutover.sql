CREATE TABLE IF NOT EXISTS app_site_content_documents (
  domain TEXT NOT NULL,
  document_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN,
  sort_order INTEGER,
  source_mode TEXT NOT NULL DEFAULT 'firestore-write-through',
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, document_key)
);

CREATE INDEX IF NOT EXISTS app_site_content_documents_domain_order_idx
  ON app_site_content_documents (domain, sort_order, document_key);

CREATE TABLE IF NOT EXISTS app_site_content_syncs (
  domain TEXT PRIMARY KEY,
  source_hash TEXT NOT NULL DEFAULT '',
  document_count INTEGER NOT NULL DEFAULT 0,
  source_mode TEXT NOT NULL DEFAULT 'firestore-write-through',
  last_actor_clerk_user_id TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase24_site_content_read_cutover',
  jsonb_build_object(
    'phase', 24,
    'scope', jsonb_build_array('site-settings','home','popup','footer'),
    'public_read', 'postgresql-preferred-staging-opt-in',
    'admin_write', 'firestore-authoritative-postgresql-write-through',
    'firestore_user_watchers', 'disabled-for-site-settings-requested-path',
    'excluded', jsonb_build_array('rentalSystem/publicConfig','signupTerms','noticePosts','faqPosts'),
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
