-- Phase 34: reconcile legacy rental request asset identifiers against the
-- PostgreSQL authoritative asset catalog using the unique asset number.
-- This is intentionally conservative: only orphaned laptop_id values with an
-- exact asset_no match are repaired.

WITH recoverable AS (
  SELECT item.rental_request_id,
         matched.asset_id AS next_asset_id
    FROM app_rental_request_items item
    LEFT JOIN app_rental_assets direct_asset ON direct_asset.asset_id=item.laptop_id
    JOIN app_rental_assets matched ON matched.asset_no_normalized=lower(trim(item.asset_no))
   WHERE direct_asset.asset_id IS NULL
),
updated_items AS (
  UPDATE app_rental_request_items item
     SET laptop_id=recoverable.next_asset_id,
         updated_at=NOW()
    FROM recoverable
   WHERE item.rental_request_id=recoverable.rental_request_id
   RETURNING item.rental_request_id, item.laptop_id
)
UPDATE app_rental_asset_reservation_guards guard
   SET laptop_id=updated_items.laptop_id,
       source_mode='postgresql-reference-repaired',
       synced_at=NOW(),
       updated_at=NOW()
  FROM updated_items
 WHERE guard.rental_request_id=updated_items.rental_request_id;

INSERT INTO app_asset_catalog_syncs (
  scope, source_asset_count, source_category_count, source_hash, source_mode,
  synced_at, updated_at
)
SELECT 'main',
       (SELECT COUNT(*)::int FROM app_rental_assets),
       (SELECT COUNT(*)::int FROM app_asset_categories),
       'postgresql-authoritative',
       'postgresql-authoritative',
       NOW(), NOW()
ON CONFLICT (scope) DO UPDATE SET
  source_asset_count=EXCLUDED.source_asset_count,
  source_category_count=EXCLUDED.source_category_count,
  source_hash=EXCLUDED.source_hash,
  source_mode=EXCLUDED.source_mode,
  synced_at=NOW(),
  updated_at=NOW();

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_asset_reference_reconciliation',
  jsonb_build_object(
    'phase', 34,
    'authority', 'postgresql',
    'strategy', 'orphaned-laptop-id-by-unique-asset-number',
    'appliedAt', NOW()
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
