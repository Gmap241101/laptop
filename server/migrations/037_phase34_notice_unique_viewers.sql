CREATE TABLE IF NOT EXISTS app_board_notice_unique_views (
  post_id TEXT NOT NULL REFERENCES app_board_posts(post_id) ON DELETE CASCADE,
  viewer_hash TEXT NOT NULL,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, viewer_hash),
  CONSTRAINT app_board_notice_unique_views_hash_shape CHECK (viewer_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS app_board_notice_unique_views_first_viewed_idx
  ON app_board_notice_unique_views (first_viewed_at DESC, post_id);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_notice_unique_viewers',
  jsonb_build_object(
    'phase', 34,
    'scope', 'notice-view-count',
    'authority', 'postgresql',
    'viewerIdentity', 'browser-local-opaque-id-sha256',
    'counting', 'first-view-per-browser-profile-per-post',
    'legacyViewCount', 'preserved-as-existing-baseline',
    'personalData', 'none-stored'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
