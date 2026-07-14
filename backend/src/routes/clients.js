const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, allStaff, financeOrAdmin, requireRole, auditLog } = require('../middleware/auth');
const { sendClientInviteEmail } = require('../services/email');

const router = express.Router();
router.use(authenticate, allStaff);

// GET /api/clients — list with lifetime stats joined from client_summary view
router.get('/', async (req, res) => {
  const { q: search } = req.query;
  const params = [];
  let where = '';
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE company_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1`;
  }
  const { rows } = await query(
    `SELECT * FROM client_summary ${where} ORDER BY last_activity_at DESC NULLS LAST, company_name ASC LIMIT 500`,
    params
  );
  res.json(rows);
});

// GET /api/clients/:id — single client (basic info only)
router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Client not found' });
  res.json(rows[0]);
});

// GET /api/clients/:id/360 — the customer 360° view: profile + summary + all
// quotes, journeys, invoices for this client. One request, everything the
// detail page needs.
router.get('/:id/360', async (req, res) => {
  const id = req.params.id;
  const profileQ   = query('SELECT * FROM clients WHERE id = $1', [id]);
  const summaryQ   = query('SELECT * FROM client_summary WHERE id = $1', [id]);
  const quotesQ    = query(
    `SELECT id, reference, origin, destination, cargo_type, weight_tons, amount, status, created_at, valid_until, journey_id
       FROM quotations WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]);
  const journeysQ  = query(
    `SELECT j.id, j.reference, j.origin, j.destination, j.scheduled_date, j.status, j.estimated_cost, j.final_cost,
            j.truck_registration_snapshot AS truck, j.driver_name_snapshot AS driver,
            j.quotation_id, q.reference AS quote_reference
       FROM journeys j LEFT JOIN quotations q ON q.id = j.quotation_id
      WHERE j.client_id = $1 ORDER BY j.scheduled_date DESC LIMIT 100`, [id]);
  const invoicesQ  = query(
    `SELECT id, reference, amount, total_amount, status, due_date, created_at, journey_id
       FROM invoices WHERE client_id = $1 ORDER BY created_at DESC LIMIT 100`, [id]);

  const [profile, summary, quotes, journeys, invoices] = await Promise.all([profileQ, summaryQ, quotesQ, journeysQ, invoicesQ]);
  if (!profile.rows.length) return res.status(404).json({ error: 'Client not found' });

  res.json({
    profile:  profile.rows[0],
    summary:  summary.rows[0] || null,
    quotes:   quotes.rows,
    journeys: journeys.rows,
    invoices: invoices.rows,
  });
});

// POST /api/clients
router.post('/', financeOrAdmin, [
  body('companyName').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { companyName, contactName, email, phone, address } = req.body;
  try {
    const { rows } = await query(
      'INSERT INTO clients (company_name, contact_name, email, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [companyName, contactName, email, phone, address]
    );
    res.status(201).json(rows[0]);
  } catch(err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Client email already exists' });
    throw err;
  }
});

// PATCH /api/clients/:id
router.patch('/:id', financeOrAdmin, async (req, res) => {
  const fields = ['company_name','contact_name','email','phone','address'];
  const updates = {};
  fields.forEach(f => { const k = f.replace(/_([a-z])/g, g => g[1].toUpperCase()); if (req.body[k] !== undefined) updates[f] = req.body[k]; });
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });
  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  const { rows } = await query(
    `UPDATE clients SET ${setClauses} WHERE id = $${values.length} RETURNING *`, values
  );
  if (!rows.length) return res.status(404).json({ error: 'Client not found' });
  res.json(rows[0]);
});

// POST /api/clients/:id/invite — send (or resend) a client-portal invite.
// Narrower than the router-level allStaff (which also includes planner/driver).
router.post('/:id/invite', requireRole('super_admin', 'fleet_manager', 'finance'), async (req, res) => {
  const { rows } = await query('SELECT id, company_name, email FROM clients WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Client not found' });
  const client = rows[0];

  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 8);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await withTransaction(async (c) => {
      // Invalidate any prior unused invite for this client — doubles as "resend".
      await c.query('DELETE FROM client_invites WHERE client_id = $1', [client.id]);
      await c.query(
        `INSERT INTO client_invites (client_id, token_hash, invited_by, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [client.id, tokenHash, req.user.id, expiresAt]
      );
    });

    const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const setPasswordUrl = `${siteUrl}/account/set-password?token=${rawToken}`;
    await sendClientInviteEmail(client.email, client.company_name, setPasswordUrl);

    await auditLog(req.user.id, 'client.invited', 'client', client.id, { email: client.email }, req.ip);
    res.status(201).json({ message: 'Invite sent' });
  } catch (err) {
    console.error('Client invite error:', err);
    res.status(500).json({ error: 'Could not send invite.' });
  }
});

module.exports = router;
