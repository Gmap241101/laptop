SELECT pg_advisory_xact_lock(hashtext('phase34-admin-member-directory-override'));

ALTER TABLE app_member_accounts
  ADD COLUMN IF NOT EXISTS directory_override_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS app_member_accounts_directory_admin_override_idx
  ON app_member_accounts (directory_override_by_admin, status)
  WHERE directory_override_by_admin = TRUE AND status <> 'retired';

INSERT INTO app_runtime_metadata (key, value, updated_at)
VALUES (
  'phase34_admin_member_directory_override',
  jsonb_build_object(
    'phase', 34,
    'default_admin_member_identity_input', 'registered-directory',
    'manual_override', 'explicit-modal-checkbox-unchecked',
    'override_scope', 'administrator-created-or-edited-member-profile',
    'member_self_edit_override', false,
    'directory_audit_override_behavior', 'exclude-explicit-admin-overrides'
  ),
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW();
