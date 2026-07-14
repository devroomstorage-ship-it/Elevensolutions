// backend/src/routes/invoices.js — PATCH endpoint addition
//
// Your existing invoices.js has a PATCH endpoint for status/amount/etc.
// Add `kraEtrCode` handling to it. Below is the standalone version — MERGE
// into your existing route, don't blindly replace, because there may be
// other logic there (send email, generate PDF, mark paid, QuickBooks sync).
//
// Two things to add:
//   1. `body('kraEtrCode').optional(...)` in the validators array
//   2. `kra_etr_code = COALESCE($N, kra_etr_code)` in the UPDATE statement,
//      with req.body.kraEtrCode passed in.

// ─── Validator to add (inside the [ ... ] validators array of PATCH) ─────────
//
//    body('kraEtrCode').optional({ nullable: true }).isString().isLength({ max: 64 })
//      .withMessage('ETR code must be 64 characters or fewer.'),

// ─── Query to add (or replace your existing UPDATE) ──────────────────────────
//
//    UPDATE invoices
//    SET amount        = COALESCE($1, amount),
//        status        = COALESCE($2, status),
//        due_date      = COALESCE($3, due_date),
//        notes         = COALESCE($4, notes),
//        kra_etr_code  = COALESCE($5, kra_etr_code),    -- NEW
//        updated_at    = NOW()
//    WHERE id = $6
//    RETURNING *
//
// And pass req.body.kraEtrCode in the $5 slot.
//
// Also update your GET /:id SELECT to include kra_etr_code — it should
// already be included if you use SELECT *; if you enumerate columns, add it.

// ─── Example complete PATCH block for reference ──────────────────────────────
/*
router.patch('/:id', financeOrAdmin, [
  body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('status').optional({ checkFalsy: true }).isIn(['pending', 'sent', 'paid', 'overdue', 'cancelled']),
  body('dueDate').optional({ checkFalsy: true }).isISO8601(),
  body('notes').optional({ nullable: true }).isString(),
  body('kraEtrCode').optional({ nullable: true }).isString().isLength({ max: 64 })
    .withMessage('ETR code must be 64 characters or fewer.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const f = errors.array()[0];
    return res.status(400).json({ error: f.msg, field: f.path });
  }
  const { amount, status, dueDate, notes, kraEtrCode } = req.body;
  const { rows } = await query(
    `UPDATE invoices
        SET amount       = COALESCE($1, amount),
            status       = COALESCE($2, status),
            due_date     = COALESCE($3, due_date),
            notes        = COALESCE($4, notes),
            kra_etr_code = COALESCE($5, kra_etr_code),
            updated_at   = NOW()
      WHERE id = $6 RETURNING *`,
    [amount || null, status || null, dueDate || null, notes || null, kraEtrCode || null, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Invoice not found' });
  await auditLog(req.user.id, 'invoice.updated', 'invoice', req.params.id, req.body, req.ip);
  res.json(rows[0]);
});
*/
