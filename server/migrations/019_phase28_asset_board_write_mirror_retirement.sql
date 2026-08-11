INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase28_asset_board_write_mirror_retirement',
  jsonb_build_object(
    'phase', 28,
    'scope', jsonb_build_array('assets','notice','faq'),
    'writeAuthority', 'postgresql',
    'firestoreWriteMirror', 'retired-staging-opt-in',
    'firebaseAdminCompatibilityIdentity', 'preserved',
    'siteShellWriteThrough', 'preserved',
    'policyTermsFirestoreAuthority', 'preserved',
    'memberRentalWriteMirrors', 'preserved',
    'rollback', 'server-config-var'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
