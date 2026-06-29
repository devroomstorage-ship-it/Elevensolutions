// Email settings — read/write the SMTP server config + sender addresses,
// run verify and test-send. All endpoints require super_admin or finance.

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, financeOrAdmin, allStaff, auditLog } = require('../middleware/auth');
const {
  getEmailSettings,
  invalidateEmailSettingsCache,
  sendTestEmail,
  verifySmtp,
} = require('../services/email');

const router = express.Router();
router.use(authenticate);

// Editable keys. The SMTP password is editable but never sent back to the client.
const KEYS = [
  'email_from_address', 'email_from_name', 'email_reply_to',
  'email_from_quotes', 'email_from_invoices', 'email_from_ack',
  'email_smtp_host', 'email_smtp_port', 'email_smtp_user', 'email_smtp_pass',
];

// GET /api/email-settings — read all keys; mask the SMTP password as "•••••" if set.
router.get('/', allStaff, async (_req, res) => {
  const { rows } = await query(
    "SELECT key, value FROM site_settings WHERE key = ANY($1::text[])",
    [KEYS]
  );
  const settings = Object.fromEntries(KEYS.map(k => [k, '']));
  for (const r of rows) settings[r.key] = r.value || '';

  // Never leak the SMTP password back. Indicate whether one is set with a sentinel.
  const smtpConfigured = !!(settings.email_smtp_host && settings.email_smtp_user && settings.email_smtp_pass);
  if (settings.email_smtp_pass) settings.email_smtp_pass = '__SET__';

  res.json({ settings, smtpConfigured });
});

// PATCH /api/email-settings — update any subset of keys
router.patch('/', financeOrAdmin, [
  body('email_from_address').optional({ checkFalsy: true }).isEmail().withMessage('Default from-address must be a valid email.'),
  body('email_reply_to').optional({ checkFalsy: true }).isEmail().withMessage('Reply-to must be a valid email if set.'),
  body('email_from_quotes').optional({ checkFalsy: true }).isEmail().withMessage('Quotes sender must be a valid email.'),
  body('email_from_invoices').optional({ checkFalsy: true }).isEmail().withMessage('Invoice sender must be a valid email.'),
  body('email_from_ack').optional({ checkFalsy: true }).isEmail().withMessage('Acknowledgement sender must be a valid email.'),
  body('email_from_name').optional().isLength({ max: 100 }),
  body('email_smtp_host').optional().isLength({ max: 255 }),
  body('email_smtp_port').optional({ checkFalsy: true }).isInt({ min: 1, max: 65535 }).withMessage('SMTP port must be 1-65535.'),
  body('email_smtp_user').optional().isLength({ max: 255 }),
  body('email_smtp_pass').optional().isLength({ max: 255 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg, field: errors.array()[0].path });

  const updates = {};
  for (const k of KEYS) {
    if (req.body[k] === undefined) continue;
    // Never overwrite a stored password with the masking sentinel.
    if (k === 'email_smtp_pass' && req.body[k] === '__SET__') continue;
    updates[k] = String(req.body[k]).trim();
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No email settings supplied.' });

  for (const [k, v] of Object.entries(updates)) {
    await query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [k, v]
    );
  }
  invalidateEmailSettingsCache();

  // Audit log — never log the password value
  const auditDetail = Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [k, k === 'email_smtp_pass' ? '(updated)' : v])
  );
  await auditLog(req.user.id, 'email_settings.updated', 'site_settings', null, auditDetail, req.ip);
  res.json({ updated: Object.keys(updates) });
});

// POST /api/email-settings/verify — connect to SMTP and try authentication
router.post('/verify', financeOrAdmin, async (_req, res) => {
  try {
    await verifySmtp();
    res.json({ message: 'SMTP server accepted the credentials.' });
  } catch (err) {
    res.status(400).json({ error: humanizeSmtpError(err) });
  }
});

// POST /api/email-settings/test — fire a test email to the staff member
router.post('/test', financeOrAdmin, [
  body('to').isEmail().withMessage('Recipient must be a valid email.'),
  body('purpose').optional().isIn(['quotes', 'invoices', 'ack']).withMessage('Purpose must be quotes, invoices or ack.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  try {
    await sendTestEmail(req.body.to, req.body.purpose || 'quotes');
    await auditLog(req.user.id, 'email_settings.test_sent', null, null, { to: req.body.to, purpose: req.body.purpose }, req.ip);
    res.json({ message: `Test email sent to ${req.body.to}.` });
  } catch (err) {
    console.error('test email error:', err);
    res.status(500).json({ error: humanizeSmtpError(err) });
  }
});

// Friendly error mapping for the SMTP errors users actually hit
function humanizeSmtpError(err) {
  const msg = (err && err.message) || String(err);
  if (/SMTP not configured/i.test(msg)) return msg;
  if (/Invalid login|535-5.7.8|Username and Password not accepted/i.test(msg)) {
    return 'SMTP login failed. For Gmail, make sure you are using an App Password (16-character code from myaccount.google.com/apppasswords), not your regular Gmail password.';
  }
  if (/getaddrinfo|ENOTFOUND/i.test(msg)) {
    return 'Could not reach the SMTP server. Check the host name.';
  }
  if (/ETIMEDOUT|Connection timeout/i.test(msg)) {
    return 'Connection to SMTP server timed out. Check the port and that your server can reach it.';
  }
  if (/self.signed certificate|certificate/i.test(msg)) {
    return 'SMTP server certificate not trusted. Verify the host name is correct.';
  }
  return msg;
}

module.exports = router;
