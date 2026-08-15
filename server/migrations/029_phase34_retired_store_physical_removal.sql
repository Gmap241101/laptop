SELECT pg_advisory_xact_lock(hashtext('phase34-retired-store-physical-removal'));


-- Final safety check for stores already migrated by 028. If those tables were
-- recreated or survived unexpectedly, only remove them when every business row
-- still has a canonical counterpart. This makes 029 a physical-cleanup finalizer
-- without silently discarding data.
DO $$
DECLARE unresolved_count bigint := 0;
BEGIN
  IF to_regclass('public.app_user_member_shadows') IS NOT NULL THEN
    EXECUTE $query$
      SELECT COUNT(*)
        FROM app_user_member_shadows legacy
       WHERE NOT EXISTS (
         SELECT 1 FROM app_member_accounts canonical
          WHERE canonical.firebase_uid = legacy.firebase_uid
       )
    $query$ INTO unresolved_count;
    IF unresolved_count > 0 THEN
      RAISE EXCEPTION 'phase34 retired-store removal: % member shadow rows remain without canonical member accounts', unresolved_count;
    END IF;
  END IF;

  IF to_regclass('public.app_user_rental_request_shadows') IS NOT NULL THEN
    EXECUTE $query$
      SELECT COUNT(*)
        FROM app_user_rental_request_shadows legacy
       WHERE NOT EXISTS (
         SELECT 1 FROM app_rental_requests canonical
          WHERE canonical.request_id = legacy.source_request_id
       )
    $query$ INTO unresolved_count;
    IF unresolved_count > 0 THEN
      RAISE EXCEPTION 'phase34 retired-store removal: % rental request shadow rows remain without canonical requests', unresolved_count;
    END IF;
  END IF;

  IF to_regclass('public.app_user_rental_request_item_shadows') IS NOT NULL
     AND to_regclass('public.app_user_rental_request_shadows') IS NOT NULL THEN
    EXECUTE $query$
      SELECT COUNT(*)
        FROM app_user_rental_request_item_shadows item
        JOIN app_user_rental_request_shadows legacy ON legacy.id = item.rental_request_shadow_id
        JOIN app_rental_requests request ON request.request_id = legacy.source_request_id
       WHERE trim(item.laptop_id) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM app_rental_request_items canonical_item
            WHERE canonical_item.rental_request_id = request.id
         )
    $query$ INTO unresolved_count;
    IF unresolved_count > 0 THEN
      RAISE EXCEPTION 'phase34 retired-store removal: % rental request item shadow rows remain without canonical items', unresolved_count;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS app_user_rental_request_item_shadows;
DROP TABLE IF EXISTS app_user_rental_request_shadow_syncs;
DROP TABLE IF EXISTS app_user_rental_request_shadows;
DROP TABLE IF EXISTS app_user_member_shadows;

-- 1) Rental restriction authority: move the last legacy-named shadow table into a
-- canonical PostgreSQL table, verify every row, then physically remove the old store.
CREATE TABLE IF NOT EXISTS app_rental_restrictions (
  firebase_uid TEXT PRIMARY KEY,
  app_user_id BIGINT NULL UNIQUE REFERENCES app_user_identities(id) ON DELETE SET NULL,
  restriction_exists BOOLEAN NOT NULL DEFAULT FALSE,
  restriction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_document_path TEXT NOT NULL DEFAULT '',
  source_updated_at TIMESTAMPTZ NULL,
  source_hash TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authority_mode TEXT NOT NULL DEFAULT 'postgresql-authoritative',
  mirror_state TEXT NOT NULL DEFAULT 'retired',
  last_mutation_id TEXT NOT NULL DEFAULT '',
  authoritative_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS app_rental_restrictions_app_user_idx
  ON app_rental_restrictions(app_user_id);


-- Canonicalize any reservation guards that were created from the former Firestore
-- availability snapshot path. A guard is derived state, so it must point at the
-- canonical rental request. If an old snapshot row cannot be tied to a canonical
-- request, abort instead of deleting information silently.
UPDATE app_rental_asset_reservation_guards guard
   SET rental_request_id = request.id,
       laptop_id = item.laptop_id,
       start_date = request.start_date,
       due_date = request.due_date,
       status = request.status,
       active = request.status IN ('신청중','대여중','보류'),
       source_mode = 'postgresql-canonical',
       synced_at = NOW(),
       updated_at = NOW()
  FROM app_rental_requests request
  JOIN app_rental_request_items item ON item.rental_request_id = request.id
 WHERE guard.rental_request_id IS NULL
   AND guard.request_id = request.request_id;

INSERT INTO app_rental_asset_reservation_guards (
  request_id, rental_request_id, laptop_id, start_date, due_date,
  status, active, source_mode, synced_at, created_at, updated_at
)
SELECT request.request_id, request.id, item.laptop_id, request.start_date, request.due_date,
       request.status, request.status IN ('신청중','대여중','보류'),
       'postgresql-canonical', NOW(), NOW(), NOW()
  FROM app_rental_requests request
  JOIN app_rental_request_items item ON item.rental_request_id = request.id
 WHERE NOT EXISTS (
   SELECT 1
     FROM app_rental_asset_reservation_guards guard
    WHERE guard.request_id = request.request_id
 )
ON CONFLICT (request_id) DO NOTHING;

DO $$
DECLARE unresolved_snapshot_count bigint := 0;
BEGIN
  SELECT COUNT(*) INTO unresolved_snapshot_count
    FROM app_rental_asset_reservation_guards
   WHERE rental_request_id IS NULL;
  IF unresolved_snapshot_count > 0 THEN
    RAISE EXCEPTION 'phase34 retired-store removal: % legacy reservation snapshot guards remain without canonical rental requests', unresolved_snapshot_count;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.app_user_rental_restriction_shadows') IS NOT NULL THEN
    INSERT INTO app_rental_restrictions (
      firebase_uid, app_user_id, restriction_exists, restriction_payload,
      source_document_path, source_updated_at, source_hash, synced_at,
      created_at, updated_at, authority_mode, mirror_state,
      last_mutation_id, authoritative_updated_at
    )
    SELECT firebase_uid, app_user_id, restriction_exists, restriction_payload,
           source_document_path, source_updated_at, source_hash, synced_at,
           created_at, updated_at,
           'postgresql-authoritative', 'retired',
           COALESCE(last_mutation_id, ''),
           COALESCE(authoritative_updated_at, source_updated_at, synced_at, updated_at, NOW())
      FROM app_user_rental_restriction_shadows
    ON CONFLICT (firebase_uid) DO UPDATE SET
      app_user_id=COALESCE(app_rental_restrictions.app_user_id, EXCLUDED.app_user_id),
      restriction_exists=EXCLUDED.restriction_exists,
      restriction_payload=EXCLUDED.restriction_payload,
      source_document_path=EXCLUDED.source_document_path,
      source_updated_at=EXCLUDED.source_updated_at,
      source_hash=EXCLUDED.source_hash,
      synced_at=GREATEST(app_rental_restrictions.synced_at, EXCLUDED.synced_at),
      authority_mode='postgresql-authoritative',
      mirror_state='retired',
      last_mutation_id=CASE
        WHEN EXCLUDED.last_mutation_id <> '' THEN EXCLUDED.last_mutation_id
        ELSE app_rental_restrictions.last_mutation_id
      END,
      authoritative_updated_at=GREATEST(
        COALESCE(app_rental_restrictions.authoritative_updated_at, '-infinity'::timestamptz),
        COALESCE(EXCLUDED.authoritative_updated_at, '-infinity'::timestamptz)
      ),
      updated_at=GREATEST(app_rental_restrictions.updated_at, EXCLUDED.updated_at);
  END IF;
END $$;

UPDATE app_rental_restrictions
   SET source_document_path = 'postgresql/app_rental_restrictions/' || firebase_uid,
       authority_mode = 'postgresql-authoritative',
       mirror_state = 'retired',
       updated_at = NOW()
 WHERE source_document_path <> 'postgresql/app_rental_restrictions/' || firebase_uid
    OR authority_mode <> 'postgresql-authoritative'
    OR mirror_state <> 'retired';

DO $$
DECLARE
  legacy_count bigint := 0;
  unresolved_count bigint := 0;
BEGIN
  IF to_regclass('public.app_user_rental_restriction_shadows') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*) FROM app_user_rental_restriction_shadows' INTO legacy_count;
    EXECUTE $query$
      SELECT COUNT(*)
        FROM app_user_rental_restriction_shadows legacy
       WHERE NOT EXISTS (
         SELECT 1
           FROM app_rental_restrictions canonical
          WHERE canonical.firebase_uid = legacy.firebase_uid
       )
    $query$ INTO unresolved_count;
  END IF;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'phase34 retired-store removal: % rental restriction rows remain without canonical counterparts', unresolved_count;
  END IF;
  INSERT INTO app_runtime_metadata (key, value, updated_at)
  VALUES (
    'phase34_retired_store_physical_removal',
    jsonb_build_object(
      'legacyRentalRestrictionRowsVerified', legacy_count,
      'canonicalRentalRestrictionRows', (SELECT COUNT(*) FROM app_rental_restrictions),
      'legacyReservationSnapshotRowsRemaining', (SELECT COUNT(*) FROM app_rental_asset_reservation_guards WHERE rental_request_id IS NULL),
      'retiredPhysicalStores', jsonb_build_array(
        'app_user_member_shadows',
        'app_user_rental_request_shadows',
        'app_user_rental_request_item_shadows',
        'app_user_rental_request_shadow_syncs',
        'app_user_rental_restriction_shadows',
        'app_asset_catalog_syncs',
        'app_site_content_syncs',
        'app_board_syncs'
      ),
      'canonicalStatusSource', 'derived-from-authoritative-tables',
      'verifiedBeforeDrop', TRUE,
      'preparedAt', NOW()
    ),
    NOW()
  )
  ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
END $$;

DROP TABLE IF EXISTS app_user_rental_restriction_shadows;

-- 2) Retire the last organization-data copy from rental-config. Older
-- publicConfig documents could still embed `borrowers`, while the canonical
-- member directory is app_member_directory_entries. Reconstruct string-style
-- legacy rows with the historical team rotation rule, migrate any missing
-- entries, verify them, then physically remove the JSON copy.
DO $$
DECLARE
  invalid_borrower_count bigint := 0;
BEGIN
  WITH config AS (
    SELECT payload
      FROM app_site_content_documents
     WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
     LIMIT 1
  ), expanded AS (
    SELECT entry.ordinality,
           entry.value,
           CASE
             WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'name',''))
             WHEN jsonb_typeof(entry.value)='string' THEN trim(entry.value #>> '{}')
             ELSE ''
           END AS raw_name,
           CASE
             WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'team',''))
             WHEN jsonb_typeof(entry.value)='string'
                  AND jsonb_typeof(config.payload->'teams')='array'
                  AND jsonb_array_length(config.payload->'teams') > 0
               THEN trim(config.payload->'teams'->>(((entry.ordinality - 1) % jsonb_array_length(config.payload->'teams'))::int))
             ELSE ''
           END AS raw_team
      FROM config
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(config.payload->'borrowers')='array'
             THEN config.payload->'borrowers'
             ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS entry(value, ordinality)
  )
  SELECT COUNT(*) INTO invalid_borrower_count
    FROM expanded
   WHERE raw_name='' OR raw_team='';

  IF invalid_borrower_count > 0 THEN
    RAISE EXCEPTION 'phase34 retired-store removal: % rental-config borrower rows cannot be canonicalized because name/team is missing', invalid_borrower_count;
  END IF;
END $$;

WITH config AS (
  SELECT payload
    FROM app_site_content_documents
   WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
   LIMIT 1
), expanded AS (
  SELECT entry.ordinality,
         entry.value,
         CASE
           WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'name',''))
           WHEN jsonb_typeof(entry.value)='string' THEN trim(entry.value #>> '{}')
           ELSE ''
         END AS raw_name,
         CASE
           WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'team',''))
           WHEN jsonb_typeof(entry.value)='string'
                AND jsonb_typeof(config.payload->'teams')='array'
                AND jsonb_array_length(config.payload->'teams') > 0
             THEN trim(config.payload->'teams'->>(((entry.ordinality - 1) % jsonb_array_length(config.payload->'teams'))::int))
           ELSE ''
         END AS raw_team,
         CASE WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'id','')) ELSE '' END AS raw_id,
         CASE WHEN jsonb_typeof(entry.value)='object' AND COALESCE(entry.value->>'sortOrder','') ~ '^-?[0-9]+$'
              THEN (entry.value->>'sortOrder')::int
              ELSE (entry.ordinality - 1)::int END AS sort_order
    FROM config
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(config.payload->'borrowers')='array'
           THEN config.payload->'borrowers'
           ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(value, ordinality)
), normalized AS (
  SELECT raw_name AS name,
         raw_team AS team,
         raw_id,
         sort_order,
         encode(
           sha256(
             convert_to(
               lower(regexp_replace(normalize(trim(raw_team), NFKC), '[[:space:]]+', ' ', 'g'))
               || chr(31) ||
               lower(regexp_replace(normalize(trim(raw_name), NFKC), '[[:space:]]+', '', 'g')),
               'UTF8'
             )
           ),
           'hex'
         ) AS identity_key
    FROM expanded
   WHERE raw_name<>'' AND raw_team<>''
)
INSERT INTO app_member_directory_entries (
  identity_key, directory_member_id, name, team, sort_order, enabled,
  source_updated_at, synced_at, created_at, updated_at
)
SELECT identity_key,
       CASE WHEN raw_id<>'' THEN raw_id ELSE 'LEGACY-' || left(identity_key, 24) END,
       name, team, sort_order, TRUE, NOW(), NOW(), NOW(), NOW()
  FROM normalized
ON CONFLICT (identity_key) DO NOTHING;

DO $$
DECLARE
  legacy_borrower_count bigint := 0;
  unresolved_borrower_count bigint := 0;
BEGIN
  WITH config AS (
    SELECT payload
      FROM app_site_content_documents
     WHERE domain='rental-config' AND document_key='rentalSystem/publicConfig'
     LIMIT 1
  ), expanded AS (
    SELECT entry.ordinality,
           CASE
             WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'name',''))
             ELSE trim(entry.value #>> '{}')
           END AS raw_name,
           CASE
             WHEN jsonb_typeof(entry.value)='object' THEN trim(COALESCE(entry.value->>'team',''))
             WHEN jsonb_typeof(config.payload->'teams')='array' AND jsonb_array_length(config.payload->'teams') > 0
               THEN trim(config.payload->'teams'->>(((entry.ordinality - 1) % jsonb_array_length(config.payload->'teams'))::int))
             ELSE ''
           END AS raw_team
      FROM config
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(config.payload->'borrowers')='array'
             THEN config.payload->'borrowers'
             ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS entry(value, ordinality)
  ), normalized AS (
    SELECT encode(
             sha256(
               convert_to(
                 lower(regexp_replace(normalize(trim(raw_team), NFKC), '[[:space:]]+', ' ', 'g'))
                 || chr(31) ||
                 lower(regexp_replace(normalize(trim(raw_name), NFKC), '[[:space:]]+', '', 'g')),
                 'UTF8'
               )
             ),
             'hex'
           ) AS identity_key
      FROM expanded
     WHERE raw_name<>'' AND raw_team<>''
  )
  SELECT COUNT(*), COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM app_member_directory_entries canonical
       WHERE canonical.identity_key = normalized.identity_key
    )
  ) INTO legacy_borrower_count, unresolved_borrower_count
    FROM normalized;

  IF unresolved_borrower_count > 0 THEN
    RAISE EXCEPTION 'phase34 retired-store removal: % rental-config borrower rows remain without canonical directory entries', unresolved_borrower_count;
  END IF;

  UPDATE app_runtime_metadata
     SET value = value || jsonb_build_object(
           'legacyRentalConfigBorrowerRowsVerified', legacy_borrower_count,
           'canonicalMemberDirectoryRows', (SELECT COUNT(*) FROM app_member_directory_entries)
         ),
         updated_at = NOW()
   WHERE key='phase34_retired_store_physical_removal';
END $$;

-- Finalize rental-config deduplication even if an old payload was reintroduced
-- between the earlier consolidation and this cleanup. The canonical stores are:
-- categories -> app_asset_categories, borrowers -> app_member_directory_entries,
-- signupTerms* -> terms/signupTermsPolicy/current.
UPDATE app_site_content_documents
   SET payload = jsonb_set(
         payload - 'assetCategories' - 'borrowers',
         '{settings}',
         CASE
           WHEN jsonb_typeof(payload->'settings')='object' THEN
             (payload->'settings')
               - 'signupTermsEnabled'
               - 'signupTermsRequireReconsentOnChange'
               - 'signupTermsApplyToExistingMembers'
               - 'signupTermsPolicyRevision'
               - 'signupTermsRequiredRevision'
               - 'signupTermsInitialRevision'
           ELSE '{}'::jsonb
         END,
         TRUE
       ),
       updated_at = NOW()
 WHERE domain='rental-config'
   AND document_key='rentalSystem/publicConfig'
   AND (
     payload ? 'assetCategories'
     OR payload ? 'borrowers'
     OR COALESCE((payload->'settings') ? 'signupTermsEnabled', FALSE)
     OR COALESCE((payload->'settings') ? 'signupTermsRequireReconsentOnChange', FALSE)
     OR COALESCE((payload->'settings') ? 'signupTermsApplyToExistingMembers', FALSE)
     OR COALESCE((payload->'settings') ? 'signupTermsPolicyRevision', FALSE)
     OR COALESCE((payload->'settings') ? 'signupTermsRequiredRevision', FALSE)
     OR COALESCE((payload->'settings') ? 'signupTermsInitialRevision', FALSE)
   );

-- 3) Ensure board configuration has canonical defaults before retiring bootstrap status.
INSERT INTO app_board_configs (board_type, posts_per_page, source_mode, synced_at, created_at, updated_at)
VALUES
  ('notice', 10, 'postgresql-canonical', NOW(), NOW(), NOW()),
  ('faq', 10, 'postgresql-canonical', NOW(), NOW(), NOW())
ON CONFLICT (board_type) DO NOTHING;

-- 4) The former sync tables contain only derived count/hash/bootstrap metadata.
-- Runtime now derives these values directly from canonical tables, so physically remove them.
DROP TABLE IF EXISTS app_asset_catalog_syncs;
DROP TABLE IF EXISTS app_site_content_syncs;
DROP TABLE IF EXISTS app_board_syncs;

CREATE OR REPLACE VIEW app_asset_catalog_status AS
SELECT
  'main'::text AS scope,
  (SELECT COUNT(*)::int FROM app_rental_assets) AS source_asset_count,
  (SELECT COUNT(*)::int FROM app_asset_categories) AS source_category_count,
  ''::text AS source_hash,
  'postgresql-canonical'::text AS source_mode,
  GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM app_rental_assets), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM app_asset_categories), '-infinity'::timestamptz)
  ) AS synced_at;

CREATE OR REPLACE VIEW app_board_status AS
SELECT
  'all'::text AS scope,
  (SELECT COUNT(*)::int FROM app_board_posts WHERE board_type='notice') AS notice_count,
  (SELECT COUNT(*)::int FROM app_board_posts WHERE board_type='faq') AS faq_count,
  (SELECT COUNT(*)::int FROM app_faq_categories) AS faq_category_count,
  ''::text AS source_hash,
  'postgresql-canonical'::text AS source_mode,
  ''::text AS last_actor_clerk_user_id,
  GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM app_board_configs), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM app_board_posts), '-infinity'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM app_faq_categories), '-infinity'::timestamptz)
  ) AS synced_at;


-- 5) Remove rich-text copies that older signup-term policies embedded inside
-- activeTerms. The current term document is the content authority; policy rows
-- keep metadata only so the same current body is not stored twice.
UPDATE app_site_content_documents
   SET payload = jsonb_set(
         payload,
         '{activeTerms}',
         COALESCE((
           SELECT jsonb_agg(
             entry.value - 'contentHtml' - 'contentText'
             ORDER BY entry.ordinality
           )
             FROM jsonb_array_elements(COALESCE(payload->'activeTerms', '[]'::jsonb))
                  WITH ORDINALITY AS entry(value, ordinality)
         ), '[]'::jsonb),
         TRUE
       ),
       updated_at = NOW()
 WHERE domain='terms'
   AND document_key='signupTermsPolicy/current';

DELETE FROM app_runtime_metadata WHERE key='phase30_member_accounts_full_bootstrap';

-- Final physical-removal assertion. Historical migrations can still mention
-- these names, but after 029 none may remain as live PostgreSQL relations.
DO $$
BEGIN
  IF to_regclass('public.app_user_member_shadows') IS NOT NULL
     OR to_regclass('public.app_user_rental_request_shadows') IS NOT NULL
     OR to_regclass('public.app_user_rental_request_item_shadows') IS NOT NULL
     OR to_regclass('public.app_user_rental_request_shadow_syncs') IS NOT NULL
     OR to_regclass('public.app_user_rental_restriction_shadows') IS NOT NULL
     OR to_regclass('public.app_asset_catalog_syncs') IS NOT NULL
     OR to_regclass('public.app_site_content_syncs') IS NOT NULL
     OR to_regclass('public.app_board_syncs') IS NOT NULL THEN
    RAISE EXCEPTION 'phase34 retired-store removal: at least one retired physical store still exists after cleanup';
  END IF;
END $$;

UPDATE app_runtime_metadata
   SET value = value || jsonb_build_object(
         'completedAt', NOW(),
         'physicalDropCompleted', TRUE,
         'signupTermsPolicyContentCopiesRemoved', TRUE,
         'rentalConfigBorrowerCopyRemoved', TRUE,
         'rentalConfigDuplicateFieldsRemoved', TRUE
       ),
       updated_at = NOW()
 WHERE key='phase34_retired_store_physical_removal';
