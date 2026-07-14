// backend/src/routes/clientAuth.js
//
// Unauthenticated endpoints for a client accepting a portal invite. Kept
// separate from routes/auth.js (which stays generic staff+client
// login/refresh/logout/me) so a dedicated rate limiter can be applied at the
// mount point in index.js without affecting /api/auth/*.
//
// Token handling mirrors refresh_tokens: only a bcrypt hash is ever stored,
// never the raw token. There's no index we can look the token up by before
// auth, so — same as refresh_tokens — we scan the small set of live invites
// and bcrypt-compare each.

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { auditLog } = require('../middleware/auth');

const router = express.Router();

async function findInviteByToken(token) {
  const { rows } = await query(
    `SELECT ci.*, c.company_name, c.email AS client_email
       FROM client_invites ci
       JOIN clients c ON c.id = ci.client_id
      WHERE ci.used_at IS NULL AND ci.expires_at > NOW()`
  );
  for (const row of rows) {
    if (await bcrypt.compare(token, row.token_hash)) return row;
  }
  return null;
}

// POST /api/client-auth/invite/verify — { token } -> { companyName, email }
// POST (not GET /:token) so the raw token never lands in server access logs.
router.post('/invite/verify', [
  body('token').isString().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid request' });

  const invite = await findInviteByToken(req.body.token);
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });

  res.json({ companyName: invite.company_name, email: invite.client_email });
});

// POST /api/client-auth/accept — { token, password } -> sets/resets the
// client's login and marks the invite used.
router.post('/accept', [
  body('token').isString().notEmpty(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }

  const invite = await findInviteByToken(req.body.token);
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });

  try {
    const hash = await bcrypt.hash(req.body.password, 12);
    let userId;

    await withTransaction(async (c) => {
      const { rows: existing } = await c.query(
        `SELECT id FROM users WHERE client_id = $1 AND role = 'client'`,
        [invite.client_id]
      );

      if (existing.length) {
        userId = existing[0].id;
        await c.query(
          'UPDATE users SET password_hash = $1, is_active = TRUE WHERE id = $2',
          [hash, userId]
        );
      } else {
        const { rows: created } = await c.query(
          `INSERT INTO users (email, full_name, role, password_hash, client_id, is_active)
           VALUES ($1, $2, 'client', $3, $4, TRUE) RETURNING id`,
          [invite.client_email, invite.company_name, hash, invite.client_id]
        );
        userId = created[0].id;
      }

      await c.query('UPDATE client_invites SET used_at = NOW() WHERE id = $1', [invite.id]);
    });

    await auditLog(userId, 'client.invite_accepted', 'client', invite.client_id, {}, req.ip);
    res.json({ message: 'Password set. You can now log in.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    console.error('Invite accept error:', err);
    res.status(500).json({ error: 'Could not set password.' });
  }
});

module.exports = router;
