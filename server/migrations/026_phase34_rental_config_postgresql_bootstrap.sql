WITH directory_teams AS (
  SELECT COALESCE(jsonb_agg(team ORDER BY team), '[]'::jsonb) AS teams
    FROM (
      SELECT DISTINCT trim(team) AS team
        FROM app_member_directory_entries
       WHERE enabled = TRUE AND trim(team) <> ''
      UNION
      SELECT DISTINCT trim(team) AS team
        FROM app_member_accounts
       WHERE status <> 'retired' AND trim(team) <> ''
    ) source
),
asset_categories AS (
  SELECT COALESCE(jsonb_agg(name ORDER BY sort_order, id), '["노트북"]'::jsonb) AS categories
    FROM app_asset_categories
),
directory_state AS (
  SELECT COALESCE((SELECT (value->>'version')::bigint
                     FROM app_runtime_metadata
                    WHERE key='phase31_member_directory_bootstrap'
                    LIMIT 1), 0) AS version,
         (SELECT COUNT(*)::bigint FROM app_member_directory_entries WHERE enabled=TRUE) AS entry_count
),
terms_policy AS (
  SELECT COALESCE((SELECT payload
                     FROM app_site_content_documents
                    WHERE domain='terms' AND document_key='signupTermsPolicy/current'
                    LIMIT 1), '{}'::jsonb) AS policy
),
bootstrap_document AS (
  SELECT jsonb_build_object(
    'storageVersion', 1,
    'assetCategories', CASE WHEN jsonb_array_length(asset_categories.categories) > 0 THEN asset_categories.categories ELSE '["노트북"]'::jsonb END,
    'teams', directory_teams.teams,
    'settings', jsonb_build_object(
      'teamInputMode', 'dropdown',
      'borrowerInputMode', 'dropdown',
      'maxRentalDays', 14,
      'adjustStartDateAfterWorkEnd', true,
      'adjustStartDateToNextBusinessDay', true,
      'excludeWeekendsForStartDate', true,
      'excludeSaturdays', true,
      'excludeSundays', true,
      'excludeHolidaysForStartDate', true,
      'workEndTime', '18:00',
      'holidays', '[]'::jsonb,
      'requireAdminApproval', true,
      'requireRegisteredMemberForSignup', (directory_state.entry_count > 0),
      'autoApproveNewMembers', false,
      'memberDirectoryVersion', directory_state.version,
      'memberIdentityClaimsReady', (directory_state.entry_count > 0),
      'signupTermsEnabled', CASE
        WHEN lower(COALESCE(terms_policy.policy->>'enabled', '')) IN ('true','false')
          THEN (terms_policy.policy->>'enabled')::boolean
        ELSE false
      END,
      'signupTermsRequireReconsentOnChange', CASE
        WHEN lower(COALESCE(terms_policy.policy->>'requireReconsentOnChange', '')) IN ('true','false')
          THEN (terms_policy.policy->>'requireReconsentOnChange')::boolean
        ELSE true
      END,
      'signupTermsApplyToExistingMembers', CASE
        WHEN lower(COALESCE(terms_policy.policy->>'applyToExistingMembers', '')) IN ('true','false')
          THEN (terms_policy.policy->>'applyToExistingMembers')::boolean
        ELSE false
      END,
      'signupTermsPolicyRevision', CASE
        WHEN COALESCE(terms_policy.policy->>'revision', '') ~ '^[0-9]+$'
          THEN (terms_policy.policy->>'revision')::int
        ELSE 0
      END,
      'signupTermsRequiredRevision', CASE
        WHEN COALESCE(terms_policy.policy->>'requiredRevision', '') ~ '^[0-9]+$'
          THEN (terms_policy.policy->>'requiredRevision')::int
        ELSE 0
      END,
      'signupTermsInitialRevision', CASE
        WHEN COALESCE(terms_policy.policy->>'initialRevision', '') ~ '^[0-9]+$'
          THEN (terms_policy.policy->>'initialRevision')::int
        ELSE 0
      END,
      'allowNonOverlappingSameAssetRequests', false,
      'rentalExtensionEnabled', false,
      'rentalExtensionApprovalMode', 'manual',
      'rentalExtensionMaxCount', 1,
      'rentalExtensionDays', 5,
      'rentalExtensionRequestWaitDays', 7,
      'overdueRentalBlockEnabled', false,
      'postOverduePenaltyEnabled', false,
      'overduePenaltyMode', 'fixedPerAsset',
      'overdueFixedDaysPerAsset', 1,
      'overdueDayMultiplier', 1
    ),
    'bootstrap', jsonb_build_object(
      'source', 'postgresql-migration',
      'reason', 'missing-rental-config-after-firebase-retirement'
    ),
    'updatedAt', to_jsonb(NOW())
  ) AS payload
  FROM directory_teams, asset_categories, directory_state, terms_policy
)
INSERT INTO app_site_content_documents (
  domain, document_key, payload, enabled, sort_order, source_mode, source_updated_at, synced_at, created_at, updated_at
)
SELECT 'rental-config', 'rentalSystem/publicConfig', payload, NULL, NULL, 'postgresql-self-heal', NOW(), NOW(), NOW(), NOW()
  FROM bootstrap_document
 WHERE NOT EXISTS (
   SELECT 1 FROM app_site_content_documents
    WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
 );

INSERT INTO app_site_content_syncs (
  domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at
)
SELECT
  'rental-config',
  md5(COALESCE((SELECT payload::text FROM app_site_content_documents WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig' LIMIT 1), '{}')),
  (SELECT COUNT(*)::int FROM app_site_content_documents WHERE domain='rental-config'),
  'postgresql-self-heal',
  'phase34-migration-026',
  NOW(),
  NOW()
WHERE EXISTS (
  SELECT 1 FROM app_site_content_documents
   WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
)
ON CONFLICT (domain) DO UPDATE SET
  source_hash = EXCLUDED.source_hash,
  document_count = EXCLUDED.document_count,
  source_mode = EXCLUDED.source_mode,
  last_actor_clerk_user_id = EXCLUDED.last_actor_clerk_user_id,
  synced_at = NOW(),
  updated_at = NOW();

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_rental_config_postgresql_bootstrap',
  jsonb_build_object(
    'phase', 34,
    'domain', 'rental-config',
    'canonical_document', 'rentalSystem/publicConfig',
    'source', 'postgresql-only',
    'firebase_fallback', 'retired',
    'self_heal', true
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
