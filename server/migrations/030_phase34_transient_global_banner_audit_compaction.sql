SELECT pg_advisory_xact_lock(hashtext('phase34-transient-global-banner-audit-compaction'));

-- The operational global system banner is a current-state setting, not a content archive.
-- Keep the general administrator audit entry (who/when/action), but remove historical
-- banner values so old messages/URLs are not retained as a hidden secondary history.
UPDATE app_system_configuration config
   SET payload = jsonb_set(
     config.payload,
     '{logs}',
     COALESCE((
       SELECT jsonb_agg(
         jsonb_set(
           jsonb_set(
             log_entry,
             '{beforeValues}',
             CASE WHEN jsonb_typeof(log_entry->'beforeValues') = 'object' THEN
               (((((log_entry->'beforeValues') - 'systemBannerEnabled') - 'systemBannerLevel') - 'systemBannerMessage') - 'systemBannerUrl') - 'systemBannerDismissible'
             ELSE COALESCE(log_entry->'beforeValues', '{}'::jsonb) END,
             true
           ),
           '{afterValues}',
           CASE WHEN jsonb_typeof(log_entry->'afterValues') = 'object' THEN
             (((((log_entry->'afterValues') - 'systemBannerEnabled') - 'systemBannerLevel') - 'systemBannerMessage') - 'systemBannerUrl') - 'systemBannerDismissible'
           ELSE COALESCE(log_entry->'afterValues', '{}'::jsonb) END,
           true
         )
         ORDER BY ord
       )
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(config.payload->'logs') = 'array' THEN config.payload->'logs' ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS entries(log_entry, ord)
     ), '[]'::jsonb),
     true
   ),
       updated_at = NOW()
 WHERE config.config_key = 'system-settings-audit'
   AND jsonb_typeof(config.payload) = 'object';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_transient_global_banner_audit_compaction',
  jsonb_build_object(
    'operationalAuthority', 'site-settings/siteSettings/config',
    'historyPolicy', 'metadata-only',
    'redactedFields', jsonb_build_array(
      'systemBannerEnabled',
      'systemBannerLevel',
      'systemBannerMessage',
      'systemBannerUrl',
      'systemBannerDismissible'
    ),
    'appliedAt', NOW()
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
