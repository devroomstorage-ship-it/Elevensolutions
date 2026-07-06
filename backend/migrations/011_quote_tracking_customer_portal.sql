BEGIN;

-- Quote tracking fields. Existing columns are left untouched.
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS otp_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS quote_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS client_notes TEXT;

-- Normalise old pending status into the new first customer-facing state.
UPDATE quotations SET status = 'received' WHERE status IS NULL OR status = 'pending';

-- Make sure quote references are unique. This assumes existing references are already unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_reference_unique
ON quotations (UPPER(reference));

-- Invoice tracking fields. These are safe if the table already exists.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITHOUT TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number_unique
ON invoices (UPPER(invoice_number))
WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id
ON invoices (quotation_id);

COMMIT;
