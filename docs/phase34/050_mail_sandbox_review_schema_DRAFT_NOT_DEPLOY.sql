-- Phase34 P1-08 D06-D2B-G2 REVIEW-ONLY SQL DRAFT. NOT AN APPLIED MIGRATION.
-- Do not execute until separately authorized and tested against existing Staging DB.
-- Existing essential-0 PostgreSQL, no new DB/worker/storage/resource.
-- No Outbox foreign key, no real sending capability. Synthetic requests only.
BEGIN;
CREATE TABLE IF NOT EXISTS app_mail_sandbox_review_reservations (
  id BIGSERIAL PRIMARY KEY,
  approval_digest CHAR(64) NOT NULL UNIQUE CHECK (approval_digest ~ '^[a-f0-9]{64}$'),
  actor_clerk_user_id TEXT NOT NULL CHECK (actor_clerk_user_id ~ '^user_[A-Za-z0-9]{8,}$'),
  reauth_digest CHAR(64) NOT NULL UNIQUE CHECK (reauth_digest ~ '^[a-f0-9]{64}$'),
  session_digest CHAR(64) NOT NULL CHECK (session_digest ~ '^[a-f0-9]{64}$'),
  body_digest CHAR(64) NOT NULL CHECK (body_digest ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL CHECK (provider = 'brevo'),
  state TEXT NOT NULL DEFAULT 'held_locked' CHECK (state IN ('held_locked','simulated_accepted','manual_review','uncertain_quarantine')),
  verdict TEXT,
  provider_id_digest CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  -- The CHECK must be IS TRUE: PostgreSQL accepts NULL from a plain CHECK.
  -- This proposal is review-only; it cannot prove a real provider send.
  CONSTRAINT app_mail_sandbox_outcome_consistency CHECK ((
    (state = 'held_locked' AND verdict IS NULL AND settled_at IS NULL
      AND provider_id_digest IS NULL)
    OR (state = 'simulated_accepted' AND verdict = 'sandbox_simulated_acceptance'
      AND settled_at IS NOT NULL AND provider_id_digest ~ '^[a-f0-9]{64}$')
    OR (state = 'manual_review' AND verdict IN ('rate_limited_manual_review','rejected_manual_review')
      AND settled_at IS NOT NULL AND provider_id_digest IS NULL)
    OR (state = 'uncertain_quarantine' AND verdict = 'uncertain_quarantine'
      AND settled_at IS NOT NULL AND provider_id_digest IS NULL)
  ) IS TRUE)
);
CREATE TABLE IF NOT EXISTS app_mail_sandbox_review_audit (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES app_mail_sandbox_review_reservations(id),
  event TEXT NOT NULL CHECK (event IN ('review_held','simulated_accepted','manual_review','uncertain_quarantine')),
  actor_clerk_user_id TEXT NOT NULL,
  payload_digest CHAR(64) NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION app_mail_sandbox_review_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  RAISE EXCEPTION 'mail_sandbox_review_audit_immutable' USING ERRCODE = 'P0001';
END;$$;
DROP TRIGGER IF EXISTS app_mail_sandbox_review_audit_immutable_trigger ON app_mail_sandbox_review_audit;
CREATE TRIGGER app_mail_sandbox_review_audit_immutable_trigger
  BEFORE UPDATE OR DELETE ON app_mail_sandbox_review_audit
  FOR EACH ROW EXECUTE FUNCTION app_mail_sandbox_review_audit_immutable();
-- Row-level UPDATE/DELETE triggers do NOT prevent TRUNCATE.
CREATE OR REPLACE FUNCTION app_mail_sandbox_review_truncate_forbidden()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  RAISE EXCEPTION 'mail_sandbox_review_truncate_forbidden' USING ERRCODE = 'P0001';
END;$$;
DROP TRIGGER IF EXISTS app_mail_sandbox_review_audit_no_truncate ON app_mail_sandbox_review_audit;
CREATE TRIGGER app_mail_sandbox_review_audit_no_truncate
  BEFORE TRUNCATE ON app_mail_sandbox_review_audit
  FOR EACH STATEMENT EXECUTE FUNCTION app_mail_sandbox_review_truncate_forbidden();
CREATE OR REPLACE FUNCTION app_mail_sandbox_review_terminal_guard()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  IF OLD.state <> 'held_locked' OR NEW.id <> OLD.id OR NEW.approval_digest <> OLD.approval_digest
    OR NEW.actor_clerk_user_id <> OLD.actor_clerk_user_id OR NEW.reauth_digest <> OLD.reauth_digest
    OR NEW.session_digest <> OLD.session_digest OR NEW.body_digest <> OLD.body_digest
    OR NEW.provider <> OLD.provider OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'mail_sandbox_review_transition_forbidden' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.state NOT IN ('simulated_accepted','manual_review','uncertain_quarantine') THEN
    RAISE EXCEPTION 'mail_sandbox_review_invalid_settlement' USING ERRCODE = 'P0001';
  END IF;
  IF (
    (NEW.state = 'simulated_accepted' AND NEW.verdict = 'sandbox_simulated_acceptance'
      AND NEW.settled_at IS NOT NULL AND NEW.provider_id_digest ~ '^[a-f0-9]{64}$')
    OR (NEW.state = 'manual_review' AND NEW.verdict IN ('rate_limited_manual_review','rejected_manual_review')
      AND NEW.settled_at IS NOT NULL AND NEW.provider_id_digest IS NULL)
    OR (NEW.state = 'uncertain_quarantine' AND NEW.verdict = 'uncertain_quarantine'
      AND NEW.settled_at IS NOT NULL AND NEW.provider_id_digest IS NULL)
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'mail_sandbox_review_outcome_mismatch' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS app_mail_sandbox_review_terminal_trigger ON app_mail_sandbox_review_reservations;
CREATE TRIGGER app_mail_sandbox_review_terminal_trigger
  BEFORE UPDATE ON app_mail_sandbox_review_reservations
  FOR EACH ROW EXECUTE FUNCTION app_mail_sandbox_review_terminal_guard();
CREATE OR REPLACE FUNCTION app_mail_sandbox_review_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
  RAISE EXCEPTION 'mail_sandbox_review_delete_forbidden' USING ERRCODE = 'P0001';
END;$$;
DROP TRIGGER IF EXISTS app_mail_sandbox_review_no_delete_trigger ON app_mail_sandbox_review_reservations;
CREATE TRIGGER app_mail_sandbox_review_no_delete_trigger
  BEFORE DELETE ON app_mail_sandbox_review_reservations
  FOR EACH ROW EXECUTE FUNCTION app_mail_sandbox_review_no_delete();
DROP TRIGGER IF EXISTS app_mail_sandbox_review_reservation_no_truncate ON app_mail_sandbox_review_reservations;
CREATE TRIGGER app_mail_sandbox_review_reservation_no_truncate
  BEFORE TRUNCATE ON app_mail_sandbox_review_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION app_mail_sandbox_review_truncate_forbidden();
-- In addition review GRANT/REVOKE for the actual runtime role before applying.
-- Separate DBA-managed permission review remains mandatory.
COMMIT;
