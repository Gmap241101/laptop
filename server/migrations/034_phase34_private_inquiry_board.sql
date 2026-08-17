CREATE TABLE IF NOT EXISTS app_inquiry_settings (
  setting_key TEXT PRIMARY KEY,
  allow_guest BOOLEAN NOT NULL DEFAULT FALSE,
  posts_per_page INTEGER NOT NULL DEFAULT 10,
  guest_term_bindings JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_inquiry_settings_page_size_check CHECK (posts_per_page BETWEEN 5 AND 50),
  CONSTRAINT app_inquiry_settings_bindings_array_check CHECK (jsonb_typeof(guest_term_bindings) = 'array')
);

INSERT INTO app_inquiry_settings (setting_key, allow_guest, posts_per_page, guest_term_bindings, updated_by)
VALUES ('current', FALSE, 10, '[]'::jsonb, 'migration-034')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_inquiry_categories (
  category_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS app_inquiry_categories_active_name_uq
  ON app_inquiry_categories (LOWER(name))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS app_inquiry_categories_active_order_idx
  ON app_inquiry_categories (sort_order, created_at, category_id)
  WHERE deleted_at IS NULL;

INSERT INTO app_inquiry_categories (category_id, name, sort_order, created_by, updated_by)
VALUES
  ('inquirycat-rental', '대여 문의', 10, 'migration-034', 'migration-034'),
  ('inquirycat-return', '반납 문의', 20, 'migration-034', 'migration-034'),
  ('inquirycat-account', '계정 문의', 30, 'migration-034', 'migration-034'),
  ('inquirycat-other', '기타 문의', 40, 'migration-034', 'migration-034')
ON CONFLICT (category_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_inquiry_terms (
  term_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  required BOOLEAN NOT NULL DEFAULT TRUE,
  revision BIGINT NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT NOT NULL DEFAULT '',
  CONSTRAINT app_inquiry_terms_revision_check CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS app_inquiry_terms_active_idx
  ON app_inquiry_terms (enabled, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_inquiries (
  inquiry_id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  author_type TEXT NOT NULL,
  member_uid TEXT,
  category_id TEXT NOT NULL REFERENCES app_inquiry_categories(category_id),
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_team TEXT NOT NULL DEFAULT '',
  author_phone TEXT NOT NULL,
  guest_password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT NOT NULL DEFAULT '',
  delete_actor_type TEXT NOT NULL DEFAULT '',
  CONSTRAINT app_inquiries_author_type_check CHECK (author_type IN ('member','guest')),
  CONSTRAINT app_inquiries_member_identity_check CHECK (
    (author_type='member' AND member_uid IS NOT NULL AND guest_password_hash IS NULL)
    OR
    (author_type='guest' AND member_uid IS NULL AND guest_password_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS app_inquiries_member_active_idx
  ON app_inquiries (member_uid, created_at DESC, inquiry_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS app_inquiries_admin_active_idx
  ON app_inquiries (created_at DESC, inquiry_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS app_inquiries_guest_email_lookup_idx
  ON app_inquiries (LOWER(author_name), LOWER(author_email), created_at DESC)
  WHERE author_type='guest' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS app_inquiries_guest_phone_lookup_idx
  ON app_inquiries (LOWER(author_name), author_phone, created_at DESC)
  WHERE author_type='guest' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS app_inquiries_category_active_idx
  ON app_inquiries (category_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_inquiry_answers (
  answer_id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES app_inquiries(inquiry_id),
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  admin_identity_id TEXT NOT NULL DEFAULT '',
  admin_display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT NOT NULL DEFAULT '',
  delete_actor_type TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS app_inquiry_answers_active_idx
  ON app_inquiry_answers (inquiry_id, created_at, answer_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app_inquiry_guest_consents (
  consent_id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES app_inquiries(inquiry_id),
  term_source TEXT NOT NULL,
  term_id TEXT NOT NULL,
  term_revision BIGINT NOT NULL DEFAULT 1,
  term_version_id TEXT NOT NULL DEFAULT '',
  required_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
  title_snapshot TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_inquiry_guest_consents_source_check CHECK (term_source IN ('signup','inquiry'))
);

CREATE INDEX IF NOT EXISTS app_inquiry_guest_consents_inquiry_idx
  ON app_inquiry_guest_consents (inquiry_id, consented_at, consent_id);

CREATE TABLE IF NOT EXISTS app_inquiry_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  scope_public_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT app_inquiry_guest_sessions_scope_array_check CHECK (jsonb_typeof(scope_public_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS app_inquiry_guest_sessions_expiry_idx
  ON app_inquiry_guest_sessions (expires_at);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_private_inquiry_board',
  jsonb_build_object(
    'phase', 34,
    'authority', 'postgresql-private-inquiry-domain',
    'member_authentication', 'clerk-postgresql',
    'administrator_authentication', 'clerk-postgresql-admin-registry',
    'guest_password_storage', 'scrypt-hash-only',
    'guest_access', 'short-lived-opaque-session',
    'deletion', 'logical-delete',
    'attachment_support', 'deferred',
    'email_notification', 'deferred',
    'retention_scheduler', 'not-implemented',
    'external_firebase_runtime', 'retired'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
