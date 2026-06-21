-- Eleven Solutions Limited — PostgreSQL Schema
-- Run: psql -d eleven_solutions -f schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('super_admin', 'fleet_manager', 'finance', 'planner', 'driver');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'driver',
  totp_secret   VARCHAR(255),           -- NULL = 2FA not set up
  totp_enabled  BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLIENTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name    VARCHAR(255) NOT NULL,
  contact_name    VARCHAR(255),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  address         TEXT,
  quickbooks_id   VARCHAR(100),           -- QB customer ID after sync
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(email);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRUCKS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE truck_status AS ENUM ('available', 'scheduled', 'on_route', 'loading', 'maintenance');

CREATE TABLE trucks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration    VARCHAR(20) UNIQUE NOT NULL,   -- e.g. KDB 001G
  name            VARCHAR(50) NOT NULL,           -- e.g. Truck 01
  type            VARCHAR(100) NOT NULL,          -- e.g. 10T Flatbed
  capacity_tons   DECIMAL(5,2),
  year            INTEGER,
  status          truck_status DEFAULT 'available',
  odometer_km     INTEGER DEFAULT 0,
  driver_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- JOURNEYS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE journey_status AS ENUM ('scheduled', 'loading', 'in_transit', 'delivered', 'cancelled');

CREATE TABLE journeys (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference         VARCHAR(30) UNIQUE NOT NULL,   -- e.g. JRN-2026-001
  truck_id          UUID NOT NULL REFERENCES trucks(id),
  driver_id         UUID NOT NULL REFERENCES users(id),
  client_id         UUID REFERENCES clients(id),
  origin            VARCHAR(255) NOT NULL,
  destination       VARCHAR(255) NOT NULL,
  cargo_type        VARCHAR(100),
  cargo_weight_tons DECIMAL(6,2),
  status            journey_status DEFAULT 'scheduled',
  scheduled_date    DATE NOT NULL,
  departure_time    TIMESTAMPTZ,
  arrival_time      TIMESTAMPTZ,
  distance_km       INTEGER,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_journeys_truck ON journeys(truck_id);
CREATE INDEX idx_journeys_driver ON journeys(driver_id);
CREATE INDEX idx_journeys_date ON journeys(scheduled_date);
CREATE INDEX idx_journeys_status ON journeys(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- QUOTATIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE quote_status AS ENUM ('pending', 'sent', 'accepted', 'declined', 'expired');

CREATE TABLE quotations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference       VARCHAR(30) UNIQUE NOT NULL,   -- e.g. QT-041
  client_id       UUID REFERENCES clients(id),
  -- Inline fields for walk-in requests before client record created
  company_name    VARCHAR(255),
  contact_email   VARCHAR(255),
  origin          VARCHAR(255) NOT NULL,
  destination     VARCHAR(255) NOT NULL,
  cargo_type      VARCHAR(100),
  weight_tons     DECIMAL(6,2),
  notes           TEXT,
  amount          DECIMAL(12,2),               -- quoted price in KES
  status          quote_status DEFAULT 'pending',
  valid_until     DATE,
  sent_at         TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  journey_id      UUID REFERENCES journeys(id),  -- linked once accepted
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_status ON quotations(status);
CREATE INDEX idx_quotes_email ON quotations(contact_email);

-- ─────────────────────────────────────────────────────────────────────────────
-- INVOICES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference       VARCHAR(30) UNIQUE NOT NULL,   -- e.g. INV-2026-001
  client_id       UUID NOT NULL REFERENCES clients(id),
  journey_id      UUID REFERENCES journeys(id),
  amount          DECIMAL(12,2) NOT NULL,
  tax_amount      DECIMAL(12,2) DEFAULT 0,
  total_amount    DECIMAL(12,2) NOT NULL,
  status          invoice_status DEFAULT 'draft',
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,
  paid_date       DATE,
  quickbooks_id   VARCHAR(100),             -- QB invoice ID after sync
  sent_at         TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due ON invoices(due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,   -- e.g. 'invoice.sent', 'truck.status_changed'
  entity_type VARCHAR(50),             -- e.g. 'invoice', 'truck'
  entity_id   UUID,
  details     JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- QuickBooks TOKENS (stored per-company)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE quickbooks_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  realm_id        VARCHAR(100) NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','clients','trucks','journeys','quotations','invoices'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;
