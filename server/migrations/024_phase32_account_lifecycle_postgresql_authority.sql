ALTER TABLE app_member_accounts
  ADD COLUMN IF NOT EXISTS terms_consent_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_consent_bootstrap_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app_user_term_consent_states (
  firebase_uid TEXT NOT NULL,
  term_id TEXT NOT NULL,
  term_version BIGINT NOT NULL DEFAULT 1,
  term_version_id TEXT NOT NULL DEFAULT '',
  policy_revision BIGINT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,
  required_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  title_snapshot TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  viewed_at_ms BIGINT NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (firebase_uid, term_id),
  CONSTRAINT app_user_term_consent_states_decision_check CHECK (decision IN ('accepted','declined'))
);

CREATE INDEX IF NOT EXISTS app_user_term_consent_states_uid_idx
  ON app_user_term_consent_states (firebase_uid, updated_at DESC);

CREATE TABLE IF NOT EXISTS app_user_term_consent_logs (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL,
  term_id TEXT NOT NULL,
  term_version BIGINT NOT NULL DEFAULT 1,
  term_version_id TEXT NOT NULL DEFAULT '',
  policy_revision BIGINT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,
  previous_decision TEXT NOT NULL DEFAULT '',
  required_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  title_snapshot TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  viewed_at_ms BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_user_term_consent_logs_decision_check CHECK (decision IN ('accepted','declined'))
);

CREATE INDEX IF NOT EXISTS app_user_term_consent_logs_uid_created_idx
  ON app_user_term_consent_logs (firebase_uid, created_at DESC);

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase32_account_lifecycle_postgresql_authority',
  jsonb_build_object(
    'phase', 32,
    'signup_profile_bootstrap', 'postgresql-authoritative-firebase-auth-compatibility-identity',
    'signup_firestore_documents', 'retired-staging-opt-in',
    'terms_consent_state_log', 'postgresql-authoritative',
    'terms_consent_legacy_bootstrap', 'one-time-firestore-server-import',
    'password_reset_delivery', 'firebase-auth-compatibility-preserved',
    'account_recovery_identity', 'postgresql-authoritative',
    'firebase_auth_compatibility_session', 'preserved-until-final-platform-cleanup',
    'site_shell_parity_fallback', 'preserved',
    'activation', 'staging-opt-in'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
