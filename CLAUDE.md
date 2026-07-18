# Eleven Solutions Limited — Logistics Platform

## What this is

Client: Eleven Solutions Limited — a Kenyan trucking/freight logistics company,
based in Ruiru. Runs ~13 trucks doing cross-border corporate freight (Mombasa,
Nairobi, Kampala, Kigali, DRC routes).

Two-part platform:
1. **Public website** (elevensolutions.co.ke) — browse services, check fleet
   availability, submit quote requests.
2. **Internal portal** — operational core. Staff manage clients, quotes, trucks,
   drivers, journeys, invoices, KRA eTIMS submissions.

Deployed on Render (free tier) via Docker Compose (frontend, backend, postgres).
GitHub repo, auto-deploys on push to `main`.

Contract: KES 250,000, paid in 3 instalments (signing / mid-review / go-live).
Original scope 8 weeks.

## Tech stack

**Frontend** (`frontend/`)
- Next.js 14, App Router, `"use client"` for interactive pages
- TailwindCSS (core utilities only, no `@apply` outside base)
- `js-cookie` for auth token storage
- Docker standalone build (`next.config.js` needs `output: 'standalone'`;
  `postcss.config.js` is required for Tailwind to work inside Docker)

**Backend** (`backend/`)
- Node 20 (`node:20-alpine` in the Dockerfile)
- Express.js, no ORM — raw SQL via `pg`, parameterised queries throughout
- `express-validator` for input validation, `express-rate-limit` on public endpoints
- `bcryptjs` (cost 12) for passwords, `jsonwebtoken` for JWT access+refresh
- `nodemailer` for SMTP email (see Email section)
- `pdfkit` for PDF generation — **not Puppeteer**, see PDF section
- Custom middleware in `middleware/auth.js`, custom audit log on every write

**Database**
- PostgreSQL 16. Migrations run automatically on backend startup via `src/db/migrate.js`
- Schema-first: `backend/src/db/schema.sql` is the base; `migration_NNN_*.sql` files are additive, run alphabetically after schema.sql

## Repo structure

```
/
├── docker-compose.yml          3 services: frontend, backend, postgres
├── backend/
│   ├── Dockerfile
│   └── src/
│       ├── index.js            entry point, route registration, IPv4 DNS fix
│       ├── db.js                pg pool + query() + withTransaction()
│       ├── db/
│       │   ├── migrate.js       runs schema.sql, then migration_*.sql alphabetically
│       │   ├── schema.sql
│       │   └── migration_002..011_*.sql
│       ├── middleware/auth.js   authenticate, role guards, auditLog
│       ├── routes/
│       │   auth, public, users, drivers, trucks, clients, quotes,
│       │   journeys, invoices, assignments, content, emailSettings,
│       │   analytics, quickbooks, dashboard,
│       │   clientAuth (invite verify/accept, unauth), clientPortal (client-scoped reads)
│       └── services/
│           email.js (nodemailer, config from site_settings)
│           pdf.js (pdfkit quote/invoice PDFs)
│           phone.js (normalizeKenyanPhone)
│           maps.js, sms.js, costing.js
└── frontend/
    ├── Dockerfile
    ├── lib/
    │   ├── api.js               auth-aware fetch wrapper, refresh-token handling (shared
    │   │                        by staff /portal and client /account — see auth model)
    │   └── constants.js         CARGO_TYPES, normalizeKenyanPhone
    ├── components/admin/        Sidebar, AssignmentHistory, PlacesAutocomplete
    ├── components/account/      ClientShell (client-portal nav, separate from Sidebar)
    ├── components/site/         QuoteForm
    └── app/
        ├── page.js, services/, coverage/, track/, contact/   public pages
        ├── portal/    (staff — role in super_admin/fleet_manager/finance/planner/driver)
        │   login, dashboard, drivers[+[id]], fleet[+[id]], clients[+[id]] (360° view,
        │   incl. "Invite to customer portal"), quotes (workbench), schedule, journeys,
        │   invoices[+[id]] (KRA ETR editor), content (CMS editor), settings[+email],
        │   finance, users, quickbooks
        └── account/   (clients — role='client', staff-invited only, see auth model)
            login, set-password (invite accept), dashboard, quotes[+[id]],
            invoices[+[id]] (read-only kra_etr_code, no edit), journeys[+[id]], profile
```

## Database schema (as of migration 011)

Migrations 007 and 008 were written by a different developer. The section below was
**verified directly against the live dev database** via `\d <table>` and the enum
query below (not reconstructed from the original client briefing, which had drifted
in several places — see the callouts marked ⚠️). Re-verify before trusting blindly
if the DB has moved on since:

```sql
SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT t.typname AS enum_name, e.enumlabel AS enum_value
FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
ORDER BY t.typname, e.enumsortorder;
```

**Core tables:**

- `users` — id, email UNIQUE, password_hash, full_name, role, totp_secret, totp_enabled,
  is_active, last_login, created_at, updated_at, `client_id` (nullable FK → clients,
  added migration 011, only set for role='client').
  ⚠️ **`users` has NO `phone` column** — despite what schema.sql's inline comment on
  `drivers.js` implies, phone lives on `driver_profiles` instead. A query/insert
  against `u.phone` throws `column u.phone does not exist` (Postgres error code
  42703), and if unwrapped in a try/catch this is an **unhandled promise rejection
  that crashes the entire Node process** (Node 15+ terminates by default) — this bit
  `GET /api/drivers` for real, taking down the whole API for every user until fixed.
  `role` enum: `super_admin, fleet_manager, finance, planner, driver, client`
- `refresh_tokens` — id, user_id FK, token_hash, expires_at
- `driver_profiles` — 1:1 with users where role='driver'. user_id PK/FK, **phone**,
  driver_status, id_passport_number, license_number, license_expiry,
  preferred_truck_id FK, emergency_contact, notes.
  ⚠️ `driver_status` is **not a Postgres enum** — it's `VARCHAR(20)` with a CHECK
  constraint: `active, inactive, suspended` (not `on_leave`, which doesn't exist here).
- `client_invites` — added migration 011. id, client_id FK, token_hash (bcrypt hash
  of a `crypto.randomBytes(32)` token, raw token never stored), invited_by FK,
  expires_at, used_at (NULL = still live), created_at. Issuing a new invite deletes
  any prior unused row for the same client (app logic, not a DB constraint).
- `audit_log` — id, user_id FK, action, entity_type, entity_id, details JSONB, ip_address, created_at

**Fleet:**
- `trucks` — registration UNIQUE, name, type, capacity_tons, year, make, model,
  fuel_type, driver_id FK (current keeper, soft ref), status, odometer_km,
  insurance_expiry, inspection_expiry, notes, plus the **fuel-based pricing inputs**
  (migration 012): `fuel_efficiency_km_per_l`, `daily_rate`, `extra_day_rate`.
  ⚠️ `default_cost_per_km` / `fixed_daily_cost` still exist but are **legacy** —
  the costing engine no longer reads them (see Costing model section).
  `status` enum: `available, scheduled, on_route, loading, maintenance, inactive`.
  **The real fleet is loaded** (migration 013, from the client's roster): 13 trucks —
  six 18T, six 12T, one 7T — each with its real driver assigned. The 13 seed
  placeholders (KDB 001G–013G) are `status='inactive'`, kept for history.
- `driver_truck_assignments` — driver_id FK, truck_id FK, assigned_at, unassigned_at
  (NULL = active), assigned_by FK, notes. **Partial unique index on `(truck_id) WHERE
  unassigned_at IS NULL`** — enforces at most one active assignment per truck, race-safe.

**Customers & work:**
- `clients` — company_name, contact_name, email UNIQUE, phone, address, quickbooks_id,
  created_at.
- `quotations` — reference UNIQUE (QT-001), client_id FK, company_name (denorm for
  walk-ins), contact_email, contact_phone, requested_pickup_date, origin, destination,
  cargo_type, weight_tons, amount, status, valid_until, sent_at, responded_at,
  assigned_to FK, internal_notes JSONB (array of `{author_id, author_name, body, ts}`),
  journey_id FK, notes.
  `status` enum: `pending, sent, accepted, declined, expired` — **not `received`**,
  that was a bug that caused 500s.
- `journeys` — reference UNIQUE (J-001), client_id FK, quotation_id FK, truck_id FK,
  driver_id FK (both NOT NULL), origin, destination, cargo_type, cargo_weight_tons,
  scheduled_date, departure_time, arrival_time, status, estimated_cost, final_cost,
  distance_km, truck_registration_snapshot, driver_name_snapshot (preserve history),
  created_by FK, notes. Detail views also join `journey_costs` (fuel + rate snapshot
  columns from migration 012, plus legacy cost_per_km/fixed_daily_cost on old rows,
  extra_charges, manual_adjustment) — internal margin data, never expose to a
  client-facing endpoint.
  `status` enum: `scheduled, loading, in_transit, delivered, cancelled`
- `invoices` — reference UNIQUE (INV-001), client_id FK, journey_id FK, amount,
  tax_amount, total_amount, status, issue_date, due_date, paid_date, sent_at,
  `kra_etr_code VARCHAR(64)` nullable (migration 010), quickbooks_id, notes, created_by.
  ⚠️ `status` enum: `draft, sent, paid, overdue, cancelled` — **not `pending`**. Some
  older frontend/PDF code assumes a `pending` status exists (e.g. a `STATUS_OPTIONS`
  list with `{value:'pending', label:'Pending'}`); that value will never actually
  occur on a real row — new invoices default to `draft`.

**CMS/settings:**
- `site_settings` — key/value store. Known keys: `email_primary`, `email_secondary`,
  `email_from_address`, `email_from_name`, `email_reply_to`,
  `email_from_quotes` / `_invoices` / `_ack`, `email_smtp_host`, `email_smtp_port`,
  `email_smtp_user`, `email_smtp_pass`, and `fuel_price_per_litre` (group `pricing`,
  edited at Settings → Pricing, read by the costing engine).
  ⚠️ The public `GET /api/content/site` payload **must keep excluding** the four
  `email_smtp_*` keys and the `pricing` group — it used to return the SMTP password
  to the public internet until that WHERE clause was added (fixed alongside mig 012).
- `site_sections`, `site_services`, `service_areas`, `site_testimonials` — public site content

**Views:**
- `client_summary` — id, company_name, email, phone, address, created_at, quote_count,
  journey_count, invoice_count, lifetime_revenue_paid, outstanding_balance, last_activity_at
- `truck_profitability` — truck_id, revenue, costs, profit, journey_count, ...

**Integrations:** `google_route_cache` (Maps distance/duration cache), `quickbooks_tokens`,
`quickbooks_sync_logs`.

## Authentication model

- JWT access token (~15min) sent as `Bearer` in `Authorization`
- JWT refresh token (7 days), stored hashed in DB + HTTP-only cookie
- On `401` with `code: TOKEN_EXPIRED`, frontend `lib/api.js` auto-refreshes; on
  refresh failure, redirects back to whichever login page matches the current path
  (`/account/login` under `/account/*`, `/portal/login` everywhere else — staff and
  clients share this one fetch wrapper and cookie pair)
- Clients (role='client') log in through the *same* generic `POST /api/auth/login` as
  staff — there's no separate client login endpoint. What differs is only the
  frontend page (`/account/login` vs `/portal/login`) and the role-gated routes each
  session can reach afterward.

Middleware (`backend/src/middleware/auth.js`) — verified against the actual file:

| Name | Roles allowed |
|---|---|
| `authenticate` | validates JWT, attaches `req.user` (includes `client_id`, `null` for staff) |
| `allStaff` | `super_admin, fleet_manager, finance, planner, driver` — **includes drivers**, despite the name |
| `plannerOrAbove` | `super_admin, fleet_manager, planner` |
| `fleetOrAbove` | `super_admin, fleet_manager` |
| `financeOrAdmin` | `super_admin, finance` |
| `adminOnly` | `super_admin` only |
| `clientOnly` | `client` only. Deliberately never added to any guard above — role allow-lists mean a client session is excluded from every staff route by construction. |

Every `client-portal` route scopes its query by `req.user.client_id` from the
verified session — never by a client-supplied id/param. Detail routes (`GET
/quotes/:id` etc.) return an identical 404 whether the row doesn't exist or belongs
to a different client, so a client can't distinguish "not found" from "not yours."

`auditLog(userId, action, entityType, entityId, details, ip)` — call after every
state-changing operation.

**Validation error shape (newer routes):** `400 { error: "Human message.", field: "which" }`.
Some older routes still return `{ errors: [...] }` — inconsistency, not yet cleaned up.

## Email

Nodemailer (not SendGrid). SMTP config lives in `site_settings` so admins can change
host/user/password from the portal without a redeploy (defaults: host
`smtp.gmail.com`, port `465`, try `587` if `465` is blocked).

**Render gotcha:** Render's free tier has had issues with outbound SMTP to Gmail
(suspected IPv6/port blocking). `backend/src/index.js` already applies the
strong fix — `dns.setDefaultResultOrder('ipv4first')` plus a patched `dns.lookup`
forcing `family: 4` — at the very top of the file, before other requires. If SMTP
is still blocked entirely on the free tier, fallback plan is Brevo's HTTPS API
(300 emails/day free) instead of SMTP, which would mean rewriting `services/email.js`.

## PDFs

`pdfkit` (pure JS, no browser needed) — **not Puppeteer**. Migrated away from
Puppeteer because Chrome doesn't install cleanly on Render free tier (RAM limits)
or reliably on Windows dev machines.

⚠️ **Drift found:** `backend/Dockerfile` still installs Chromium and sets
`PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` / `PUPPETEER_EXECUTABLE_PATH` env vars, and
`backend/package.json` has no `puppeteer` dependency at all. This is dead weight
bloating the Docker image — worth removing, but hasn't been done yet.

`backend/src/services/pdf.js`:
- `generateQuotePDF(quote)` → Buffer
- `generateInvoicePDF(invoice)` → Buffer — has diagonal watermark + KRA ETR row

**Watermark gotcha:** pdfkit's `text()` with `align: 'center'`, or without
`{ lineBreak: false, height: 2000 }`, causes phantom page breaks. If touching the
invoice PDF, keep those options on every `text()` call; use `buildFooter`'s manual
`widthOfString` centering instead of `align: 'center'`.

## Costing model (fuel-based — the client's real formula)

Since migration 012 the costing engine (`backend/src/services/costing.js`, pure
function) implements the pricing model from the client's own Truck Costing sheet —
**not** per-km pricing:

```
billable_km    = distance_km × 2 when round trip (planner toggle, default ON)
fuel_cost      = billable_km ÷ truck.fuel_efficiency_km_per_l × fuel_price_per_litre
daily_cost     = truck.daily_rate + (days − 1) × truck.extra_day_rate
estimated_cost = fuel_cost + daily_cost + extra_charges + manual_adjustment
```

- Fuel price is global: `site_settings.fuel_price_per_litre` (default 200 KES/L),
  edited at **Settings → Pricing**, served to staff via `GET /api/content/pricing`.
  `POST /journeys/:id/calculate-cost` reads it server-side — never trust a
  client-supplied fuel price.
- Real rates (per the client's sheet): 18T → 2 km/L, 16,000/day, 7,000/extra day;
  12T → 4 km/L, 9,000/day, 5,000/extra day; the one 7T runs 10T rates
  (4 km/L, 7,000/day, 3,000/extra day) **pending client confirmation** — flagged
  in that truck's notes.
- `calculate-cost` 400s if the truck has no `fuel_efficiency_km_per_l` — a truck
  must have rates before it can be priced.
- Old `journey_costs` rows have NULL fuel columns; the journey detail page falls
  back to the legacy per-km breakdown display for those rows.
- Verification anchor: 18T, 50 km one-way, round trip, 1 day must equal exactly
  **KES 26,000** (10,000 fuel + 16,000 day rate) — the sheet's own example.

Journey planner extras (same era): the journey detail page can **generate a
quotation** from a costed journey (`POST /journeys/:id/generate-quotation`,
plannerOrAbove, one per journey, status='accepted') and **generate an invoice**
(reuses `POST /invoices`, financeOrAdmin, amount prefilled from final/estimated
cost). Role split is enforced on both ends — planner can't invoice, finance
can't generate quotes.

## Hosting move (planned): GoDaddy VPS

`GODADDY_PRODUCTION_GUIDE.txt` at the repo root covers the client's planned move
off Render: needs a self-managed VPS (shared hosting can't run Docker), Postgres
stays as the compose container on VPS disk (data is tiny; nightly pg_dump +
off-server copy becomes our job), secrets go in a server-side `.env` (never
committed), and migration_013's PII should be gutted from the file (not history)
once applied everywhere. 2FA recommendation: finish the already-scaffolded TOTP
flow — no third-party service needed.

## Render gotchas

- 512MB RAM per service (free tier)
- Services sleep after 15 min idle — first request after sleep is slow
- No Shell access on free tier — add a temporary diagnostic endpoint if you need
  to run one-off commands/queries
- Free Postgres is **deleted after 90 days** — back up or upgrade before that
- Docker image cache can serve stale code — use `--no-cache` (or bump something
  in `package.json`) when rebuilding after a dependency change, or use
  "Clear build cache & deploy" in the Render UI
- Deploy flow: `git push` → Render builds → deploys, ~2–3 min end to end

## Input validation pattern

Every write endpoint uses `express-validator` with `.withMessage()` for humans:

```js
router.post('/', fleetOrAbove, [
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Enter a valid email.'),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('capacityTons').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('year').optional({ checkFalsy: true }).isInt({ min: 1980, max: 2100 }),
  body('licenseExpiry').optional({ checkFalsy: true }).isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }
  // ...business logic
});
```

Kenyan phone validation: `normalizeKenyanPhone` from `services/phone.js` returns
`+254717900400` format or `null`.

Common validators: `.isEmail().normalizeEmail()` (always chain both), `.isUUID()`
for FKs, `.isFloat({ min: 0 })` for money/weights, `.isInt({ min: 0 })` for
counts/km, `.isIn([...])` for enum-like fields, `.isISO8601()` for dates,
`.trim().notEmpty()` for required strings, `.optional({ checkFalsy: true })` for
optional non-empty, `.optional({ nullable: true })` for genuinely nullable.

## Known bugs / open threads

**Recently fixed** (worth confirming still deployed if debugging nearby code):
- Truck "Add Truck" button missing `onClick`
- Puppeteer "Chrome not found" error on send-quote — replaced with pdfkit
- Driver POST 400 with unhelpful error — validators now give human messages
- Quote submission 500 from `quote_status = 'received'` — fixed to `'pending'`
- PDF invoice generating 3 pages instead of 1 — fixed watermark logic
- **`GET /api/drivers` crashed the entire backend process** (unhandled rejection
  from `column u.phone does not exist` — `phone` lives on `driver_profiles`, not
  `users`) — fixed in `drivers.js`, and `GET /` / `GET /:id` now catch query errors
  instead of letting them crash the process. This had been silently latent because
  nothing in the UI linked to the truck detail page (which calls `GET /drivers` for
  the driver-assignment dropdown) until that link was added.
- Driver `driverStatus` validator/dropdown allowed `on_leave`, which doesn't exist —
  the live CHECK constraint on `driver_profiles.driver_status` is
  `active/inactive/suspended`. Fixed in `drivers.js` validators and
  `drivers/[id]/page.js`'s `STATUS_OPTIONS`.
- Invoice PDF download buttons (`window.open('/api/.../pdf')`) couldn't work at all —
  no rewrite to the backend and no way to attach the `Authorization` header on a bare
  navigation. Now fetched as a blob with the header, then opened as an object URL.
- `lib/api.js` hardcoded `/portal/login` as the session-expiry redirect — bounced
  expired client sessions to the staff login page. Now path-aware.

**Still open:**
- Email on Render free tier — SMTP may be blocked entirely; Brevo HTTPS API is the fallback plan
- Migration 007 & 008 contents are inferred, not confirmed (written by another developer)
- No 2FA on staff login (`users.totp_secret` column exists; auth flow not built) —
  explicitly deferred, not yet approved to build
- No real-time truck tracking / driver GPS (deferred — needs a design conversation
  about driver phones, data plans, cell coverage)
- Backend `Dockerfile` still installs Chromium/Puppeteer env vars for a PDF
  approach that's no longer used (see PDF section)
- No staff-side UI to resend/manage a client invite beyond re-triggering
  `POST /clients/:id/invite` (which silently replaces any unused prior invite)
- No email verification/change flow for client accounts — email is fixed at
  invite time, staff-only to change (would need to go through `clients.js`, not
  `client-portal`, since clients can't edit their own email)

**Client feedback still to address:**
- ~~Fuel price input~~ — **done**: Settings → Pricing edits
  `site_settings.fuel_price_per_litre`, consumed by the fuel-based costing engine
- Google Maps preview on origin/destination fields
- Quotation → journey planner autofill (note the *reverse* now exists — a journey
  can generate its quotation/invoice from the journey detail page)
- "Input validation + integrate a third party" — ambiguous, needs clarification
  from the client on which third party and for what purpose before building anything
- 7T truck (KCG 408X) runs 10T rates as a placeholder — get the real 7T rates
  from the client
- David Gichuki's roster phone (`+25474060790`) looks one digit short — confirm
  and fix on his driver profile

## Company details (used throughout code — don't change without asking)

- Legal name: Eleven Solutions Limited
- Address: P.O. Box 1977-0203, Ruiru, Kenya
- Phone: 0717900400, 0711900400, 0716900400
- Email: info@elevensolutions.co.ke, elevensolutionltd@gmail.com
- Brand colors: `#0F1E2E` (plum/navy) + `#E8620A` (orange accent). Watermark uses
  plum at 5% opacity.
- Fleet size: ~13 trucks. Routes: Kenya → Uganda → DRC.
- Currency: KES. Locale: `en-KE` for money, `en-GB` for dates (day/month/year).

## Testing discipline

Before shipping any change:

- **Backend:** `node --check backend/src/routes/YOUR_FILE.js`, or run the backend
  locally and hit the endpoint with curl
- **Frontend:** `cd frontend && npm run build` — must complete without errors
- **Database:** every schema change goes in a *new* migration file, never edit
  old ones; migrations must be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`);
  test against a copy of production data if possible
- **Deploy:** commit with a clear message → push to `main` → watch Render deploy
  logs → hit the changed endpoint/page in a browser. New npm dependency → force a
  fresh Docker build (`--no-cache` or bump something in `package.json`, or "Clear
  build cache & deploy" in Render UI)

One feature per commit, one commit per push — if something breaks, it's clear what did it.

## Roles (who uses what)

- `super_admin` — Owner. Sees everything.
- `finance` — Accounts/billing. Invoices, quotes, revenue.
- `fleet_manager` — Fleet ops. Trucks, drivers, assignments.
- `planner` — Schedules journeys, converts quotes to bookings.
- `driver` — Very limited access; own journeys, status updates. Eventually GPS from a phone.

## What to confirm before doing work

- A new integration (SMS, payment, maps, KRA API) → confirm which provider
- Client-facing content/copy → verify Ruiru address, real phone numbers against the
  Company Details section above
- A new user role/permission → confirm which existing roles can access it
- Schema changes → get sign-off before writing the migration
- Anything about email → read the Email section, this is a minefield
- Anything about PDFs → read the PDF section, the watermark is fragile
- Ambiguous asks (e.g. "input validation + integrate a third party") → ask for
  one sentence of clarification before building; it prevents building the wrong thing

## Useful snippets

**New migration** — `backend/src/db/migration_NNN_short_name.sql`:

```sql
BEGIN;
ALTER TABLE some_table ADD COLUMN IF NOT EXISTS new_col VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_some_table_new_col ON some_table (new_col) WHERE new_col IS NOT NULL;
COMMIT;
```

`migrate.js` runs `schema.sql` first, then all `migration_*.sql` alphabetically.

**New backend route:**
1. Create `backend/src/routes/newthing.js`
2. Register in `backend/src/index.js`:
   ```js
   const newthingRoutes = require('./routes/newthing');
   app.use('/api/newthing', newthingRoutes);
   ```
3. Standard structure:
   ```js
   const express = require('express');
   const { body, validationResult } = require('express-validator');
   const { query, withTransaction } = require('../db');
   const { authenticate, allStaff, auditLog } = require('../middleware/auth');
   const router = express.Router();
   router.use(authenticate);
   router.get('/', allStaff, async (req, res) => { ... });
   module.exports = router;
   ```

**New portal page** — `frontend/app/portal/newthing/page.js`:

```jsx
'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

export default function NewthingPage() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">New Thing</h1>
        </div>
        <div className="p-6">...content...</div>
      </main>
    </div>
  );
}
```

Add the link to `frontend/components/admin/Sidebar.jsx`.
