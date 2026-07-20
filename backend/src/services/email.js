// Email sender — supports three transports:
// 1) SMTP/Nodemailer for local testing, e.g. Gmail App Password on your laptop.
// 2) Mailtrap Email API for domain-based production sending.
// 3) Google Apps Script webhook for Render Free + Gmail testing over HTTPS.

const nodemailer = require('nodemailer');
const dns = require('dns');
const { query } = require('../db');

// Force IPv4 when resolving SMTP hostnames. Render's network (and many other
// cloud hosts) doesn't route IPv6 outbound on default tiers — without this,
// Node's DNS resolver may return Google's IPv6 address first and we get
// ENETUNREACH on connect. family:4 makes the resolver only return IPv4.
const ipv4Lookup = (hostname, options, callback) => {
  // Handle both callback signatures dns.lookup uses.
  if (typeof options === 'function') { callback = options; options = {}; }
  return dns.lookup(hostname, { ...options, family: 4 }, callback);
};

// ─── Settings cache (30s) ─────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 30_000;

const KEYS = [
  'email_from_address', 'email_from_name', 'email_reply_to',
  'email_from_quotes', 'email_from_invoices', 'email_from_ack',
  'email_smtp_host', 'email_smtp_port', 'email_smtp_user', 'email_smtp_pass',
];

async function getEmailSettings() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_MS) return _cache;
  try {
    const { rows } = await query(
      "SELECT key, value FROM site_settings WHERE key = ANY($1::text[])",
      [KEYS]
    );
    const m = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
    _cache = {
      transport: (process.env.EMAIL_TRANSPORT || (process.env.MAILTRAP_API_KEY || process.env.MAILTRAP_API_TOKEN ? 'mailtrap' : 'smtp')).trim().toLowerCase(),
      mailtrapApiKey: (process.env.MAILTRAP_API_KEY || process.env.MAILTRAP_API_TOKEN || '').trim(),
      googleScriptUrl: (process.env.GOOGLE_SCRIPT_EMAIL_WEBHOOK_URL || '').trim(),
      googleScriptSecret: (process.env.GOOGLE_SCRIPT_EMAIL_SECRET || '').trim(),
      defaultAddress: (m.email_from_address || process.env.EMAIL_FROM || '').trim(),
      defaultName:    (m.email_from_name    || process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo:        (m.email_reply_to || '').trim(),
      perPurpose: {
        quotes:   (m.email_from_quotes   || '').trim(),
        invoices: (m.email_from_invoices || '').trim(),
        ack:      (m.email_from_ack      || '').trim(),
      },
      smtp: {
        host: (m.email_smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
        port: Number(m.email_smtp_port || process.env.SMTP_PORT || 465),
        user: (m.email_smtp_user || process.env.SMTP_USER || '').trim(),
        pass: (m.email_smtp_pass || process.env.SMTP_PASS || '').trim(),
      },
    };
    _cacheAt = now;
    return _cache;
  } catch (err) {
    // DB unavailable — fall back to env vars so emails still work in dev
    return {
      transport: (process.env.EMAIL_TRANSPORT || (process.env.MAILTRAP_API_KEY || process.env.MAILTRAP_API_TOKEN ? 'mailtrap' : 'smtp')).trim().toLowerCase(),
      mailtrapApiKey: (process.env.MAILTRAP_API_KEY || process.env.MAILTRAP_API_TOKEN || '').trim(),
      googleScriptUrl: (process.env.GOOGLE_SCRIPT_EMAIL_WEBHOOK_URL || '').trim(),
      googleScriptSecret: (process.env.GOOGLE_SCRIPT_EMAIL_SECRET || '').trim(),
      defaultAddress: (process.env.EMAIL_FROM || '').trim(),
      defaultName:    (process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo: '',
      perPurpose: { quotes: '', invoices: '', ack: '' },
      smtp: {
        host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
        port: Number(process.env.SMTP_PORT || 465),
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASS || '').trim(),
      },
    };
  }
}
function invalidateEmailSettingsCache() { _cache = null; _cacheAt = 0; _transporter = null; }

// ─── nodemailer transporter (cached per settings) ─────────────────────────────
let _transporter = null;
let _transporterKey = '';
async function getTransporter() {
  const s = await getEmailSettings();
  const key = `${s.smtp.host}:${s.smtp.port}:${s.smtp.user}`;
  if (_transporter && _transporterKey === key) return _transporter;
  if (!s.smtp.host || !s.smtp.user || !s.smtp.pass) {
    throw new Error('SMTP not configured. Set host, user and password in Settings → Email.');
  }
  _transporter = nodemailer.createTransport({
    host: s.smtp.host,
    port: s.smtp.port,
    secure: s.smtp.port === 465,  // 465 = SSL, 587 = STARTTLS
    auth: { user: s.smtp.user, pass: s.smtp.pass },
    // Force IPv4 — see ipv4Lookup definition above for why.
    // Both options needed: connection itself + TLS upgrade for port 587.
    dnsTimeout: 10000,
    connectionTimeout: 15000,
    socketTimeout: 30000,
    tls: { servername: s.smtp.host },
    lookup: ipv4Lookup,
  });
  _transporterKey = key;
  return _transporter;
}


// ─── Generic email send wrapper ───────────────────────────────────────────────
function parseEmailAddress(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    return {
      email: match[2].trim(),
      name: match[1].trim() || undefined,
    };
  }
  return { email: raw };
}

function toAddressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toAddressList);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map(parseEmailAddress);
}

function guessMimeType(filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}

async function sendViaMailtrap(mail) {
  const s = await getEmailSettings();
  if (!s.mailtrapApiKey) {
    throw new Error('Mailtrap API key not configured. Set MAILTRAP_API_KEY in Render environment variables.');
  }

  const payload = {
    from: parseEmailAddress(mail.from),
    to: toAddressList(mail.to),
    subject: mail.subject,
  };

  if (mail.replyTo) payload.reply_to = parseEmailAddress(mail.replyTo);
  if (mail.text) payload.text = mail.text;
  if (mail.html) payload.html = mail.html;

  if (mail.attachments?.length) {
    payload.attachments = mail.attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(String(a.content || '')).toString('base64'),
      type: a.contentType || guessMimeType(a.filename),
      disposition: 'attachment',
    }));
  }

  const response = await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.mailtrapApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'eleven-solutions-backend/1.0',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors) ? body.errors.join('; ') : (body?.error || bodyText || response.statusText);
    throw new Error(`Mailtrap send failed (${response.status}): ${errors}`);
  }

  return body;
}


async function sendViaGoogleScript(mail) {
  const s = await getEmailSettings();
  if (!s.googleScriptUrl || !s.googleScriptSecret) {
    throw new Error('Google Apps Script email relay is not configured. Set GOOGLE_SCRIPT_EMAIL_WEBHOOK_URL and GOOGLE_SCRIPT_EMAIL_SECRET.');
  }

  const attachments = (mail.attachments || []).map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(String(a.content || '')).toString('base64'),
    contentType: a.contentType || guessMimeType(a.filename),
  }));

  const response = await fetch(s.googleScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: s.googleScriptSecret,
      to: mail.to,
      subject: mail.subject,
      text: mail.text || '',
      html: mail.html || '',
      replyTo: mail.replyTo || '',
      fromName: s.defaultName || COMPANY.name,
      attachments,
    }),
  });

  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

  if (!response.ok || body?.success === false) {
    throw new Error(`Google Script email failed (${response.status}): ${body?.error || bodyText || response.statusText}`);
  }

  return body;
}

async function sendEmail(mail) {
  const s = await getEmailSettings();
  if (s.transport === 'mailtrap' || s.transport === 'mailtrap_api') {
    return sendViaMailtrap(mail);
  }
  if (s.transport === 'google_script' || s.transport === 'apps_script') {
    return sendViaGoogleScript(mail);
  }
  const t = await getTransporter();
  return t.sendMail(mail);
}

async function verifyEmailService() {
  const s = await getEmailSettings();
  if (s.transport === 'mailtrap' || s.transport === 'mailtrap_api') {
    if (!s.mailtrapApiKey) throw new Error('Mailtrap API key not configured. Set MAILTRAP_API_KEY in Render environment variables.');
    return true;
  }
  if (s.transport === 'google_script' || s.transport === 'apps_script') {
    if (!s.googleScriptUrl || !s.googleScriptSecret) throw new Error('Google Apps Script email relay is not configured.');
    return true;
  }
  const t = await getTransporter();
  await t.verify();
  return true;
}

async function resolveFrom(purpose) {
  const s = await getEmailSettings();
  const override = s.perPurpose[purpose] || '';
  const fromEmail = override || s.defaultAddress || s.smtp.user;
  return {
    from: `"${s.defaultName}" <${fromEmail}>`,
    replyTo: s.replyTo || undefined,
  };
}

// ─── Company contact details (single source of truth for email content) ───────
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

// ─── Send: formal PDF quotation ───────────────────────────────────────────────
// `note` is an optional staff-written message shown above the quote table.
// HTML-escaped so a note can never inject markup into the email.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

async function sendQuoteEmail(to, companyName, quote, pdfBuffer, note = '') {
  const { from, replyTo } = await resolveFrom('quotes');
  const noteBlock = note
    ? `<div style="background:#FFF7ED;border-left:3px solid #E8620A;padding:12px 16px;margin:16px 0;">
         <p style="color:#444;margin:0;font-size:14px;">${escapeHtml(note)}</p>
       </div>`
    : '';
  await sendEmail({
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
          ${noteBlock}
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
    attachments: [{ filename: `Quotation-${quote.reference}.pdf`, content: pdfBuffer }],
  });
}

// ─── Send: acknowledgement (instant on form submit) ───────────────────────────
async function sendQuoteAcknowledgement(to, companyName, reference) {
  // If email is not configured, log and skip — don't break the public form.
  try { await verifyEmailService(); } catch (err) {
    console.error('Quote acknowledgement skipped:', err.message || err);
    return;
  }

  const { from, replyTo } = await resolveFrom('ack');
  const trackingUrl = `${(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')}/track-quote`;
  await sendEmail({
    to, from, replyTo,
    subject: `We received your request [${reference}] — ${COMPANY.name}`,
    text: [
      `Dear ${companyName},`,
      '',
      `We have received your quotation request.`,
      `Reference: ${reference}`,
      '',
      `Please keep this reference number. You can use it to track your quote status${trackingUrl ? ` here: ${trackingUrl}` : ' on our website'}.`,
      '',
      `If you need urgent assistance, call us on ${COMPANY.phones.join(' or ')}.`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">We have received your quotation request.</p>
          <p style="font-size:20px;color:#0F1E2E;font-weight:bold;letter-spacing:1px;">${reference}</p>
          <p style="color:#444;">Please keep this reference number. You can use it to track your quote status${trackingUrl ? ` using the tracking page below.` : ` on our website.`}</p>
          ${trackingUrl ? `<p><a href="${trackingUrl}" style="display:inline-block;background:#E8620A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">Track Quote</a></p>` : ''}
          <p style="color:#444;">You will receive a formal quotation once our team reviews your request.</p>
          <p style="color:#444;">If you need urgent assistance, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
  });
}

// ─── Send: client OTP for quote tracking ─────────────────────────────────────
async function sendQuoteOtpEmail(to, companyName, reference, otp) {
  const { from, replyTo } = await resolveFrom('ack');
  await sendEmail({
    to, from, replyTo,
    subject: `Your verification code for ${reference} — ${COMPANY.name}`,
    text: `Dear ${companyName || 'Customer'},\n\nYour Eleven Solutions verification code is ${otp}. This code expires in 10 minutes.\n\nReference: ${reference}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName || 'Customer'}</strong>,</p>
          <p style="color:#444;">Use this verification code to view your quote status:</p>
          <p style="font-size:28px;color:#E8620A;font-weight:bold;letter-spacing:4px;">${otp}</p>
          <p style="color:#444;">This code expires in <strong>10 minutes</strong>.</p>
          <p style="color:#666;font-size:13px;">Quote reference: <strong>${reference}</strong></p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
  });
}

// ─── Send: quote ready notification ──────────────────────────────────────────
async function sendQuoteReadyEmail(to, companyName, quote) {
  const { from, replyTo } = await resolveFrom('quotes');
  const trackingUrl = `${(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')}/track-quote`;
  await sendEmail({
    to, from, replyTo,
    subject: `Your quotation is ready [${quote.reference}] — ${COMPANY.name}`,
    text: `Dear ${companyName},\n\nYour quotation is ready. Reference: ${quote.reference}. ${trackingUrl ? `Track it here: ${trackingUrl}` : 'You can track it on our website.'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Your quotation is ready.</p>
          <p style="color:#444;">Reference: <strong>${quote.reference}</strong></p>
          ${quote.quote_amount || quote.amount ? `<p style="color:#444;">Amount: <strong>${formatKES(quote.quote_amount || quote.amount)}</strong></p>` : ''}
          ${trackingUrl ? `<p><a href="${trackingUrl}" style="display:inline-block;background:#E8620A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">View Quote</a></p>` : ''}
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;"><p style="color:#888;font-size:11px;margin:0;">${footerLine}</p></div>
      </div>`,
  });
}

// ─── Send: invoice ready notification ────────────────────────────────────────
async function sendInvoiceCreatedEmail(to, companyName, invoice, quote = {}) {
  const { from, replyTo } = await resolveFrom('invoices');
  const trackingUrl = `${(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '')}/track-quote`;
  const invoiceNo = invoice.invoice_number || invoice.reference;
  await sendEmail({
    to, from, replyTo,
    subject: `Your invoice is ready [${invoiceNo}] — ${COMPANY.name}`,
    text: `Dear ${companyName},\n\nYour invoice is ready. Invoice No: ${invoiceNo}. Quote Reference: ${quote.reference || '—'}. ${trackingUrl ? `View it here: ${trackingUrl}` : 'You can view it on our website.'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Your invoice has been created.</p>
          <p style="color:#444;">Invoice No: <strong>${invoiceNo}</strong></p>
          ${quote.reference ? `<p style="color:#444;">Quote Reference: <strong>${quote.reference}</strong></p>` : ''}
          ${(invoice.total_amount ?? invoice.amount) ? `<p style="color:#444;">Amount: <strong>${formatKES(invoice.total_amount ?? invoice.amount)}</strong></p>` : ''}
          ${trackingUrl ? `<p><a href="${trackingUrl}" style="display:inline-block;background:#E8620A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">View Invoice</a></p>` : ''}
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;"><p style="color:#888;font-size:11px;margin:0;">${footerLine}</p></div>
      </div>`,
  });
}


// ─── Send: admin notification (instant on public quote submit) ────────────────
async function sendQuoteAdminNotification(quote) {
  const adminEmail = (process.env.ADMIN_QUOTE_EMAIL || process.env.EMAIL_REPLY_TO || '').trim();
  if (!adminEmail) {
    console.warn('Admin quote notification skipped: ADMIN_QUOTE_EMAIL is not configured.');
    return;
  }

  // If email is not configured, log the error but do not break the public form.
  try {
    await verifyEmailService();
  } catch (err) {
    console.error('Admin quote notification skipped:', err.message || err);
    return;
  }

  const { from, replyTo } = await resolveFrom('ack');
  const customerEmail = quote.contact_email || quote.contactEmail || '';
  const customerPhone = quote.contact_phone || quote.contactPhone || '';
  const companyName = quote.company_name || quote.companyName || 'Customer';
  const reference = quote.reference || 'New quote request';

  await sendEmail({
    to: adminEmail,
    from,
    replyTo: customerEmail || replyTo,
    subject: `New quote request ${reference} — ${companyName}`,
    text: [
      `New quote request received: ${reference}`,
      `Company: ${companyName}`,
      `Email: ${customerEmail}`,
      `Phone: ${customerPhone}`,
      `Pickup date: ${quote.requested_pickup_date || quote.pickupDate || '—'}`,
      `Route: ${quote.origin || '—'} to ${quote.destination || '—'}`,
      `Cargo: ${quote.cargo_type || quote.cargoType || '—'}`,
      `Weight: ${quote.weight_tons || quote.weightTons || '—'} tons`,
      `Notes: ${quote.notes || '—'}`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">New quote request received</h2>
          <p style="color:#8fa3b8;margin:6px 0 0;font-size:13px;">${COMPANY.name}</p>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;margin-top:0;">A customer has successfully submitted a quote request from the website.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:160px;">Reference</td><td style="padding:8px 12px;font-size:13px;color:#333;font-weight:bold;">${reference}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Company</td><td style="padding:8px 12px;font-size:13px;color:#333;">${companyName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Email</td><td style="padding:8px 12px;font-size:13px;color:#333;">${customerEmail || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Phone</td><td style="padding:8px 12px;font-size:13px;color:#333;">${customerPhone || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Pickup date</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.requested_pickup_date || quote.pickupDate)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Route</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.origin || '—'} → ${quote.destination || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Cargo</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.cargo_type || quote.cargoType || '—'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Weight</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.weight_tons || quote.weightTons || '—'} tons</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Notes</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.notes || '—'}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">Open the portal to review and prepare the quotation.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
  });
}

// ─── Send: invoice PDF ────────────────────────────────────────────────────────
async function sendInvoiceEmail(to, companyName, invoice, pdfBuffer) {
  const { from, replyTo } = await resolveFrom('invoices');
  await sendEmail({
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
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td><td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(invoice.total_amount ?? invoice.amount)}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">For any questions about this invoice, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
    attachments: [{ filename: `Invoice-${invoice.reference}.pdf`, content: pdfBuffer }],
  });
}

// ─── Send: client portal invite ───────────────────────────────────────────────
async function sendClientInviteEmail(to, companyName, setPasswordUrl) {
  const { from, replyTo } = await resolveFrom('ack');
  await sendEmail({
    to, from, replyTo,
    subject: `You're invited to the Eleven Solutions client portal`,
    text: [
      `Dear ${companyName},`,
      '',
      `Eleven Solutions has set up online access to your quotes, invoices and journeys.`,
      `Set your password to get started: ${setPasswordUrl}`,
      '',
      `This link expires in 72 hours.`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">We've set up online access to your quotes, invoices and journeys with ${COMPANY.name}.</p>
          <p><a href="${setPasswordUrl}" style="display:inline-block;background:#E8620A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">Set your password</a></p>
          <p style="color:#666;font-size:13px;">This link expires in 72 hours. If you didn't expect this invite, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;"><p style="color:#888;font-size:11px;margin:0;">${footerLine}</p></div>
      </div>`,
  });
}

// ─── Test send (used by the settings page "Send test" button) ─────────────────
async function sendTestEmail(to, purpose = 'quotes') {
  const { from, replyTo } = await resolveFrom(purpose);
  await sendEmail({
    to, from, replyTo,
    subject: `Test email from ${COMPANY.name}`,
    text: `This is a test email sent from ${from} for purpose "${purpose}". If you received this, your email settings are working.`,
    html: `<p>This is a test email sent from <strong>${from}</strong> for purpose <code>${purpose}</code>.<br>If you received this, your email settings are working.</p>`,
  });
}

// ─── Verify SMTP credentials without sending anything ─────────────────────────
async function verifySmtp() {
  return verifyEmailService();
}

module.exports = {
  sendQuoteEmail,
  sendQuoteAcknowledgement,
  sendQuoteOtpEmail,
  sendQuoteReadyEmail,
  sendInvoiceCreatedEmail,
  sendQuoteAdminNotification,
  sendInvoiceEmail,
  sendClientInviteEmail,
  sendTestEmail,
  getEmailSettings,
  invalidateEmailSettingsCache,
  verifySmtp,
};
