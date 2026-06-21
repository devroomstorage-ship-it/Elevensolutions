-- ============================================================================
-- Eleven Solutions Limited — Migration 002
-- Fleet operations, driver profiles, route + costing, QuickBooks sync logs
--
-- Run: psql -d eleven_solutions -f migration_002_fleet_costing_maps_qb.sql
--
-- This migration is ADDITIVE. It does not drop or rename anything in the
-- existing schema.sql. It extends trucks, journeys, clients, quotations and
-- invoices, and adds new tables. It is safe to run once on top of the
-- current database. All statements use IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS so a partial re-run will not error.
-- ============================================================================

-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block on
-- PostgreSQL versions before 12, so it is executed first, outside BEGIN.
-- On PG 12+ this is harmless run standalone.
ALTER TYPE truck_status ADD VALUE IF NOT EXISTS 'inactive';

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. DRIVER PROFILES
--    Drivers already exist as rows in `users` with role = 'driver'. Rather
--    than create a parallel `drivers` table (which would break the existing
--    journeys.driver_id -> users(id) foreign key), we extend each driver
--    user with a 1:1 profile row that holds the licensing/contact data the
--    business needs.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone                VARCHAR(50),
  id_passport_number   VARCHAR(50),
  license_number       VARCHAR(50),
  license_expiry       DATE,
  driver_status        VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (driver_status IN ('active','inactive','suspended')),
  preferred_truck_id   UUID REFERENCES trucks(id) ON DELETE SET NULL,
  emergency_contact    VARCHAR(255),
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_pref_truck ON driver_profiles(preferred_truck_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_license_expiry ON driver_profiles(license_expiry);

-- ----------------------------------------------------------------------------
-- 2. TRUCKS — add costing, compliance and identification columns
-- ----------------------------------------------------------------------------

ALTER TABLE trucks ADD COLUMN IF NOT EXISTS make                VARCHAR(50);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS model               VARCHAR(50);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS fuel_type           VARCHAR(30);
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS insurance_expiry    DATE;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS inspection_expiry   DATE;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS default_cost_per_km DECIMAL(10,2) DEFAULT 0;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS fixed_daily_cost    DECIMAL(10,2) DEFAULT 0;

-- The business also wants an 'inactive' state for retired/sold trucks; the
-- truck_status enum value 'inactive' is added at the top of this file
-- (outside the transaction).

-- ----------------------------------------------------------------------------
-- 3. DRIVER <-> TRUCK ASSIGNMENT HISTORY
--    Tracks the "preferred/current" pairing over time. This is the long-lived
--    relationship between a driver and a truck. It is NOT where a journey's
--    historical pairing lives — that is frozen on the journey row itself
--    (see section 4). This table answers "who is the truck's current keeper"
--    and "what has the assignment history been".
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS driver_truck_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  truck_id      UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,                         -- NULL = currently active
  assigned_by   UUID REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dta_driver ON driver_truck_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_dta_truck  ON driver_truck_assignments(truck_id);
-- At most one active (open) assignment per truck:
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dta_active_truck
  ON driver_truck_assignments(truck_id)
  WHERE unassigned_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. JOURNEYS — coordinates, route data, scheduled/actual times, cost summary
--    IMPORTANT historical-integrity note:
--    journeys.truck_id and journeys.driver_id already store the truck and
--    driver used for that ride and are never rewritten when a driver later
--    changes trucks. To make that guarantee explicit and human-readable on
--    old records, we also snapshot the registration and driver name at
--    creation time. Old journey rows therefore always show the correct
--    historical driver-truck pairing even if the live records change.
-- ----------------------------------------------------------------------------

ALTER TABLE journeys ADD COLUMN IF NOT EXISTS pickup_lat            DECIMAL(10,7);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS pickup_lng            DECIMAL(10,7);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS dropoff_lat           DECIMAL(10,7);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS dropoff_lng           DECIMAL(10,7);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS scheduled_pickup_at   TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS actual_pickup_at      TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS scheduled_delivery_at TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS actual_delivery_at    TIMESTAMPTZ;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS estimated_duration_min INTEGER;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS route_summary         TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS route_polyline        TEXT;     -- encoded Google polyline for map redraw
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS estimated_cost        DECIMAL(12,2);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS final_cost            DECIMAL(12,2);

-- Historical snapshots (frozen at creation, never updated):
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS truck_registration_snapshot VARCHAR(20);
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS driver_name_snapshot        VARCHAR(255);

-- ----------------------------------------------------------------------------
-- 5. JOURNEY COSTS — full, auditable cost breakdown (1:1 with a journey)
--    Kept in its own table so the journeys row stays lean and so every input
--    to the cost calculation is stored, not just the final number.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS journey_costs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id         UUID NOT NULL UNIQUE REFERENCES journeys(id) ON DELETE CASCADE,
  distance_km        DECIMAL(10,2),
  cost_per_km        DECIMAL(10,2),      -- copied from truck at calc time
  fixed_daily_cost   DECIMAL(10,2),      -- copied from truck at calc time
  days               INTEGER DEFAULT 1,
  extra_charges      DECIMAL(12,2) DEFAULT 0,   -- tolls, escort, special handling
  manual_adjustment  DECIMAL(12,2) DEFAULT 0,   -- admin +/- override
  estimated_cost     DECIMAL(12,2),             -- computed total before approval
  final_cost         DECIMAL(12,2),             -- approved total
  route_type         VARCHAR(50),               -- e.g. tarmac, mixed, off-road
  calculated_by      UUID REFERENCES users(id),
  approved_by        UUID REFERENCES users(id),
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_costs_journey ON journey_costs(journey_id);

-- ----------------------------------------------------------------------------
-- 6. CLIENTS / QUOTATIONS / INVOICES — QuickBooks reference + sync state
--    clients.quickbooks_id and invoices.quickbooks_id already exist.
--    We add an estimate ID to quotations and a lightweight sync-state column
--    to each syncable entity so the UI can show a per-record badge.
-- ----------------------------------------------------------------------------

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quickbooks_estimate_id VARCHAR(100);

ALTER TABLE clients    ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'not_synced'
                          CHECK (qb_sync_status IN ('not_synced','synced','error'));
ALTER TABLE clients    ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

ALTER TABLE invoices   ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'not_synced'
                          CHECK (qb_sync_status IN ('not_synced','synced','error'));
ALTER TABLE invoices   ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS qb_sync_status VARCHAR(20) DEFAULT 'not_synced'
                          CHECK (qb_sync_status IN ('not_synced','synced','error'));
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS qb_last_synced_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 7. QUICKBOOKS SYNC LOGS — one row per sync attempt, success or failure
--    Drives the "failed syncs / retry" panel on the Finance page.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quickbooks_sync_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type   VARCHAR(30) NOT NULL,   -- 'customer' | 'estimate' | 'invoice' | 'payment'
  entity_id     UUID NOT NULL,          -- our local clients/quotations/invoices id
  qb_id         VARCHAR(100),           -- the resulting QuickBooks object id, if any
  direction     VARCHAR(10) NOT NULL DEFAULT 'push'  CHECK (direction IN ('push','pull')),
  status        VARCHAR(10) NOT NULL                 CHECK (status IN ('success','error')),
  attempt       INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  triggered_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_logs_entity  ON quickbooks_sync_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_qb_logs_status  ON quickbooks_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_qb_logs_created ON quickbooks_sync_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. GOOGLE ROUTE CACHE — avoid paying for the same origin/destination twice
--    Google Distance Matrix / Routes calls cost money per request. Cache the
--    result keyed by a hash of the rounded coordinates so repeated quotes on
--    the same lane are free.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_route_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key       VARCHAR(120) UNIQUE NOT NULL,   -- hash of rounded coords + mode
  origin_lat      DECIMAL(10,7),
  origin_lng      DECIMAL(10,7),
  dest_lat        DECIMAL(10,7),
  dest_lng        DECIMAL(10,7),
  distance_km     DECIMAL(10,2),
  duration_min    INTEGER,
  route_summary   TEXT,
  route_polyline  TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_route_cache_key ON google_route_cache(cache_key);

-- ----------------------------------------------------------------------------
-- 9. updated_at triggers for the new tables that need them
--    (reuses the existing update_updated_at() function from schema.sql)
-- ----------------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['driver_profiles','journey_costs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = format('trg_%s_updated', t)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
        t, t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 10. REPORTING VIEW — per-truck profitability
--     Powers the truck detail page and the Finance "revenue by truck" panel.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW truck_profitability AS
SELECT
  t.id                                   AS truck_id,
  t.registration,
  t.name,
  COUNT(j.id)                            AS total_journeys,
  COALESCE(SUM(j.distance_km), 0)        AS total_distance_km,
  COALESCE(SUM(inv.total_amount), 0)     AS total_revenue,
  COALESCE(SUM(jc.final_cost), 0)        AS total_cost,
  COALESCE(SUM(inv.total_amount), 0)
    - COALESCE(SUM(jc.final_cost), 0)    AS profit
FROM trucks t
LEFT JOIN journeys j       ON j.truck_id = t.id AND j.status = 'delivered'
LEFT JOIN journey_costs jc ON jc.journey_id = j.id
LEFT JOIN invoices inv     ON inv.journey_id = j.id AND inv.status = 'paid'
GROUP BY t.id, t.registration, t.name;

COMMIT;

-- ============================================================================
-- Backfill (run once, AFTER the migration commits, only if you want existing
-- journeys to carry their historical snapshots). Optional.
-- ============================================================================
-- UPDATE journeys j
-- SET truck_registration_snapshot = t.registration,
--     driver_name_snapshot        = u.full_name
-- FROM trucks t, users u
-- WHERE j.truck_id = t.id AND j.driver_id = u.id
--   AND j.truck_registration_snapshot IS NULL;
