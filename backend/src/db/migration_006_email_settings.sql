-- migration_006_email_settings.sql
-- Adds the email sender settings as rows in the existing site_settings table.
-- Defaults match what was in .env so behavior doesn't change until staff edit.
-- Idempotent.

BEGIN;

-- Defaults: read from environment-style names so they line up with the .env you
-- already use. Staff edit these in the portal once SendGrid verification is done.
INSERT INTO site_settings (key, value)
VALUES
  ('email_from_address',    'info@elevensolutions.co.ke'),
  ('email_from_name',       'Eleven Solutions Limited'),
  ('email_reply_to',        ''),
  -- Per-purpose overrides. Empty string = use the defaults above.
  ('email_from_quotes',     ''),
  ('email_from_invoices',   ''),
  ('email_from_ack',        '')
ON CONFLICT (key) DO NOTHING;

COMMIT;
