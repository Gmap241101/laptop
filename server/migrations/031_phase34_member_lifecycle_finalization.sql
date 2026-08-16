SELECT pg_advisory_xact_lock(hashtext('phase34-member-lifecycle-finalization'));

CREATE INDEX IF NOT EXISTS app_member_accounts_retired_status_idx
  ON app_member_accounts (status, withdrawn_at DESC, updated_at DESC)
  WHERE status='retired';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_member_lifecycle_finalization',
  jsonb_build_object(
    'phase', 34,
    'signup_uid', 'random-per-account',
    'same_email_rejoin', 'new-account-linked-to-retired-until-purge',
    'pending_admin_actions', jsonb_build_array('approve','reject'),
    'retired_reactivation', 'forbidden',
    'retired_storage', 'preserve-until-explicit-permanent-delete',
    'permanent_delete', 'member-and-business-records-physical-delete',
    'deleted_email_reuse', 'fresh-member-no-lineage'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
