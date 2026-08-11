INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase29_rental_transaction_postgresql_authority',
  jsonb_build_object(
    'phase', 29,
    'rentalTransactionSource', 'postgresql-authoritative',
    'rentalRequestFirestoreWriteMirror', 'retired-staging-opt-in',
    'retiredWriteMirrorDomains', jsonb_build_array('rental-request-create','rental-request-user-actions','admin-rental-request-mutations'),
    'preservedCompatibility', jsonb_build_array('firebase-admin-identity','legacy-bootstrap-sync','member-write-mirror','restriction-write-mirror','site-shell','policy-terms')
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
