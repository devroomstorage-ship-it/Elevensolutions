const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { normalizeInternationalPhone } = require('../services/phone');
const { CARGO_TYPES, EAST_AFRICA_PICKUP_POINTS } = require('../constants/quoteOptions');

const router = express.Router();

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
});

function eastAfricaTodayISO() {
  return new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function isDateAfterToday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return value > eastAfricaTodayISO();
}

router.post('/quote', formLimiter, [
  body('companyName').notEmpty().trim().escape().isLength({ max: 255 }),
  body('contactEmail').isEmail().normalizeEmail(),
  body('contactPhone')
    .notEmpty().withMessage('Phone number is required.')
    .custom((value) => Boolean(normalizeInternationalPhone(value)))
    .withMessage('Please enter a phone number with country code, e.g. +254717900400.'),
  body('pickupDate')
    .notEmpty().withMessage('Pickup date is required.')
    .custom(isDateAfterToday)
    .withMessage('Pickup date must be after today.'),
  body('origin')
    .notEmpty().withMessage('Pickup point is required.')
    .isIn(EAST_AFRICA_PICKUP_POINTS).withMessage('Please select a valid pickup point.'),
  body('destination').notEmpty().trim().escape().isLength({ max: 255 }),
  body('cargoType')
    .notEmpty().withMessage('Cargo type is required.')
    .isIn(CARGO_TYPES).withMessage('Please select a valid cargo type.'),
  body('weightTons').optional({ checkFalsy: true }).isFloat({ min: 0, max: 999 }),
  body('notes').optional().trim().escape().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg || 'Please check your form inputs and try again.' });
  }

  const {
    companyName,
    contactEmail,
    pickupDate,
    origin,
    destination,
    cargoType,
    weightTons,
    notes,
  } = req.body;

  const contactPhone = normalizeInternationalPhone(req.body.contactPhone);

  try {
    const { rows: refRow } = await query(
      "SELECT 'QT-' || LPAD((COUNT(*)+1)::text, 3, '0') AS ref FROM quotations"
    );

    let clientId = null;
    const { rows: existing } = await query('SELECT id FROM clients WHERE email = $1', [contactEmail]);
    if (existing.length) {
      clientId = existing[0].id;
      await query('UPDATE clients SET phone = COALESCE(phone, $1) WHERE id = $2',
        [contactPhone, clientId]);
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
          requested_pickup_date, origin, destination, cargo_type, weight_tons, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING id, reference, company_name, contact_email, contact_phone, requested_pickup_date, origin, destination, cargo_type, weight_tons, notes`,
      [refRow[0].ref, clientId, companyName, contactEmail, contactPhone,
       pickupDate, origin, destination, cargoType, weightTons || null, notes]
    );

    const { sendQuoteAcknowledgement, sendQuoteAdminNotification } = require('../services/email');
    sendQuoteAcknowledgement(contactEmail, companyName, rows[0].reference).catch((err) => {
      console.error('Quote acknowledgement email error:', err.message || err);
    });
    sendQuoteAdminNotification(rows[0]).catch((err) => {
      console.error('Admin quote notification email error:', err.message || err);
    });

    res.status(201).json({
      message: 'Your quote request has been received. We will email you a quotation within 2 business hours.',
      reference: rows[0].reference,
    });
  } catch (err) {
    console.error('Public quote error:', err);
    res.status(500).json({ error: 'Failed to submit request. Please try again or call us directly.' });
  }
});

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