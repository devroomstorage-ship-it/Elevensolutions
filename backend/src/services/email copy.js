// Email sender — uses SendGrid, but reads the FROM address(es) at send-time
// from site_settings so admins can change them in the portal without a deploy.
//
// Per-purpose overrides: a quote can be sent from sales@..., an invoice from
// accounts@..., etc. Empty override → use the default email_from_address.
//
// IMPORTANT: SendGrid only accepts FROM addresses that are verified on your
// account (either single-sender verified or covered by a verified domain).
// Editing the address here won't bypass that — make sure the address you
// configure is verified on SendGrid first.

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const { query } = require('../db');

// ─── Settings cache ──────────────────────────────────────────────────────────
// Pull all the email_* settings once, cache for 30s. Avoids hitting the DB
// on every send while keeping changes near-instant.
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 30_000;

async function getEmailSettings() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_MS) return _cache;
  try {
    const { rows } = await query(
      "SELECT key, value FROM site_settings WHERE key LIKE 'email_%'"
    );
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    _cache = {
      defaultAddress: (map.email_from_address || process.env.EMAIL_FROM || '').trim(),
      defaultName:    (map.email_from_name    || process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo:        (map.email_reply_to || '').trim(),
      perPurpose: {
        quotes:   (map.email_from_quotes   || '').trim(),
        invoices: (map.email_from_invoices || '').trim(),
        ack:      (map.email_from_ack      || '').trim(),
      },
    };
    _cacheAt = now;
    return _cache;
  } catch (err) {
    // DB unavailable: fall back to env vars so basic email still works.
    return {
      defaultAddress: (process.env.EMAIL_FROM || '').trim(),
      defaultName:    (process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo: '',
      perPurpose: { quotes: '', invoices: '', ack: '' },
    };
  }
}
// Lets the email-settings PATCH endpoint nuke the cache after an edit so the
// new values are used immediately.
function invalidateEmailSettingsCache() { _cache = null; _cacheAt = 0; }

async function resolveFrom(purpose) {
  const s = await getEmailSettings();
  const override = s.perPurpose[purpose] || '';
  return {
    from: { email: override || s.defaultAddress, name: s.defaultName },
    replyTo: s.replyTo || undefined,
  };
}

// ─── Company contact details (single source of truth for email content) ──────
const COMPANY = {
  name:    'Eleven Solutions Limited',
  address: 'P.O. Box 1977-0203, Ruiru, Kenya',
  phones:  ['0717900400', '0711900400', '0716900400'],
  emails:  ['info@elevensolutions.co.ke', 'elevensolutionltd@gmail.com'],
};
const formatKES = (n) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const callOnLine = `Call us on <strong>${COMPANY.phones.join('</strong> or <strong>')}</strong>`;
const footerLine = `${COMPANY.name} · ${COMPANY.address} · ${COMPANY.phones.join(' · ')} · ${COMPANY.emails[0]}`;

// ─── Formal PDF quotation ────────────────────────────────────────────────────
async function sendQuoteEmail(to, companyName, quote, pdfBuffer) {
  const { from, replyTo } = await resolveFrom('quotes');
  if (!from.email) throw new Error('No sender email configured. Set email_from_address in site settings.');
  await sgMail.send({
    to, from, replyTo,
    subject: `Quotation ${quote.reference} — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">${COMPANY.name}</h2>
          <p style="color:#8fa3b8;margin:6px 0 0;font-size:13px;">Corporate Freight &amp; Logistics</p>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Thank you for your enquiry. Please find your quotation attached.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Reference</td><td style="padding:8px 12px;font-size:13px;color:#333;font-weight:bold;">${quote.reference}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.created_at)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Valid until</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.valid_until)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Route</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.origin} → ${quote.destination}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Cargo</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.cargo_type || 'General Freight'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td><td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(quote.amount)}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">To accept this quotation, please reply to this email or ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
    attachments: [{ content: pdfBuffer.toString('base64'), filename: `Quotation-${quote.reference}.pdf`, type: 'application/pdf', disposition: 'attachment' }],
  });
}

// ─── Acknowledgement (instant on form submit) ────────────────────────────────
async function sendQuoteAcknowledgement(to, companyName, reference) {
  const { from, replyTo } = await resolveFrom('ack');
  if (!from.email) return; // silent — don't break the public form for this
  await sgMail.send({
    to, from, replyTo,
    subject: `We received your request [${reference}] — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">We have received your quotation request <strong>${reference}</strong> and our team is preparing your quote.</p>
          <p style="color:#444;">You will receive a formal quotation with pricing within <strong>2 business hours</strong>.</p>
          <p style="color:#444;">If you need urgent assistance, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
  });
}

// ─── Invoice PDF ─────────────────────────────────────────────────────────────
async function sendInvoiceEmail(to, companyName, invoice, pdfBuffer) {
  const { from, replyTo } = await resolveFrom('invoices');
  if (!from.email) throw new Error('No sender email configured. Set email_from_address in site settings.');
  await sgMail.send({
    to, from, replyTo,
    subject: `Invoice ${invoice.reference} — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;">${COMPANY.name}</h2>
          <p style="color:#8fa3b8;margin:6px 0 0;font-size:13px;">Invoice</p>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Please find your invoice attached.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Invoice No.</td><td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#333;">${invoice.reference}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.created_at)}</td></tr>
            ${invoice.due_date ? `<tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Due</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.due_date)}</td></tr>` : ''}
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td><td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(invoice.amount)}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">For any questions about this invoice, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
    attachments: [{ content: pdfBuffer.toString('base64'), filename: `Invoice-${invoice.reference}.pdf`, type: 'application/pdf', disposition: 'attachment' }],
  });
}

// ─── Generic test send (for "send me a test" button in settings) ──────────────
async function sendTestEmail(to, purpose = 'quotes') {
  const { from, replyTo } = await resolveFrom(purpose);
  if (!from.email) throw new Error('No sender email configured.');
  await sgMail.send({
    to, from, replyTo,
    subject: `Test email from ${COMPANY.name}`,
    text: `This is a test email sent from ${from.email} for purpose "${purpose}". If you received this, your email settings are working.`,
    html: `<p>This is a test email sent from <strong>${from.email}</strong> for purpose <code>${purpose}</code>.<br>If you received this, your email settings are working.</p>`,
  });
}

module.exports = {
  sendQuoteEmail,
  sendQuoteAcknowledgement,
  sendInvoiceEmail,
  sendTestEmail,
  getEmailSettings,
  invalidateEmailSettingsCache,
};
