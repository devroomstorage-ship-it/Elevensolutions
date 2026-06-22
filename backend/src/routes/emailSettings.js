// Email settings — read/write the sender addresses, test-send.
// All endpoints require super_admin or finance.
//
// Settings live as rows in site_settings (key/value) so they share storage
// with the rest of the CMS, and changes apply at the next send without a
// restart (the email service caches for ~30s).

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, financeOrAdmin, allStaff, auditLog } = require('../middleware/auth');
const {
  getEmailSettings,
  invalidateEmailSettingsCache,
  sendTestEmail,
} = require('../services/email');

const router = express.Router();
router.use(authenticate);

const KEYS = [
  'email_from_address',
  'email_from_name',
  'email_reply_to',
  'email_from_quotes',
  'email_from_invoices',
  'email_from_ack',
];

// GET /api/email-settings — return all six keys + current resolved values.
// Also flags whether SendGrid is configured so the UI can show a clear warning.
router.get('/', allStaff, async (_req, res) => {
  const { rows } = await query(
    "SELECT key, value FROM site_settings WHERE key = ANY($1::text[])",
    [KEYS]
  );
  const settings = Object.fromEntries(KEYS.map(k => [k, '']));
  for (const r of rows) settings[r.key] = r.value || '';

  const sendgridConfigured = !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.'));

  res.json({ settings, sendgridConfigured });
});

// PATCH /api/email-settings — update one or more keys at once
router.patch('/', financeOrAdmin, [
  body('email_from_address').optional({ checkFalsy: true }).isEmail().withMessage('Default from-address must be a valid email.'),
  body('email_reply_to').optional({ checkFalsy: true }).isEmail().withMessage('Reply-to must be a valid email if set.'),
  body('email_from_quotes').optional({ checkFalsy: true }).isEmail().withMessage('Quotes sender must be a valid email.'),
  body('email_from_invoices').optional({ checkFalsy: true }).isEmail().withMessage('Invoice sender must be a valid email.'),
  body('email_from_ack').optional({ checkFalsy: true }).isEmail().withMessage('Acknowledgement sender must be a valid email.'),
  body('email_from_name').optional().isLength({ max: 100 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, field: errors.array()[0].path });

  const updates = {};
  for (const k of KEYS) {
    if (req.body[k] !== undefined) updates[k] = String(req.body[k]).trim();
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No email settings supplied.' });

  // Upsert each key
  for (const [k, v] of Object.entries(updates)) {
    await query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [k, v]
    );
  }
  invalidateEmailSettingsCache();
  await auditLog(req.user.id, 'email_settings.updated', 'site_settings', null, updates, req.ip);
  res.json({ updated: Object.keys(updates) });
});

// POST /api/email-settings/test — fire a test email to the staff member
router.post('/test', financeOrAdmin, [
  body('to').isEmail().withMessage('Recipient must be a valid email.'),
  body('purpose').optional().isIn(['quotes', 'invoices', 'ack']).withMessage('Purpose must be quotes, invoices or ack.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  if (!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.'))) {
    return res.status(400).json({ error: 'SENDGRID_API_KEY is not set on this server. Add it to .env and restart the backend.' });
  }
  try {
    await sendTestEmail(req.body.to, req.body.purpose || 'quotes');
    await auditLog(req.user.id, 'email_settings.test_sent', null, null, { to: req.body.to, purpose: req.body.purpose }, req.ip);
    res.json({ message: `Test email sent to ${req.body.to}.` });
  } catch (err) {
    console.error('test email error:', err.response?.body || err.message);
    const msg = err.response?.body?.errors?.[0]?.message
             || err.message
             || 'SendGrid rejected the send.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
