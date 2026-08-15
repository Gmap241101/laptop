SELECT pg_advisory_xact_lock(hashtext('phase34-canonical-data-consolidation'));

-- 1) Asset categories: app_asset_categories is the sole PostgreSQL authority.
-- Import any category that still exists only in the legacy rental-config payload,
-- then remove the duplicate field from that document.
WITH legacy_category_rows AS (
  SELECT trim(category.value) AS name,
         lower(trim(category.value)) AS normalized_name,
         category.ordinality AS legacy_order
    FROM app_site_content_documents document
   CROSS JOIN LATERAL jsonb_array_elements_text(
     CASE
       WHEN jsonb_typeof(document.payload->'assetCategories') = 'array'
         THEN document.payload->'assetCategories'
       ELSE '[]'::jsonb
     END
   ) WITH ORDINALITY AS category(value, ordinality)
   WHERE document.domain = 'rental-config'
     AND document.document_key = 'rentalSystem/publicConfig'
     AND trim(category.value) <> ''
), legacy_categories AS (
  SELECT DISTINCT ON (normalized_name)
         name, normalized_name, legacy_order
    FROM legacy_category_rows
   ORDER BY normalized_name, legacy_order
), category_base AS (
  SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order
    FROM app_asset_categories
), numbered AS (
  SELECT legacy_categories.*,
         ROW_NUMBER() OVER (ORDER BY legacy_categories.legacy_order, legacy_categories.name) - 1 AS offset_value
    FROM legacy_categories
)
INSERT INTO app_asset_categories (name, normalized_name, sort_order, source_mode, created_at, updated_at)
SELECT numbered.name,
       numbered.normalized_name,
       category_base.max_sort_order + numbered.offset_value + 1,
       'postgresql-canonical-consolidation',
       NOW(),
       NOW()
  FROM numbered
 CROSS JOIN category_base
ON CONFLICT (normalized_name) DO NOTHING;

DO $$
DECLARE unresolved_count bigint;
BEGIN
  WITH legacy_categories AS (
    SELECT DISTINCT lower(trim(category.value)) AS normalized_name
      FROM app_site_content_documents document
     CROSS JOIN LATERAL jsonb_array_elements_text(
       CASE
         WHEN jsonb_typeof(document.payload->'assetCategories') = 'array'
           THEN document.payload->'assetCategories'
         ELSE '[]'::jsonb
       END
     ) AS category(value)
     WHERE document.domain = 'rental-config'
       AND document.document_key = 'rentalSystem/publicConfig'
       AND trim(category.value) <> ''
  )
  SELECT COUNT(*) INTO unresolved_count
    FROM legacy_categories legacy
   WHERE NOT EXISTS (
     SELECT 1 FROM app_asset_categories canonical
      WHERE canonical.normalized_name = legacy.normalized_name
   );
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: % rental-config asset categories remain without app_asset_categories counterparts', unresolved_count;
  END IF;
END $$;

-- 2) Signup terms policy: terms/signupTermsPolicy/current is the sole authority.
-- Fill only missing/older policy fields from the legacy rental-config settings,
-- then strip all duplicated signupTerms* fields from rental-config.
DO $$
DECLARE
  rental_payload jsonb := '{}'::jsonb;
  rental_settings jsonb := '{}'::jsonb;
  policy_payload jsonb := '{}'::jsonb;
  policy_enabled boolean := false;
  policy_reconsent boolean := true;
  policy_apply_existing boolean := false;
  policy_revision bigint := 0;
  policy_required_revision bigint := 0;
  policy_initial_revision bigint := 0;
BEGIN
  SELECT COALESCE(payload, '{}'::jsonb)
    INTO rental_payload
    FROM app_site_content_documents
   WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
   LIMIT 1;
  rental_payload := COALESCE(rental_payload, '{}'::jsonb);
  rental_settings := CASE
    WHEN jsonb_typeof(rental_payload->'settings')='object' THEN rental_payload->'settings'
    ELSE '{}'::jsonb
  END;

  SELECT COALESCE(payload, '{}'::jsonb)
    INTO policy_payload
    FROM app_site_content_documents
   WHERE domain='terms' AND document_key='signupTermsPolicy/current'
   LIMIT 1;
  policy_payload := COALESCE(policy_payload, '{}'::jsonb);

  policy_enabled := CASE
    WHEN policy_payload ? 'enabled' THEN COALESCE((policy_payload->>'enabled')::boolean, false)
    ELSE COALESCE((rental_settings->>'signupTermsEnabled')::boolean, false)
  END;
  policy_reconsent := CASE
    WHEN policy_payload ? 'requireReconsentOnChange' THEN COALESCE((policy_payload->>'requireReconsentOnChange')::boolean, true)
    ELSE COALESCE((rental_settings->>'signupTermsRequireReconsentOnChange')::boolean, true)
  END;
  policy_apply_existing := CASE
    WHEN policy_payload ? 'applyToExistingMembers' THEN COALESCE((policy_payload->>'applyToExistingMembers')::boolean, false)
    ELSE COALESCE((rental_settings->>'signupTermsApplyToExistingMembers')::boolean, false)
  END;

  policy_revision := GREATEST(
    CASE WHEN COALESCE(policy_payload->>'revision','') ~ '^[0-9]+$' THEN (policy_payload->>'revision')::bigint ELSE 0 END,
    CASE WHEN COALESCE(rental_settings->>'signupTermsPolicyRevision','') ~ '^[0-9]+$' THEN (rental_settings->>'signupTermsPolicyRevision')::bigint ELSE 0 END
  );
  policy_required_revision := GREATEST(
    CASE WHEN COALESCE(policy_payload->>'requiredRevision','') ~ '^[0-9]+$' THEN (policy_payload->>'requiredRevision')::bigint ELSE 0 END,
    CASE WHEN COALESCE(rental_settings->>'signupTermsRequiredRevision','') ~ '^[0-9]+$' THEN (rental_settings->>'signupTermsRequiredRevision')::bigint ELSE 0 END
  );
  policy_initial_revision := GREATEST(
    CASE WHEN COALESCE(policy_payload->>'initialRevision','') ~ '^[0-9]+$' THEN (policy_payload->>'initialRevision')::bigint ELSE 0 END,
    CASE WHEN COALESCE(rental_settings->>'signupTermsInitialRevision','') ~ '^[0-9]+$' THEN (rental_settings->>'signupTermsInitialRevision')::bigint ELSE 0 END
  );

  INSERT INTO app_site_content_documents (
    domain, document_key, payload, enabled, sort_order, source_mode,
    source_updated_at, synced_at, created_at, updated_at
  ) VALUES (
    'terms', 'signupTermsPolicy/current',
    policy_payload || jsonb_build_object(
      'enabled', policy_enabled,
      'requireReconsentOnChange', policy_reconsent,
      'applyToExistingMembers', policy_apply_existing,
      'revision', policy_revision,
      'requiredRevision', policy_required_revision,
      'initialRevision', policy_initial_revision,
      'activeTerms', CASE WHEN jsonb_typeof(policy_payload->'activeTerms')='array' THEN policy_payload->'activeTerms' ELSE '[]'::jsonb END,
      'updatedAt', NOW()
    ),
    policy_enabled, NULL, 'postgresql-canonical-consolidation', NOW(), NOW(), NOW(), NOW()
  )
  ON CONFLICT (domain, document_key) DO UPDATE SET
    payload=EXCLUDED.payload,
    enabled=EXCLUDED.enabled,
    source_mode=EXCLUDED.source_mode,
    source_updated_at=NOW(), synced_at=NOW(), updated_at=NOW();
END $$;

UPDATE app_site_content_documents
   SET payload = jsonb_set(
         payload - 'assetCategories',
         '{settings}',
         COALESCE(payload->'settings','{}'::jsonb)
           - 'signupTermsEnabled'
           - 'signupTermsRequireReconsentOnChange'
           - 'signupTermsApplyToExistingMembers'
           - 'signupTermsPolicyRevision'
           - 'signupTermsRequiredRevision'
           - 'signupTermsInitialRevision',
         TRUE
       ),
       source_mode='postgresql-canonical-consolidation',
       source_updated_at=NOW(), synced_at=NOW(), updated_at=NOW()
 WHERE domain='rental-config'
   AND document_key='rentalSystem/publicConfig';

DO $$
DECLARE duplicate_count bigint;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
    FROM app_site_content_documents
   WHERE domain='rental-config'
     AND document_key='rentalSystem/publicConfig'
     AND (
       payload ? 'assetCategories'
       OR COALESCE(payload->'settings','{}'::jsonb) ?| ARRAY[
         'signupTermsEnabled',
         'signupTermsRequireReconsentOnChange',
         'signupTermsApplyToExistingMembers',
         'signupTermsPolicyRevision',
         'signupTermsRequiredRevision',
         'signupTermsInitialRevision'
       ]
     );
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: retired rental-config duplicate authority fields remain';
  END IF;
END $$;

INSERT INTO app_site_content_syncs (domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at)
SELECT 'rental-config', 'phase34-canonical-consolidation', COUNT(*)::integer,
       'postgresql-canonical-consolidation', 'phase34-canonical-consolidation', NOW(), NOW()
  FROM app_site_content_documents
 WHERE domain='rental-config'
ON CONFLICT (domain) DO UPDATE SET
  source_hash=EXCLUDED.source_hash,
  document_count=EXCLUDED.document_count,
  source_mode=EXCLUDED.source_mode,
  last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id,
  synced_at=NOW(), updated_at=NOW();

INSERT INTO app_site_content_syncs (domain, source_hash, document_count, source_mode, last_actor_clerk_user_id, synced_at, updated_at)
SELECT 'terms', 'phase34-canonical-consolidation', COUNT(*)::integer,
       'postgresql-canonical-consolidation', 'phase34-canonical-consolidation', NOW(), NOW()
  FROM app_site_content_documents
 WHERE domain='terms'
ON CONFLICT (domain) DO UPDATE SET
  source_hash=EXCLUDED.source_hash,
  document_count=EXCLUDED.document_count,
  source_mode=EXCLUDED.source_mode,
  last_actor_clerk_user_id=EXCLUDED.last_actor_clerk_user_id,
  synced_at=NOW(), updated_at=NOW();

-- 3) Member profile: app_member_accounts is the sole authority.
-- Import only missing canonical rows; existing canonical rows always win.
INSERT INTO app_member_accounts (
  firebase_uid, app_user_id, email, masked_email, name, team, phone, status,
  directory_member_id, directory_verified_version, profile_required_reason,
  rejoined_account, terms_consent_revision, terms_consent_policy_version,
  identity_key, recovery_key, previous_account_uids, source_hash,
  authority_mode, mirror_state, last_mutation_id, source_updated_at,
  authoritative_updated_at, synced_at, created_at, updated_at
)
SELECT shadow.firebase_uid, shadow.app_user_id, shadow.email, shadow.masked_email,
       shadow.name, shadow.team, shadow.phone, shadow.status,
       shadow.directory_member_id, shadow.directory_verified_version,
       shadow.profile_required_reason, shadow.rejoined_account,
       shadow.terms_consent_revision, shadow.terms_consent_policy_version,
       shadow.identity_key, shadow.recovery_key, shadow.previous_account_uids,
       shadow.source_hash, 'postgresql-authoritative', 'retired',
       shadow.last_mutation_id, shadow.source_updated_at,
       COALESCE(shadow.authoritative_updated_at, shadow.source_updated_at, shadow.updated_at, NOW()),
       COALESCE(shadow.synced_at, NOW()), shadow.created_at, shadow.updated_at
  FROM app_user_member_shadows shadow
 WHERE NOT EXISTS (
   SELECT 1 FROM app_member_accounts member
    WHERE member.firebase_uid=shadow.firebase_uid
 )
ON CONFLICT (firebase_uid) DO NOTHING;

DO $$
DECLARE unresolved_count bigint;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
    FROM app_user_member_shadows shadow
   WHERE NOT EXISTS (
     SELECT 1 FROM app_member_accounts member
      WHERE member.firebase_uid=shadow.firebase_uid
   );
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: % member shadow rows remain without app_member_accounts counterparts', unresolved_count;
  END IF;
END $$;

-- 4) Rental requests: app_rental_requests/app_rental_request_items are the sole authority.
-- Import missing valid legacy requests and items before clearing the obsolete shadow tables.
INSERT INTO app_rental_requests (
  request_id, app_user_id, firebase_uid, requester_email, requester_name,
  requester_team, start_date, due_date, purpose, status, requested_at_text,
  source_mode, idempotency_key, firestore_mirror_status,
  admin_memo, extension_count, last_extension_approved_date,
  next_extension_request_date, extension_history, user_action_request,
  returned_at, overdue_penalty_pending, overdue_penalty_batch_id,
  source_created_at, source_updated_at, source_synced_at,
  firestore_mirrored_at, created_at, updated_at
)
SELECT shadow.source_request_id, shadow.app_user_id, shadow.requester_uid,
       shadow.requester_email, shadow.requester_name, shadow.requester_team,
       shadow.start_date::date, shadow.due_date::date, shadow.purpose, shadow.status,
       shadow.requested_at_text, 'postgresql-canonical-consolidation',
       'legacy:' || shadow.source_request_id, 'retired',
       shadow.admin_memo, shadow.extension_count,
       shadow.last_extension_approved_date, shadow.next_extension_request_date,
       shadow.extension_history, shadow.user_action_request, shadow.returned_at,
       shadow.overdue_penalty_pending, shadow.overdue_penalty_batch_id,
       shadow.source_created_at, shadow.source_updated_at, shadow.source_synced_at,
       shadow.source_updated_at,
       COALESCE(shadow.source_created_at, shadow.created_at, NOW()),
       COALESCE(shadow.source_updated_at, shadow.updated_at, NOW())
  FROM app_user_rental_request_shadows shadow
 WHERE shadow.start_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND shadow.due_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND NOT EXISTS (
     SELECT 1 FROM app_rental_requests request
      WHERE request.request_id=shadow.source_request_id
   )
ON CONFLICT (request_id) DO NOTHING;

DO $$
DECLARE invalid_item_count bigint;
BEGIN
  SELECT COUNT(*) INTO invalid_item_count
    FROM app_user_rental_request_item_shadows
   WHERE trim(laptop_id) = '';
  IF invalid_item_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: % legacy rental request item rows have no laptop_id and cannot be migrated safely', invalid_item_count;
  END IF;
END $$;

INSERT INTO app_rental_request_items (rental_request_id, line_number, laptop_id, asset_category, asset_no)
SELECT request.id, 1, item.laptop_id, item.asset_category, item.asset_no
  FROM app_user_rental_request_shadows shadow
  JOIN app_user_rental_request_item_shadows item
    ON item.rental_request_shadow_id=shadow.id
  JOIN app_rental_requests request
    ON request.request_id=shadow.source_request_id
 WHERE trim(item.laptop_id) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM app_rental_request_items canonical_item
      WHERE canonical_item.rental_request_id=request.id
   )
ON CONFLICT (rental_request_id) DO NOTHING;

INSERT INTO app_rental_asset_reservation_guards (
  request_id, rental_request_id, laptop_id, start_date, due_date,
  status, active, source_mode, synced_at, created_at, updated_at
)
SELECT request.request_id, request.id, item.laptop_id, request.start_date,
       request.due_date, request.status,
       request.status IN ('신청중','대여중','보류'),
       'postgresql-canonical-consolidation', NOW(), NOW(), NOW()
  FROM app_rental_requests request
  JOIN app_rental_request_items item ON item.rental_request_id=request.id
 WHERE NOT EXISTS (
   SELECT 1 FROM app_rental_asset_reservation_guards guard
    WHERE guard.request_id=request.request_id
 )
ON CONFLICT (request_id) DO NOTHING;

INSERT INTO app_rental_request_events (
  rental_request_id, event_type, actor_app_user_id, actor_firebase_uid, event_payload
)
SELECT request.id,
       'canonical-consolidation-import',
       request.app_user_id,
       request.firebase_uid,
       jsonb_build_object('source', 'phase34-migration-028', 'requestId', request.request_id)
  FROM app_rental_requests request
 WHERE request.source_mode = 'postgresql-canonical-consolidation'
   AND NOT EXISTS (
     SELECT 1 FROM app_rental_request_events event
      WHERE event.rental_request_id=request.id
        AND event.event_type='canonical-consolidation-import'
   );

DO $$
DECLARE unresolved_count bigint;
BEGIN
  SELECT COUNT(*) INTO unresolved_count
    FROM app_user_rental_request_shadows shadow
   WHERE NOT EXISTS (
     SELECT 1 FROM app_rental_requests request
      WHERE request.request_id=shadow.source_request_id
   );
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: % rental request shadow rows remain without app_rental_requests counterparts', unresolved_count;
  END IF;

  SELECT COUNT(*) INTO unresolved_count
    FROM app_user_rental_request_shadows shadow
    JOIN app_user_rental_request_item_shadows item ON item.rental_request_shadow_id=shadow.id
    JOIN app_rental_requests request ON request.request_id=shadow.source_request_id
   WHERE trim(item.laptop_id) <> ''
     AND NOT EXISTS (
       SELECT 1 FROM app_rental_request_items canonical_item
        WHERE canonical_item.rental_request_id=request.id
     );
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'phase34 canonical consolidation: % rental request item shadow rows remain without canonical counterparts', unresolved_count;
  END IF;
END $$;

-- Record the consolidation metrics before removing obsolete duplicate stores.
INSERT INTO app_runtime_metadata (key, value, updated_at)
SELECT
  'phase34_canonical_data_consolidation',
  jsonb_build_object(
    'phase', 34,
    'authority', 'postgresql-canonical-only',
    'assetCategories', 'app_asset_categories',
    'canonicalAssetCategoryRows', (SELECT COUNT(*) FROM app_asset_categories),
    'signupTermsPolicy', 'app_site_content_documents:terms/signupTermsPolicy/current',
    'memberProfiles', 'app_member_accounts',
    'legacyMemberRowsVerified', (SELECT COUNT(*) FROM app_user_member_shadows),
    'canonicalMemberRows', (SELECT COUNT(*) FROM app_member_accounts),
    'rentalRequests', 'app_rental_requests+app_rental_request_items',
    'legacyRentalRequestRowsVerified', (SELECT COUNT(*) FROM app_user_rental_request_shadows),
    'legacyRentalItemRowsVerified', (SELECT COUNT(*) FROM app_user_rental_request_item_shadows),
    'canonicalRentalRequestRows', (SELECT COUNT(*) FROM app_rental_requests),
    'canonicalRentalItemRows', (SELECT COUNT(*) FROM app_rental_request_items),
    'retainedCompatibilityIdentifiers', jsonb_build_array('app_user_firebase_links','firebase_uid'),
    'retainedCanonicalLegacyNamedTable', 'app_user_rental_restriction_shadows',
    'verifiedBeforeDrop', TRUE,
    'preparedAt', NOW()
  ),
  NOW()
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();

-- Once every legacy row has a canonical counterpart, remove the obsolete duplicate stores.
DROP TABLE IF EXISTS app_user_rental_request_item_shadows;
DROP TABLE IF EXISTS app_user_rental_request_shadow_syncs;
DROP TABLE IF EXISTS app_user_rental_request_shadows;
DROP TABLE IF EXISTS app_user_member_shadows;

UPDATE app_runtime_metadata
   SET value = value || jsonb_build_object(
         'obsoleteDuplicateStoresDropped', jsonb_build_array(
           'app_user_member_shadows',
           'app_user_rental_request_shadows',
           'app_user_rental_request_item_shadows',
           'app_user_rental_request_shadow_syncs'
         ),
         'completedAt', NOW()
       ),
       updated_at = NOW()
 WHERE key = 'phase34_canonical_data_consolidation';
