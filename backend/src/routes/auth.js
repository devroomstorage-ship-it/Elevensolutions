const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { TOTP } = require('otpauth');
const qrcode = require('qrcode');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, auditLog } = require('../middleware/auth');

const router = express.Router();

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { sub: userId, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { sub: userId, jti: uuidv4() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

  const { email, password, totpCode } = req.body;
  const ip = req.ip;

  try {
    const { rows } = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true', [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await auditLog(null, 'auth.login_failed', 'user', null, { email }, ip);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // 2FA check
    const require2fa = process.env.REQUIRE_2FA === 'true';
    if (require2fa && user.totp_enabled) {
      if (!totpCode) {
        return res.status(200).json({ requires2fa: true });
      }
      const totp = new TOTP({ secret: user.totp_secret, issuer: process.env.TOTP_ISSUER });
      if (!totp.validate({ token: totpCode, window: 1 })) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store hashed refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await auditLog(user.id, 'auth.login', 'user', user.id, {}, ip);

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { rows } = await query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()',
      [payload.sub]
    );

    // Verify against stored hashes
    let validRow = null;
    for (const row of rows) {
      if (await bcrypt.compare(refreshToken, row.token_hash)) { validRow = row; break; }
    }
    if (!validRow) return res.status(401).json({ error: 'Invalid or expired refresh token' });

    // Rotate: delete old, issue new
    await query('DELETE FROM refresh_tokens WHERE id = $1', [validRow.id]);
    const { accessToken, refreshToken: newRefresh } = generateTokens(payload.sub);
    const tokenHash = await bcrypt.hash(newRefresh, 8);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [payload.sub, tokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    res.json({ accessToken, refreshToken: newRefresh });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const { rows } = await query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1', [req.user.id]
    );
    for (const row of rows) {
      if (await bcrypt.compare(refreshToken, row.token_hash)) {
        await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
        break;
      }
    }
  }
  await auditLog(req.user.id, 'auth.logout', 'user', req.user.id, {}, req.ip);
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/2fa/setup — generate TOTP secret + QR code
router.post('/2fa/setup', authenticate, async (req, res) => {
  const totp = new TOTP({
    issuer: process.env.TOTP_ISSUER || 'ElevenSolutions',
    label: req.user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  const secret = totp.secret.base32;
  await query('UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2',
    [secret, req.user.id]);
  const qrDataUrl = await qrcode.toDataURL(totp.toString());
  res.json({ secret, qrCode: qrDataUrl });
});

// POST /api/auth/2fa/verify — confirm and enable 2FA
router.post('/2fa/verify', authenticate, async (req, res) => {
  const { code } = req.body;
  const { rows } = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.totp_secret) return res.status(400).json({ error: '2FA setup not initiated' });

  const totp = new TOTP({ secret: rows[0].totp_secret });
  if (!totp.validate({ token: code, window: 1 })) {
    return res.status(400).json({ error: 'Invalid code' });
  }
  await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);
  res.json({ message: '2FA enabled successfully' });
});

module.exports = router;
