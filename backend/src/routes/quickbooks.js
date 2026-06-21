const express = require('express');
const { query } = require('../db');
const { authenticate, financeOrAdmin } = require('../middleware/auth');
const qb = require('../services/quickbooks');

const router = express.Router();

// GET /api/quickbooks/status
router.get('/status', authenticate, financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT realm_id, expires_at, updated_at FROM quickbooks_tokens LIMIT 1');
  if (!rows.length) return res.json({ connected: false });
  const expired = new Date(rows[0].expires_at) <= new Date();
  res.json({ connected: true, expired, realmId: rows[0].realm_id, lastSync: rows[0].updated_at });
});

// GET /api/quickbooks/connect — initiate OAuth2
router.get('/connect', authenticate, financeOrAdmin, (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.QB_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QB_REDIRECT_URI,
    state: 'eleven_solutions_qb',
  });
  res.redirect(`https://appcenter.intuit.com/connect/oauth2?${params}`);
});

// GET /api/quickbooks/callback — handle OAuth callback
router.get('/callback', async (req, res) => {
  const { code, realmId } = req.query;
  if (!code || !realmId) return res.status(400).send('Missing code or realmId');

  try {
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.QB_REDIRECT_URI,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token received');

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await query(
      `INSERT INTO quickbooks_tokens (realm_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [realmId, tokens.access_token, tokens.refresh_token, expiresAt]
    );
    await query(
      `UPDATE quickbooks_tokens SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
       WHERE realm_id = $4`,
      [tokens.access_token, tokens.refresh_token, expiresAt, realmId]
    );

    res.redirect(`${process.env.PORTAL_URL}/finance?qb=connected`);
  } catch (err) {
    console.error('QB OAuth error:', err);
    res.redirect(`${process.env.PORTAL_URL}/finance?qb=error`);
  }
});

// POST /api/quickbooks/disconnect
router.post('/disconnect', authenticate, financeOrAdmin, async (req, res) => {
  await query('DELETE FROM quickbooks_tokens');
  res.json({ message: 'QuickBooks disconnected' });
});

// ─── Sync endpoints ──────────────────────────────────────────────────────────

// POST /api/quickbooks/sync-customer/:clientId
router.post('/sync-customer/:clientId', authenticate, financeOrAdmin, async (req, res) => {
  try {
    const result = await qb.syncCustomer(req.params.clientId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// POST /api/quickbooks/create-estimate/:quoteId
router.post('/create-estimate/:quoteId', authenticate, financeOrAdmin, async (req, res) => {
  try {
    const result = await qb.createEstimate(req.params.quoteId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// POST /api/quickbooks/create-invoice/:journeyId
router.post('/create-invoice/:journeyId', authenticate, financeOrAdmin, async (req, res) => {
  try {
    const result = await qb.createInvoice(req.params.journeyId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// POST /api/quickbooks/retry-sync/:syncLogId
router.post('/retry-sync/:syncLogId', authenticate, financeOrAdmin, async (req, res) => {
  try {
    const result = await qb.retry(req.params.syncLogId, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

// GET /api/quickbooks/logs — recent sync attempts (for the Finance page)
router.get('/logs', authenticate, financeOrAdmin, async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = 'WHERE status = $1'; }
  const { rows } = await query(
    `SELECT id, entity_type, entity_id, qb_id, status, attempt, error_message, created_at
       FROM quickbooks_sync_logs ${where}
      ORDER BY created_at DESC LIMIT 100`,
    params
  );
  res.json(rows);
});

module.exports = router;
