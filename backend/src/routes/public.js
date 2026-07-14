const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { query } = require('../db');
const { normalizeInternationalPhone } = require('../services/phone');
const { CARGO_TYPES, EAST_AFRICA_PICKUP_POINTS } = require('../constants/quoteOptions');
const { createUniqueQuoteReference } = require('../utils/quoteReference');
const { issueQuoteAccessToken, verifyQuoteAccessToken } = require('../utils/quoteAccessToken');
const { sendQuoteReferenceSms, sendQuoteOtpSms } = require('../services/sms');

const router = express.Router();

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests. Please try again later.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification attempts. Please try again later.' },
});

function eastAfricaTodayISO() {
  return new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function isDateAfterToday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  return value > eastAfricaTodayISO();
}

function normalizeReference(value) {
  return String(value || '').trim().toUpperCase();
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(reference, otp) {
  const secret = process.env.QUOTE_TRACKING_SECRET || process.env.JWT_SECRET || 'dev-quote-secret';
  return crypto
    .createHash('sha256')
    .update(`${normalizeReference(reference)}:${otp}:${secret}`)
    .digest('hex');
}

function clientStatus(status) {
  const map = {
    pending: 'Received',
    received: 'Received',
    under_review: 'Under Review',
    quote_prepared: 'Quote Ready',
    quote_sent: 'Quote Ready',
    approved: 'Approved',
    invoice_created: 'Invoice Ready',
    truck_assigned: 'Truck Booked',
    in_progress: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Cancelled',
  };
  return map[String(status || '').toLowerCase()] || 'Received';
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return String(req.query.token || '').trim();
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
    const reference = await createUniqueQuoteReference(query);

    let clientId = null;
    const { rows: existing } = await query('SELECT id FROM clients WHERE email = $1', [contactEmail]);
    if (existing.length) {
      clientId = existing[0].id;
      await query('UPDATE clients SET phone = COALESCE(phone, $1) WHERE id = $2', [contactPhone, clientId]);
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'received')
       RETURNING *`,
      [reference, clientId, companyName, contactEmail, contactPhone,
       pickupDate, origin, destination, cargoType, weightTons || null, notes]
    );

    const { sendQuoteAcknowledgement, sendQuoteAdminNotification } = require('../services/email');
    sendQuoteAcknowledgement(contactEmail, companyName, rows[0].reference).catch((err) => {
      console.error('Quote acknowledgement email error:', err.message || err);
    });
    sendQuoteAdminNotification(rows[0]).catch((err) => {
      console.error('Admin quote notification email error:', err.message || err);
    });
    sendQuoteReferenceSms(contactPhone, rows[0].reference).catch((err) => {
      console.error('Quote reference SMS error:', err.message || err);
    });

    res.status(201).json({
      message: `Your quote request has been received successfully. Your reference number is ${rows[0].reference}. Please keep this number to track your quote.`,
      reference: rows[0].reference,
    });
  } catch (err) {
    console.error('Public quote error:', err);
    res.status(500).json({ error: 'Failed to submit request. Please try again or call us directly.' });
  }
});

router.post('/quotes/request-otp', otpLimiter, [
  body('reference').notEmpty().trim().isLength({ min: 4, max: 32 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid quote reference number.' });

  const reference = normalizeReference(req.body.reference);

  try {
    const { rows } = await query(
      `SELECT id, reference, company_name, contact_email, contact_phone
         FROM quotations
        WHERE UPPER(reference) = $1
        LIMIT 1`,
      [reference]
    );

    // Return the same generic response so people cannot easily enumerate references.
    if (!rows.length) {
      return res.json({ message: 'If the reference exists, a verification code will be sent to the registered email/phone.' });
    }

    const quote = rows[0];
    const otp = generateOtp();
    const otpHash = hashOtp(quote.reference, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `UPDATE quotations
          SET otp_code_hash = $1,
              otp_expires_at = $2,
              otp_attempts = 0
        WHERE id = $3`,
      [otpHash, expiresAt, quote.id]
    );

    const { sendQuoteOtpEmail } = require('../services/email');
    await sendQuoteOtpEmail(quote.contact_email, quote.company_name, quote.reference, otp);
    sendQuoteOtpSms(quote.contact_phone, otp).catch((err) => {
      console.error('Quote OTP SMS error:', err.message || err);
    });

    return res.json({ message: 'If the reference exists, a verification code will be sent to the registered email/phone.' });
  } catch (err) {
    console.error('Quote OTP request error:', err);
    return res.status(500).json({ error: 'Verification is temporarily unavailable. Please try again.' });
  }
});

router.post('/quotes/verify-otp', otpLimiter, [
  body('reference').notEmpty().trim().isLength({ min: 4, max: 32 }),
  body('otp').notEmpty().trim().matches(/^\d{6}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter the quote reference and 6-digit OTP.' });

  const reference = normalizeReference(req.body.reference);
  const otp = String(req.body.otp || '').trim();

  try {
    const { rows } = await query(
      `SELECT id, reference, otp_code_hash, otp_expires_at, otp_attempts
         FROM quotations
        WHERE UPPER(reference) = $1
        LIMIT 1`,
      [reference]
    );

    if (!rows.length) return res.status(400).json({ error: 'Invalid reference or OTP.' });

    const quote = rows[0];
    if (Number(quote.otp_attempts || 0) >= 5) {
      return res.status(429).json({ error: 'Too many wrong OTP attempts. Please request a new code.' });
    }

    if (!quote.otp_code_hash || !quote.otp_expires_at || new Date(quote.otp_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    const expected = hashOtp(quote.reference, otp);
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(quote.otp_code_hash));

    if (!valid) {
      await query('UPDATE quotations SET otp_attempts = COALESCE(otp_attempts,0) + 1 WHERE id = $1', [quote.id]);
      return res.status(400).json({ error: 'Invalid reference or OTP.' });
    }

    await query(
      `UPDATE quotations
          SET otp_verified_at = NOW(),
              otp_code_hash = NULL,
              otp_expires_at = NULL,
              otp_attempts = 0
        WHERE id = $1`,
      [quote.id]
    );

    return res.json({
      message: 'Quote verified successfully.',
      token: issueQuoteAccessToken(quote.reference, 30),
      expiresInMinutes: 30,
    });
  } catch (err) {
    console.error('Quote OTP verify error:', err);
    return res.status(500).json({ error: 'Verification is temporarily unavailable. Please try again.' });
  }
});

router.get('/quotes/status', otpLimiter, async (req, res) => {
  const payload = verifyQuoteAccessToken(bearerToken(req));
  if (!payload) return res.status(401).json({ error: 'Please verify your quote reference before viewing status.' });

  try {
    const { rows } = await query(
      `SELECT *
         FROM quotations
        WHERE UPPER(reference) = $1
        LIMIT 1`,
      [normalizeReference(payload.reference)]
    );

    if (!rows.length) return res.status(404).json({ error: 'Quote not found.' });
    const quote = rows[0];

    const { rows: invoiceRows } = await query(
      `SELECT *
         FROM invoices
        WHERE quotation_id = $1
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [quote.id]
    );

    const invoice = invoiceRows[0] || null;

    return res.json({
      reference: quote.reference,
      status: quote.status || 'received',
      statusLabel: clientStatus(quote.status),
      submittedAt: quote.created_at,
      pickupDate: quote.requested_pickup_date,
      origin: quote.origin,
      destination: quote.destination,
      cargoType: quote.cargo_type,
      weightTons: quote.weight_tons,
      notes: quote.client_notes || quote.notes || '',
      quotation: {
        amount: quote.quote_amount || quote.amount || null,
        sentAt: quote.quote_sent_at || null,
        approvedAt: quote.approved_at || null,
        available: Boolean(quote.quote_sent_at || ['quote_prepared', 'quote_sent', 'approved', 'invoice_created'].includes(String(quote.status || '').toLowerCase())),
      },
      invoice: invoice ? {
        invoiceNumber: invoice.invoice_number || invoice.reference || null,
        status: invoice.status || 'created',
        amount: invoice.total_amount ?? invoice.amount ?? null,
        dueDate: invoice.due_date || null,
        pdfUrl: invoice.pdf_url || null,
        createdAt: invoice.created_at || null,
        sentAt: invoice.sent_at || null,
        paidAt: invoice.paid_at || null,
      } : null,
    });
  } catch (err) {
    console.error('Quote status error:', err);
    return res.status(500).json({ error: 'Quote status is temporarily unavailable.' });
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
