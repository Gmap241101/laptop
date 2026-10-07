INSERT INTO app_site_content_documents (
  domain,
  document_key,
  payload,
  enabled,
  sort_order,
  source_mode,
  source_updated_at,
  synced_at,
  updated_at
)
VALUES (
  'footer',
  'siteFooter/config',
  '{"enabled":true,"content":"","contentText":"","contentHtml":"","contentFormat":"rich-html-v1","updatedAt":null}'::jsonb,
  TRUE,
  NULL,
  'postgresql-reset-recovery',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (domain, document_key) DO NOTHING;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_footer_reset_recovery_inquiry_reset',
  jsonb_build_object(
    'phase', 34,
    'footer_common_row', 'preserved-empty-on-content-reset',
    'footer_recovery', 'insert-if-missing',
    'inquiry_reset_scope', 'member-and-guest-transactions',
    'inquiry_configuration', 'preserved'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
