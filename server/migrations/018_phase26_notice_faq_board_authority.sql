CREATE TABLE IF NOT EXISTS app_board_configs (
  board_type TEXT PRIMARY KEY,
  posts_per_page INTEGER NOT NULL DEFAULT 10,
  source_mode TEXT NOT NULL DEFAULT 'firestore-imported-legacy',
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_board_configs_type CHECK (board_type IN ('notice', 'faq')),
  CONSTRAINT app_board_configs_page_size CHECK (posts_per_page BETWEEN 5 AND 50)
);

CREATE TABLE IF NOT EXISTS app_faq_categories (
  category_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_mode TEXT NOT NULL DEFAULT 'firestore-imported-legacy',
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_faq_categories_id_nonempty CHECK (length(trim(category_id)) > 0),
  CONSTRAINT app_faq_categories_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_faq_categories_name_lower_idx
  ON app_faq_categories (lower(trim(name)));
CREATE INDEX IF NOT EXISTS app_faq_categories_order_idx
  ON app_faq_categories (sort_order, category_id);

CREATE TABLE IF NOT EXISTS app_board_posts (
  post_id TEXT PRIMARY KEY,
  board_type TEXT NOT NULL,
  category_id TEXT REFERENCES app_faq_categories(category_id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  content_format TEXT NOT NULL DEFAULT 'rich-html-v1',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  author_uid TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  source_mode TEXT NOT NULL DEFAULT 'firestore-imported-legacy',
  mirror_state TEXT NOT NULL DEFAULT 'synced',
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_board_posts_type CHECK (board_type IN ('notice', 'faq')),
  CONSTRAINT app_board_posts_id_nonempty CHECK (length(trim(post_id)) > 0),
  CONSTRAINT app_board_posts_title_nonempty CHECK (length(trim(title)) > 0),
  CONSTRAINT app_board_posts_view_count_nonnegative CHECK (view_count >= 0),
  CONSTRAINT app_board_posts_category_shape CHECK (
    (board_type = 'notice' AND category_id IS NULL)
    OR (board_type = 'faq' AND category_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS app_board_posts_notice_page_idx
  ON app_board_posts (board_type, is_pinned, created_at DESC, post_id)
  WHERE board_type = 'notice';
CREATE INDEX IF NOT EXISTS app_board_posts_faq_page_idx
  ON app_board_posts (board_type, category_id, is_pinned, created_at DESC, post_id)
  WHERE board_type = 'faq';
CREATE INDEX IF NOT EXISTS app_board_posts_search_idx
  ON app_board_posts (board_type, lower(title));

CREATE TABLE IF NOT EXISTS app_board_syncs (
  scope TEXT PRIMARY KEY,
  notice_count INTEGER NOT NULL DEFAULT 0,
  faq_count INTEGER NOT NULL DEFAULT 0,
  faq_category_count INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL DEFAULT '',
  source_mode TEXT NOT NULL DEFAULT 'firestore-admin-bootstrap',
  last_actor_clerk_user_id TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase26_notice_faq_board_authority',
  jsonb_build_object(
    'phase', 26,
    'scope', jsonb_build_array('noticeBoard/config','noticePosts','faqBoard/config','faqCategories','faqPosts'),
    'publicReadAuthority', 'postgresql-preferred-staging-opt-in',
    'adminReadAuthority', 'postgresql-preferred-staging-opt-in',
    'adminWriteAuthority', 'postgresql-authoritative',
    'firestoreCompatibilityMirror', true,
    'noticeViewCountAuthority', 'postgresql-with-client-firestore-compatibility-mirror',
    'pagination', 'postgresql-limit-offset',
    'search', 'postgresql-title-content',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
