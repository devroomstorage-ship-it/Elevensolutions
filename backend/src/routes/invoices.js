const express = require('express');
const { query, withTransaction } = require('../db');
const { authenticate, financeOrAdmin, allStaff, auditLog } = require('../middleware/auth');
const { sendInvoiceEmail } = require('../services/email');
const { generateInvoicePDF } = require('../services/pdf');
const { pushInvoiceToQB, markPaidInQB } = require('../services/quickbooks');

const router = express.Router();
router.use(authenticate);

// GET /api/invoices
router.get('/', allStaff, async (req, res) => {
  const { status } = req.query;
  const params = [];
  const where = status ? (params.push(status), 'WHERE i.status = $1') : '';
  const { rows } = await query(`
    SELECT i.*, c.company_name, c.email AS client_email
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    ${where} ORDER BY i.created_at DESC LIMIT 200
  `, params);
  res.json(rows);
});

// GET /api/invoices/stats
router.get('/stats', financeOrAdmin, async (req, res) => {
  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent')    AS outstanding_count,
      COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
      COALESCE(SUM(total_amount) FILTER (WHERE status IN ('sent','overdue')), 0) AS outstanding_amount,
      COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid' AND paid_date >= date_trunc('month', NOW())), 0) AS paid_this_month
    FROM invoices
  `);
  res.json(rows[0]);
});

// GET /api/invoices/:id
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(`
    SELECT i.*, c.company_name, c.email AS client_email, c.phone AS client_phone
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    WHERE i.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

// GET /api/invoices/:id/pdf — generate and stream the invoice PDF directly (no email)
router.get('/:id/pdf', allStaff, async (req, res) => {
  const { rows } = await query(`
    SELECT i.*, c.company_name, c.email AS client_email, c.phone AS client_phone
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    WHERE i.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

  try {
    const pdfBuffer = await generateInvoicePDF(rows[0]);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].reference}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Invoice PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate invoice PDF' });
  }
});

// POST /api/invoices — create invoice (usually auto-triggered on journey completion)
router.post('/', financeOrAdmin, async (req, res) => {
  const { clientId, journeyId, amount, taxRate = 0, dueDays = 14, notes } = req.body;
  if (!clientId || !amount) return res.status(400).json({ error: 'clientId and amount required' });

  const taxAmount = (amount * taxRate) / 100;
  const totalAmount = amount + taxAmount;
  const dueDate = new Date(Date.now() + dueDays * 86400000).toISOString().split('T')[0];

  const { rows: refRow } = await query(
    "SELECT 'INV-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD((COUNT(*)+1)::text, 3, '0') AS ref FROM invoices"
  );

  const { rows } = await query(
    `INSERT INTO invoices (reference, client_id, journey_id, amount, tax_amount, total_amount, due_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [refRow[0].ref, clientId, journeyId || null, amount, taxAmount, totalAmount, dueDate, notes, req.user.id]
  );

  await auditLog(req.user.id, 'invoice.created', 'invoice', rows[0].id, { reference: rows[0].reference }, req.ip);
  res.status(201).json(rows[0]);
});

// POST /api/invoices/:id/send — generate PDF and email to client
router.post('/:id/send', financeOrAdmin, async (req, res) => {
  const { rows } = await query(
    `SELECT i.*, c.company_name, c.email AS client_email, c.phone AS client_phone
     FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = rows[0];

  try {
    const pdfBuffer = await generateInvoicePDF(invoice);
    await sendInvoiceEmail(invoice.client_email, invoice.company_name, invoice, pdfBuffer);

    await query(
      "UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1",
      [invoice.id]
    );

    // Sync to QuickBooks
    try {
      const qbId = await pushInvoiceToQB(invoice);
      if (qbId) {
        await query('UPDATE invoices SET quickbooks_id = $1 WHERE id = $2', [qbId, invoice.id]);
      }
    } catch (qbErr) {
      console.error('QB sync failed (non-fatal):', qbErr.message);
    }

    await auditLog(req.user.id, 'invoice.sent', 'invoice', invoice.id, { to: invoice.client_email }, req.ip);
    res.json({ message: 'Invoice sent successfully' });
  } catch (err) {
    console.error('Invoice send error:', err);
    res.status(500).json({ error: 'Failed to send invoice' });
  }
});

// POST /api/invoices/:id/mark-paid
router.post('/:id/mark-paid', financeOrAdmin, async (req, res) => {
  const { rows } = await query(
    "UPDATE invoices SET status = 'paid', paid_date = CURRENT_DATE WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });

  // Sync payment to QB
  try {
    if (rows[0].quickbooks_id) await markPaidInQB(rows[0]);
  } catch (err) {
    console.error('QB payment sync failed:', err.message);
  }

  await auditLog(req.user.id, 'invoice.paid', 'invoice', rows[0].id, {}, req.ip);
  res.json(rows[0]);
});

// Cron-style: mark overdue invoices (call from a scheduler)
router.post('/run-overdue-check', financeOrAdmin, async (req, res) => {
  const { rowCount } = await query(
    "UPDATE invoices SET status = 'overdue' WHERE status = 'sent' AND due_date < CURRENT_DATE"
  );
  res.json({ updated: rowCount });
});

module.exports = router;
