const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { normalizeKenyanPhone } = require('../services/phone');

const router = express.Router();

// Stricter rate limit for public form submissions
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                      // Max 5 quote requests per IP per hour
  message: { error: 'Too many requests. Please try again later.' },
});

// POST /api/public/quote — submitted from the client website
router.post('/quote', formLimiter, [
  body('companyName').notEmpty().trim().escape().isLength({ max: 255 }),
  body('contactEmail').isEmail().normalizeEmail(),
  body('contactPhone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('origin').notEmpty().trim().escape().isLength({ max: 255 }),
  body('destination').notEmpty().trim().escape().isLength({ max: 255 }),
  body('cargoType').optional().trim().escape(),
  body('weightTons').optional({ checkFalsy: true }).isFloat({ min: 0, max: 999 }),
  body('notes').optional().trim().escape().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Please check your form inputs and try again.' });
  }

  const { companyName, contactEmail, origin, destination, cargoType, weightTons, notes } = req.body;
  // Normalize phone server-side (defense in depth). If provided but invalid, reject.
  let contactPhone = null;
  if (req.body.contactPhone) {
    contactPhone = normalizeKenyanPhone(req.body.contactPhone);
    if (!contactPhone) {
      return res.status(400).json({ error: 'Please enter a valid Kenyan phone number (e.g. 0717900400).' });
    }
  }

  try {
    const { rows: refRow } = await query(
      "SELECT 'QT-' || LPAD((COUNT(*)+1)::text, 3, '0') AS ref FROM quotations"
    );

    let clientId = null;
    const { rows: existing } = await query('SELECT id FROM clients WHERE email = $1', [contactEmail]);
    if (existing.length) {
      clientId = existing[0].id;
      // Backfill phone on the existing client record if we now have one
      if (contactPhone) {
        await query('UPDATE clients SET phone = COALESCE(phone, $1) WHERE id = $2',
          [contactPhone, clientId]);
      }
    } else {
      const { rows: newClient } = await query(
        'INSERT INTO clients (company_name, email, phone) VALUES ($1, $2, $3) RETURNING id',
        [companyName, contactEmail, contactPhone]
      );
      clientId = newClient[0].id;
    }

    const { rows } = await query(
      `INSERT INTO quotations
         (reference, client_id, company_name, contact_email, contact_phone,
          origin, destination, cargo_type, weight_tons, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending') RETURNING id, reference`,
      [refRow[0].ref, clientId, companyName, contactEmail, contactPhone,
       origin, destination, cargoType, weightTons || null, notes]
    );

    const { sendQuoteAcknowledgement } = require('../services/email');
    sendQuoteAcknowledgement(contactEmail, companyName, rows[0].reference).catch(console.error);

    res.status(201).json({
      message: 'Your quote request has been received. We will email you a quotation within 2 business hours.',
      reference: rows[0].reference,
    });
  } catch (err) {
    console.error('Public quote error:', err);
    res.status(500).json({ error: 'Failed to submit request. Please try again or call us directly.' });
  }
});

// GET /api/public/track/:reference — public, read-only shipment status.
// Returns ONLY non-sensitive fields (status + route), never client/cost/contact.
const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
router.get('/track/:reference', trackLimiter, async (req, res) => {
  const ref = String(req.params.reference || '').trim().toUpperCase();
  if (!/^JRN-\d{4}-\d{3}$/.test(ref)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { rows } = await query(
      `SELECT reference, origin, destination, status, scheduled_date
         FROM journeys WHERE UPPER(reference) = $1 LIMIT 1`,
      [ref]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Public track error:', err);
    res.status(500).json({ error: 'Tracking is temporarily unavailable.' });
  }
});

module.exports = router;
