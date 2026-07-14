// backend/src/routes/clientPortal.js
//
// Read (and light profile-edit) access for logged-in clients. Every query is
// scoped by req.user.client_id, which comes from the authenticated/DB-backed
// JWT session (see middleware/auth.js) — never from a request param/body.
// No SELECT * anywhere: explicit column lists keep internal-only fields
// (margin/cost data, staff assignment fields, QuickBooks IDs) out of client
// responses by construction.

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, clientOnly, auditLog } = require('../middleware/auth');
const { generateInvoicePDF } = require('../services/pdf');

const router = express.Router();
router.use(authenticate, clientOnly);

// Defence in depth: a client user should always carry a client_id, but don't
// trust that invariant blindly at the route layer.
router.use((req, res, next) => {
  if (!req.user.client_id) return res.status(403).json({ error: 'Account not linked to a client' });
  next();
});

// ─── Profile ────────────────────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  const { rows } = await query(
    'SELECT id, company_name, contact_name, email, phone, address, created_at FROM clients WHERE id = $1',
    [req.user.client_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Client not found' });
  res.json(rows[0]);
});

router.patch('/profile', [
  body('companyName').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 255 }),
  body('contactName').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('address').optional({ checkFalsy: true }).isString().isLength({ max: 500 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }

  const map = { companyName: 'company_name', contactName: 'contact_name', phone: 'phone', address: 'address' };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) {
      vals.push(req.body[k]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields supplied.' });

  vals.push(req.user.client_id);
  const { rows } = await query(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, company_name, contact_name, email, phone, address, created_at`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Client not found' });

  await auditLog(req.user.id, 'client.profile_updated', 'client', req.user.client_id, req.body, req.ip);
  res.json(rows[0]);
});

// ─── Quotes ─────────────────────────────────────────────────────────────────

const QUOTE_COLS = `id, reference, origin, destination, cargo_type, weight_tons,
  amount, status, valid_until, sent_at, responded_at, created_at`;

router.get('/quotes', async (req, res) => {
  const { rows } = await query(
    `SELECT ${QUOTE_COLS} FROM quotations WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.client_id]
  );
  res.json(rows);
});

router.get('/quotes/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT ${QUOTE_COLS} FROM quotations WHERE id = $1 AND client_id = $2`,
    [req.params.id, req.user.client_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  res.json(rows[0]);
});

// ─── Invoices ───────────────────────────────────────────────────────────────

const INVOICE_COLS = `id, reference, amount, tax_amount, total_amount, status,
  issue_date, due_date, paid_date, sent_at, kra_etr_code, notes`;

router.get('/invoices', async (req, res) => {
  const { rows } = await query(
    `SELECT ${INVOICE_COLS} FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.client_id]
  );
  res.json(rows);
});

router.get('/invoices/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT ${INVOICE_COLS} FROM invoices WHERE id = $1 AND client_id = $2`,
    [req.params.id, req.user.client_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

router.get('/invoices/:id/pdf', async (req, res) => {
  const { rows } = await query(
    `SELECT i.*, c.company_name, c.email AS client_email
       FROM invoices i JOIN clients c ON c.id = i.client_id
      WHERE i.id = $1 AND i.client_id = $2`,
    [req.params.id, req.user.client_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

  try {
    const pdfBuffer = await generateInvoicePDF(rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].reference}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Client invoice PDF error:', err);
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

// ─── Journeys ───────────────────────────────────────────────────────────────
// estimated_cost/final_cost and journey_costs/truck cost fields are
// deliberately excluded — those are Eleven Solutions' internal operating
// cost, not what the client is billed (that's invoices.amount).

const JOURNEY_COLS = `id, reference, origin, destination, cargo_type, cargo_weight_tons,
  status, scheduled_date, departure_time, arrival_time, distance_km, notes,
  truck_registration_snapshot AS truck, driver_name_snapshot AS driver`;

router.get('/journeys', async (req, res) => {
  const { rows } = await query(
    `SELECT ${JOURNEY_COLS} FROM journeys WHERE client_id = $1 ORDER BY scheduled_date DESC LIMIT 100`,
    [req.user.client_id]
  );
  res.json(rows);
});

router.get('/journeys/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT ${JOURNEY_COLS} FROM journeys WHERE id = $1 AND client_id = $2`,
    [req.params.id, req.user.client_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  res.json(rows[0]);
});

module.exports = router;
