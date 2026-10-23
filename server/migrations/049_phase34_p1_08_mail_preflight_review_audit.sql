-- D06-A/B: review-only immutable audit on the EXISTING PostgreSQL instance.
-- A review never grants SMTP/API sending permission and cannot unlock the dispatcher.
CREATE TABLE IF NOT EXISTS app_mail_preflight_reviews (
  id BIGSERIAL PRIMARY KEY,
  actor_clerk_user_id TEXT NOT NULL CHECK (length(actor_clerk_user_id) BETWEEN 13 AND 100),
  session_digest CHAR(64) NOT NULL,
  reverification_digest CHAR(64) NOT NULL UNIQUE,
  snapshot_digest CHAR(64) NOT NULL,
  review_result TEXT NOT NULL DEFAULT 'reviewed_locked'
    CHECK (review_result = 'reviewed_locked'),
  blocker_codes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocker_codes)='array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_mail_preflight_reviews_latest_idx
  ON app_mail_preflight_reviews (created_at DESC,id DESC);
-- Prevent accidental changes from application SQL; audited reviews are append-only.
CREATE OR REPLACE FUNCTION app_mail_preflight_reviews_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mail_preflight_review_is_immutable' USING ERRCODE = 'P0001';
END;
$$;
DROP TRIGGER IF EXISTS app_mail_preflight_reviews_immutable_trg ON app_mail_preflight_reviews;
CREATE TRIGGER app_mail_preflight_reviews_immutable_trg
  BEFORE UPDATE OR DELETE ON app_mail_preflight_reviews
  FOR EACH ROW EXECUTE FUNCTION app_mail_preflight_reviews_immutable_guard();
