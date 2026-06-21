-- Eleven Solutions Limited — Seed Data (development only)
-- Run: psql -d eleven_solutions -f seed.sql

-- ─── Admin user (password: Admin@1234) ───────────────────────────────────────
INSERT INTO users (email, password_hash, full_name, role) VALUES
  ('admin@elevensolutions.co.ke', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.Ue5E3rC6VNLzu', 'System Administrator', 'super_admin'),
  ('fleet@elevensolutions.co.ke', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.Ue5E3rC6VNLzu', 'Fleet Manager', 'fleet_manager'),
  ('finance@elevensolutions.co.ke', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.Ue5E3rC6VNLzu', 'Finance Officer', 'finance'),
  ('james.mwangi@elevensolutions.co.ke', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.Ue5E3rC6VNLzu', 'James Mwangi', 'driver'),
  ('peter.ochieng@elevensolutions.co.ke', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhcanFp8.Ue5E3rC6VNLzu', 'Peter Ochieng', 'driver');

-- ─── Trucks ──────────────────────────────────────────────────────────────────
INSERT INTO trucks (registration, name, type, capacity_tons, year, status, odometer_km) VALUES
  ('KDB 001G', 'Truck 01', '10T Flatbed',    10,  2019, 'on_route',    142380),
  ('KDB 002G', 'Truck 02', '5T Box',          5,  2020, 'available',    98450),
  ('KDB 003G', 'Truck 03', '10T Flatbed',    10,  2019, 'on_route',    203110),
  ('KDB 004G', 'Truck 04', '20T Lowbed',     20,  2018, 'maintenance', 312050),
  ('KDB 005G', 'Truck 05', '5T Refrigerated', 5,  2021, 'available',    77200),
  ('KDB 006G', 'Truck 06', '10T Flatbed',    10,  2020, 'on_route',    156700),
  ('KDB 007G', 'Truck 07', '10T Box',        10,  2021, 'available',    89300),
  ('KDB 008G', 'Truck 08', '20T Lowbed',     20,  2018, 'on_route',    267400),
  ('KDB 009G', 'Truck 09', '5T Box',          5,  2022, 'available',    54100),
  ('KDB 010G', 'Truck 10', '10T Flatbed',    10,  2020, 'on_route',    178900),
  ('KDB 011G', 'Truck 11', '10T Box',        10,  2021, 'available',   121500),
  ('KDB 012G', 'Truck 12', '5T Flatbed',      5,  2022, 'on_route',     93800),
  ('KDB 013G', 'Truck 13', '20T Lowbed',     20,  2017, 'maintenance', 389200);

-- ─── Clients ─────────────────────────────────────────────────────────────────
INSERT INTO clients (company_name, contact_name, email, phone) VALUES
  ('Bamburi Cement', 'HR Department', 'hr@bamburi.co.ke', '+254 711 000 001'),
  ('Bidco Africa', 'Logistics Team', 'logistics@bidco.com', '+254 711 000 002'),
  ('Safaricom PLC', 'Supply Chain', 'supply@safaricom.ke', '+254 722 000 003'),
  ('EABL', 'Orders Department', 'orders@eabl.com', '+254 733 000 004'),
  ('Nation Media Group', 'Procurement', 'procurement@nation.co.ke', '+254 711 000 005');
