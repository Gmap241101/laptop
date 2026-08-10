INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase25_policy_terms_read_cutover',
  jsonb_build_object(
    'phase', 25,
    'scope', jsonb_build_array('rentalSystem/publicConfig','signupTermsPolicy/current','signupTerms'),
    'public_read', 'postgresql-preferred-staging-opt-in',
    'admin_write', 'firestore-authoritative-postgresql-write-through',
    'transaction_authority', 'firestore-preserved',
    'terms_consent_state', 'firestore-authoritative',
    'admin_post_login_route', 'stabilized',
    'excluded', jsonb_build_array('noticePosts','faqPosts','userTermConsentStates','userTermConsentLogs'),
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
