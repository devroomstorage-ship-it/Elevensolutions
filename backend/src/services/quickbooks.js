/**
 * QuickBooks Online integration.
 *
 * Replaces the earlier stub. Adds:
 *   - real OAuth2 token refresh (the old code threw on expiry)
 *   - idempotent pushes (skip if the local record already has a QB id)
 *   - a quickbooks_sync_logs row for every attempt (success or error)
 *   - retry of a previously failed log entry
 *
 * Calls the QBO REST API directly with fetch (no SDK needed), so behaviour is
 * transparent and easy to debug. Token storage stays in quickbooks_tokens.
 */
const { query } = require('../db');

const SANDBOX = process.env.QB_SANDBOX === 'true';
const API_BASE = SANDBOX
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
const MINOR_VERSION = '65';

// ─────────────────────────────────────────────────────────────────────────────
// Token handling
// ─────────────────────────────────────────────────────────────────────────────

async function loadToken() {
  const { rows } = await query('SELECT * FROM quickbooks_tokens LIMIT 1');
  if (!rows.length) {
    throw new Error('QuickBooks not connected. Complete the OAuth flow first.');
  }
  return rows[0];
}

async function refreshIfNeeded(token) {
  // Refresh a minute before actual expiry to avoid edge races.
  if (new Date(token.expires_at) > new Date(Date.now() + 60_000)) return token;

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
  });

  const t = await res.json();
  if (!t.access_token) {
    throw new Error('QuickBooks token refresh failed. Reconnect via Finance → QuickBooks.');
  }

  const expiresAt = new Date(Date.now() + t.expires_in * 1000);
  await query(
    `UPDATE quickbooks_tokens
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
     WHERE realm_id = $4`,
    [t.access_token, t.refresh_token || token.refresh_token, expiresAt, token.realm_id]
  );

  return {
    ...token,
    access_token: t.access_token,
    refresh_token: t.refresh_token || token.refresh_token,
    expires_at: expiresAt,
  };
}

async function authedToken() {
  const token = await loadToken();
  return refreshIfNeeded(token);
}

/** Low-level QBO REST call. */
async function qbFetch(token, method, path, body) {
  const url = `${API_BASE}/v3/company/${token.realm_id}/${path}` +
    (path.includes('?') ? '&' : '?') + `minorversion=${MINOR_VERSION}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      json?.Fault?.Error?.[0]?.Message ||
      json?.Fault?.Error?.[0]?.Detail ||
      `HTTP ${res.status}`;
    const err = new Error(`QuickBooks API error: ${detail}`);
    err.qbResponse = json;
    throw err;
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync logging
// ─────────────────────────────────────────────────────────────────────────────

async function logSync({ entityType, entityId, qbId, status, attempt = 1, error, request, response, userId }) {
  await query(
    `INSERT INTO quickbooks_sync_logs
       (entity_type, entity_id, qb_id, direction, status, attempt,
        error_message, request_payload, response_payload, triggered_by)
     VALUES ($1,$2,$3,'push',$4,$5,$6,$7,$8,$9)`,
    [
      entityType, entityId, qbId || null, status, attempt,
      error || null,
      request ? JSON.stringify(request) : null,
      response ? JSON.stringify(response) : null,
      userId || null,
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity pushes (all idempotent)
// ─────────────────────────────────────────────────────────────────────────────

/** Sync a local client to a QuickBooks Customer. */
async function syncCustomer(clientId, userId, attempt = 1) {
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
  if (!rows.length) throw Object.assign(new Error('Client not found'), { status: 404 });
  const client = rows[0];

  // Idempotency: already synced.
  if (client.quickbooks_id) {
    return { quickbooksId: client.quickbooks_id, skipped: true };
  }

  const payload = {
    DisplayName: client.company_name,
    CompanyName: client.company_name,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.address ? { Line1: client.address } : undefined,
  };

  try {
    const token = await authedToken();
    const result = await qbFetch(token, 'POST', 'customer', payload);
    const qbId = result?.Customer?.Id;

    await query(
      `UPDATE clients SET quickbooks_id = $1, qb_sync_status = 'synced',
         qb_last_synced_at = NOW() WHERE id = $2`,
      [qbId, clientId]
    );
    await logSync({ entityType: 'customer', entityId: clientId, qbId, status: 'success', attempt, request: payload, response: result, userId });
    return { quickbooksId: qbId, skipped: false };
  } catch (err) {
    await query(`UPDATE clients SET qb_sync_status = 'error' WHERE id = $1`, [clientId]);
    await logSync({ entityType: 'customer', entityId: clientId, status: 'error', attempt, error: err.message, request: payload, response: err.qbResponse, userId });
    throw err;
  }
}

/** Turn an accepted quotation into a QuickBooks Estimate. */
async function createEstimate(quoteId, userId, attempt = 1) {
  const { rows } = await query(
    `SELECT q.*, c.quickbooks_id AS client_qb_id, c.id AS resolved_client_id
       FROM quotations q LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.id = $1`,
    [quoteId]
  );
  if (!rows.length) throw Object.assign(new Error('Quotation not found'), { status: 404 });
  const quote = rows[0];

  if (quote.quickbooks_estimate_id) {
    return { quickbooksId: quote.quickbooks_estimate_id, skipped: true };
  }

  // The customer must exist in QB first.
  let customerQbId = quote.client_qb_id;
  if (!customerQbId && quote.resolved_client_id) {
    const r = await syncCustomer(quote.resolved_client_id, userId);
    customerQbId = r.quickbooksId;
  }
  if (!customerQbId) {
    throw new Error('Quote has no QuickBooks customer; link a client and sync it first.');
  }

  const amount = Number(quote.amount || 0);
  const payload = {
    CustomerRef: { value: String(customerQbId) },
    Line: [
      {
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        Description: `Transport: ${quote.origin} → ${quote.destination}`,
        SalesItemLineDetail: { Qty: 1, UnitPrice: amount },
      },
    ],
    DocNumber: quote.reference,
  };

  try {
    const token = await authedToken();
    const result = await qbFetch(token, 'POST', 'estimate', payload);
    const qbId = result?.Estimate?.Id;

    await query(
      `UPDATE quotations SET quickbooks_estimate_id = $1, qb_sync_status = 'synced',
         qb_last_synced_at = NOW() WHERE id = $2`,
      [qbId, quoteId]
    );
    await logSync({ entityType: 'estimate', entityId: quoteId, qbId, status: 'success', attempt, request: payload, response: result, userId });
    return { quickbooksId: qbId, skipped: false };
  } catch (err) {
    await query(`UPDATE quotations SET qb_sync_status = 'error' WHERE id = $1`, [quoteId]);
    await logSync({ entityType: 'estimate', entityId: quoteId, status: 'error', attempt, error: err.message, request: payload, response: err.qbResponse, userId });
    throw err;
  }
}

/** Generate a QuickBooks Invoice for a delivered journey. */
async function createInvoice(journeyId, userId, attempt = 1) {
  // Find (or expect) a local invoice for this journey.
  const { rows } = await query(
    `SELECT i.*, c.quickbooks_id AS client_qb_id, c.id AS resolved_client_id
       FROM invoices i LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.journey_id = $1
      ORDER BY i.created_at DESC LIMIT 1`,
    [journeyId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('No local invoice exists for this journey yet'), { status: 404 });
  }
  const invoice = rows[0];

  if (invoice.quickbooks_id) {
    return { quickbooksId: invoice.quickbooks_id, skipped: true };
  }

  let customerQbId = invoice.client_qb_id;
  if (!customerQbId && invoice.resolved_client_id) {
    const r = await syncCustomer(invoice.resolved_client_id, userId);
    customerQbId = r.quickbooksId;
  }
  if (!customerQbId) {
    throw new Error('Invoice has no QuickBooks customer; sync the client first.');
  }

  const total = Number(invoice.total_amount);
  const payload = {
    CustomerRef: { value: String(customerQbId) },
    DocNumber: invoice.reference,
    DueDate: invoice.due_date,
    Line: [
      {
        Amount: total,
        DetailType: 'SalesItemLineDetail',
        Description: 'Logistics / transport services',
        SalesItemLineDetail: { Qty: 1, UnitPrice: total },
      },
    ],
  };

  try {
    const token = await authedToken();
    const result = await qbFetch(token, 'POST', 'invoice', payload);
    const qbId = result?.Invoice?.Id;

    await query(
      `UPDATE invoices SET quickbooks_id = $1, qb_sync_status = 'synced',
         qb_last_synced_at = NOW() WHERE id = $2`,
      [qbId, invoice.id]
    );
    await logSync({ entityType: 'invoice', entityId: invoice.id, qbId, status: 'success', attempt, request: payload, response: result, userId });
    return { quickbooksId: qbId, skipped: false, invoiceId: invoice.id };
  } catch (err) {
    await query(`UPDATE invoices SET qb_sync_status = 'error' WHERE id = $1`, [invoice.id]);
    await logSync({ entityType: 'invoice', entityId: invoice.id, status: 'error', attempt, error: err.message, request: payload, response: err.qbResponse, userId });
    throw err;
  }
}

/** Re-run the operation referenced by a failed sync-log row. */
async function retry(syncLogId, userId) {
  const { rows } = await query('SELECT * FROM quickbooks_sync_logs WHERE id = $1', [syncLogId]);
  if (!rows.length) throw Object.assign(new Error('Sync log not found'), { status: 404 });
  const log = rows[0];

  const nextAttempt = (log.attempt || 1) + 1;
  switch (log.entity_type) {
    case 'customer':
      return syncCustomer(log.entity_id, userId, nextAttempt);
    case 'estimate':
      return createEstimate(log.entity_id, userId, nextAttempt);
    case 'invoice': {
      // entity_id on an invoice log is the invoice id; resolve its journey.
      const { rows: inv } = await query('SELECT journey_id FROM invoices WHERE id = $1', [log.entity_id]);
      if (!inv.length || !inv[0].journey_id) throw new Error('Cannot resolve journey for invoice retry');
      return createInvoice(inv[0].journey_id, userId, nextAttempt);
    }
    default:
      throw new Error(`Cannot retry entity type "${log.entity_type}"`);
  }
}

module.exports = {
  authedToken,
  syncCustomer,
  createEstimate,
  createInvoice,
  retry,
};
