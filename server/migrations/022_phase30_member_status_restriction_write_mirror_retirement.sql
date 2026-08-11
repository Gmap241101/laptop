INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase30_member_status_restriction_write_mirror_retirement',
  jsonb_build_object(
    'phase', 30,
    'member_status_source', 'postgresql-authoritative',
    'member_status_firestore_write_mirror', 'retired-staging-opt-in',
    'rental_restriction_status_source', 'postgresql-authoritative',
    'rental_restriction_firestore_write_mirror', 'retired-staging-opt-in',
    'member_profile_edit_mirror', 'preserved-until-identity-directory-cutover',
    'firebase_admin_identity', 'preserved',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
