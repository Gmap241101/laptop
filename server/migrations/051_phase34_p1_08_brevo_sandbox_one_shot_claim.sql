-- Phase34 P1-08 G6-D: irreversible global SINGLE sandbox network attempt claim.
-- Uses existing Heroku Staging PostgreSQL; NO new DB, dyno, worker or storage.
-- Migration 050 remains unchanged. An accepted claim NEVER authorizes live email.
-- Claim COMMIT must precede the ONLY sandbox network request. A crash consumes
-- the permit: operators must inspect manually; automatic retry is forbidden.
CREATE TABLE IF NOT EXISTS public.app_mail_sandbox_one_shot_claim (
 singleton_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
 reservation_id BIGINT NOT NULL UNIQUE REFERENCES public.app_mail_sandbox_review_reservations(id),
 actor_clerk_user_id TEXT NOT NULL CHECK (actor_clerk_user_id ~ '^user_[A-Za-z0-9]{8,}$'),
 approval_digest CHAR(64) NOT NULL UNIQUE CHECK (approval_digest ~ '^[a-f0-9]{64}$'),
 body_digest CHAR(64) NOT NULL CHECK (body_digest ~ '^[a-f0-9]{64}$'),
 claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION public.app_mail_sandbox_one_shot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 RAISE EXCEPTION 'mail_sandbox_one_shot_claim_immutable' USING ERRCODE='P0001';
END;$$;
DROP TRIGGER IF EXISTS app_mail_sandbox_one_shot_claim_immutable_trigger
 ON public.app_mail_sandbox_one_shot_claim;
CREATE TRIGGER app_mail_sandbox_one_shot_claim_immutable_trigger
 BEFORE UPDATE OR DELETE ON public.app_mail_sandbox_one_shot_claim
 FOR EACH ROW EXECUTE FUNCTION public.app_mail_sandbox_one_shot_immutable();
DROP TRIGGER IF EXISTS app_mail_sandbox_one_shot_claim_no_truncate
 ON public.app_mail_sandbox_one_shot_claim;
CREATE TRIGGER app_mail_sandbox_one_shot_claim_no_truncate
 BEFORE TRUNCATE ON public.app_mail_sandbox_one_shot_claim
 FOR EACH STATEMENT EXECUTE FUNCTION public.app_mail_sandbox_one_shot_immutable();
