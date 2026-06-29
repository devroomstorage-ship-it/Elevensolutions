-- migration_009_smtp_settings.sql
-- SMTP connection settings as site_settings rows. Seeded with Gmail defaults
-- so a new install just needs the user + app-password filled in.
-- Idempotent — safe to re-run.
--
-- Switching to Safaricom SMTP later = edit four fields in the portal,
-- no code change.

BEGIN;

INSERT INTO site_settings (key, value) VALUES
  ('email_smtp_host', 'smtp.gmail.com'),
  ('email_smtp_port', '465'),
  ('email_smtp_user', ''),
  ('email_smtp_pass', '')
ON CONFLICT (key) DO NOTHING;

COMMIT;
