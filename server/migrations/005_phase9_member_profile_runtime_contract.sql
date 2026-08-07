ALTER TABLE app_user_member_shadows
  ADD COLUMN IF NOT EXISTS identity_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recovery_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_account_uids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE app_user_member_shadows
  DROP CONSTRAINT IF EXISTS app_user_member_shadows_previous_account_uids_array;

ALTER TABLE app_user_member_shadows
  ADD CONSTRAINT app_user_member_shadows_previous_account_uids_array
  CHECK (jsonb_typeof(previous_account_uids) = 'array');

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'member_profile_read_cutover_phase',
  jsonb_build_object(
    'phase', 9,
    'mode', 'postgresql-preferred-with-firestore-guard',
    'authoritative', 'firestore',
    'activation', 'staging-opt-in',
    'runtime_contract', jsonb_build_array('identityKey', 'recoveryKey', 'previousAccountUids')
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
