SELECT pg_advisory_xact_lock(hashtext('phase34-rejoin-approval-consolidation'));

CREATE INDEX IF NOT EXISTS app_member_accounts_previous_account_uids_gin_idx
  ON app_member_accounts USING GIN (previous_account_uids);

CREATE INDEX IF NOT EXISTS app_member_accounts_retired_email_idx
  ON app_member_accounts (lower(email), withdrawn_at DESC, updated_at DESC)
  WHERE status='retired' AND email <> '';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_rejoin_approval_consolidation',
  jsonb_build_object(
    'phase', 34,
    'same_email_rejoin', 'new-pending-account-linked-until-approval',
    'approval', 'transfer-business-records-to-current-account-then-delete-retired-account',
    'current_profile', 'new-account-profile-remains-authoritative',
    'previous_terms', 'delete-not-transfer',
    'previous_profile_events', 'delete-not-transfer',
    'previous_account_link', 'cleared-after-successful-transfer',
    'retired_manual_retention', 'administrator-guideline-only-no-employment-date-storage',
    'retired_auto_purge', false,
    'retired_manual_purge', true,
    'retention_guideline', 'confirm-employment-end-externally-and-delete-within-one-year'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
