-- W02: durable Device Trust recovery journals in the EXISTING PostgreSQL DB.
-- Operations in 'applying' after web restart are not presumed successful.
CREATE TABLE IF NOT EXISTS app_device_trust_operations (
  operation_id UUID PRIMARY KEY,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('policy_change','reconcile')),
  result_status TEXT NOT NULL CHECK (result_status IN ('applying','recovery_required','failed_recovered','synchronized','recovered')),
  policy_revision BIGINT NOT NULL DEFAULT 0 CHECK (policy_revision >= 0),
  previous_policy_present BOOLEAN NOT NULL DEFAULT FALSE,
  previous_policy JSONB,
  requested_enabled BOOLEAN NOT NULL,
  target_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(target_ids) = 'array'),
  account_results JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(account_results) = 'array'),
  failed_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failed_ids) = 'array'),
  checkpoint TEXT NOT NULL DEFAULT 'started',
  error_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS app_device_trust_operations_recovery_idx
  ON app_device_trust_operations (result_status, updated_at DESC);
