-- migration_008_admin_account.sql
-- Creates/updates the first admin account.
-- Login password: DemoTime2026
-- The database stores only the bcrypt hash, not the plain password.

INSERT INTO users (
  email,
  password_hash,
  full_name,
  role,
  is_active,
  totp_enabled
)
VALUES (
  'admin@elevensolutions.co.ke',
  crypt('DemoTime2026', gen_salt('bf', 12)),
  'System Administrator',
  'super_admin',
  TRUE,
  FALSE
)
ON CONFLICT (email)
DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = TRUE,
  totp_enabled = FALSE,
  updated_at = NOW();