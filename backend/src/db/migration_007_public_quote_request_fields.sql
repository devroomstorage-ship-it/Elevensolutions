-- migration_007_public_quote_request_fields.sql
-- Capture the customer's requested pickup date from the public quotation form.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS requested_pickup_date DATE;

CREATE INDEX IF NOT EXISTS idx_quotations_requested_pickup_date
  ON quotations (requested_pickup_date);