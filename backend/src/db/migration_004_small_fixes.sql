-- migration_004_small_fixes.sql
-- Small, additive changes for the demo polish round.
-- Idempotent: safe to run on top of any prior state.

BEGIN;

-- 1. Contact phone on quotations (so we capture it when the public form sends it)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20);

-- 2. Default valid_until to created_at + 30 days for any future quote where
--    the staff member didn't set one explicitly. Keep existing values intact.
--    This is just a column default; existing NULLs stay NULL until staff sets them.
ALTER TABLE quotations
  ALTER COLUMN valid_until SET DEFAULT (CURRENT_DATE + INTERVAL '30 days');

-- 3. Useful indexes for the quotation workbench filters (no harm if not used yet)
CREATE INDEX IF NOT EXISTS idx_quotations_status_created
  ON quotations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_valid_until
  ON quotations (valid_until);

COMMIT;
