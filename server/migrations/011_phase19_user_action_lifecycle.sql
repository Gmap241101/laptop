CREATE INDEX IF NOT EXISTS app_rental_requests_user_action_pending_idx
  ON app_rental_requests (
    (user_action_request->>'status'),
    (user_action_request->>'type'),
    updated_at DESC
  )
  WHERE user_action_request IS NOT NULL;

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'rental_request_user_action_phase',
  jsonb_build_object(
    'phase', 19,
    'userDirectEditAuthority', 'postgresql',
    'userDirectCancelAuthority', 'postgresql',
    'extensionRequestAuthority', 'postgresql',
    'extensionAutoApprovalAuthority', 'postgresql',
    'adminUserActionReviewAuthority', 'postgresql',
    'firestoreCompatibilityMirror', true,
    'shadowRefresh', 'post-mutation-user-source-sync',
    'earlyReturnRequest', 'disabled-by-existing-product-policy'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
