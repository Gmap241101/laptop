-- P1-07: sender display name snapshot only. No new DB, worker, network sending.
ALTER TABLE app_mail_outbox ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT '기기 대여 시스템';
ALTER TABLE app_mail_outbox DROP CONSTRAINT IF EXISTS app_mail_outbox_sender_name_length;
ALTER TABLE app_mail_outbox ADD CONSTRAINT app_mail_outbox_sender_name_length
  CHECK (char_length(sender_name) BETWEEN 1 AND 80);
