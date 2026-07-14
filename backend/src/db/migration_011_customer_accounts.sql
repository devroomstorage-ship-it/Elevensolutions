-- migration_011_customer_accounts.sql
-- Staff-invited customer (client) portal accounts.
--
-- Clients get a login (role='client' on the existing `users` table, same
-- 1:1-extension pattern driver_profiles already uses for role='driver') that
-- a staff member creates by triggering an email invite from the client's
-- record. No public self-signup. One login per client company for MVP.
--
-- Idempotent: safe to re-run.

-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block that also
-- uses the new value (see migration_002 precedent) — run standalone, before
-- BEGIN.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client';

BEGIN;

-- users.client_id links a role='client' user to exactly one client row.
-- NULL for every staff user. The partial unique index enforces "0 or 1
-- client user per client" while still allowing unlimited NULLs for staff.
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_client_id
  ON users (client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_client_id ON users (client_id);

-- One row per outstanding/historical invite. Only the bcrypt hash of the
-- raw token is ever stored. Issuing a new invite for a client deletes any
-- prior unused row for that client (application logic), so in practice at
-- most one row per client is "live" at a time.
CREATE TABLE IF NOT EXISTS client_invites (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL,
  invited_by   UUID REFERENCES users(id),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_invites_client ON client_invites (client_id);

COMMIT;
