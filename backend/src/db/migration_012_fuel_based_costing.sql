-- migration_012_fuel_based_costing.sql
-- Replace the per-km costing model with the company's real pricing formula
-- (source: client's "Truck Costing.xlsx"):
--
--   fuel cost    = billable km ÷ truck fuel efficiency (km per litre)
--                  × fuel price per litre
--   billable km  = 2 × one-way distance when the job is a round trip
--                  ("Kms To and Fro" in the sheet) — planner toggle, default on
--   total charge = fuel cost + truck daily rate
--                  + (days beyond the first × extra-day rate)
--                  + extra charges + manual adjustment
--
-- The legacy default_cost_per_km / fixed_daily_cost columns are kept (old
-- journey_costs rows reference their snapshots) but are no longer used by
-- the costing engine.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── Trucks: per-truck pricing inputs ─────────────────────────────────────────
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS fuel_efficiency_km_per_l DECIMAL(5,2);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS daily_rate               DECIMAL(10,2) DEFAULT 0;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS extra_day_rate           DECIMAL(10,2) DEFAULT 0;

-- ── Journey costs: snapshot the new inputs alongside the legacy ones ─────────
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS fuel_efficiency_km_per_l DECIMAL(5,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS fuel_price_per_l         DECIMAL(8,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS billable_km              DECIMAL(10,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS fuel_cost                DECIMAL(12,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS daily_rate               DECIMAL(10,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS extra_day_rate           DECIMAL(10,2);
ALTER TABLE journey_costs ADD COLUMN IF NOT EXISTS round_trip               BOOLEAN DEFAULT TRUE;

-- ── Global fuel price (KES per litre) — editable from Settings → Pricing ─────
-- Addresses the long-standing client request for a fuel price input.
INSERT INTO site_settings (key, value, value_type, group_name, label)
VALUES ('fuel_price_per_litre', '200', 'number', 'pricing', 'Fuel price (KES per litre)')
ON CONFLICT (key) DO NOTHING;

COMMIT;
