const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const FROM_EMAIL = process.env.EMAIL_FROM || SMTP_USER;
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Eleven Solutions Limited';

const COMPANY = {
  name: 'Eleven Solutions Limited',
  address: 'P.O. Box 1977-0203, Ruiru, Kenya',
  phones: ['+254717900400', '+254711900400', '+254716900400'],
  emails: ['info@elevensolutions.co.ke', 'elevensolutionltd@gmail.com'],
};

const formatKES = (amount) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(amount || 0);

const formatDate = (d) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const transporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  : null;

async function sendMail(message) {
  if (!transporter) {
    console.warn('SMTP email is not configured. Skipping email send.');
    return;
  }

  await transporter.sendMail({
    ...message,
    from: {
      address: FROM_EMAIL,
      name: FROM_NAME,
    },
  });
}

const phonesHtml = COMPANY.phones
  .map((p) => `<a href="tel:${p}" style="color:#E8620A;text-decoration:none;">${p}</a>`)
  .join(' · ');

const callOnLine = `Call us on <strong>${COMPANY.phones.join('</strong> or <strong>')}</strong>`;
const footerLine = `${COMPANY.name} · ${COMPANY.address} · ${COMPANY.phones.join(' · ')} · ${COMPANY.emails[0]}`;

const sendQuoteEmail = async (to, companyName, quote, pdfBuffer) => {
  await sendMail({
    to,
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
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Reference</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;font-weight:bold;">${quote.reference}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.created_at)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Valid until</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.valid_until)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Route</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;">${quote.origin} → ${quote.destination}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Cargo</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;">${quote.cargo_type || 'General Freight'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td>
              <td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(quote.amount)}</td>
            </tr>
          </table>
          <p style="color:#444;font-size:13px;">To accept this quotation, please reply to this email or ${callOnLine.replace('Call us on', 'call us on')}.</p>
          <p style="color:#666;font-size:12px;margin-top:20px;">This quotation is subject to availability and our standard terms and conditions.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `Quotation-${quote.reference}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
};

const sendQuoteAcknowledgement = async (to, companyName, reference) => {
  await sendMail({
    to,
    subject: `We received your request [${reference}] — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;">
          <h2 style="color:#fff;margin:0;">${COMPANY.name}</h2>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">We have received your quotation request <strong>${reference}</strong> and our team is preparing your quote.</p>
          <p style="color:#444;">You will receive a formal quotation with pricing within <strong>2 business hours</strong>.</p>
          <p style="color:#444;">If you need urgent assistance, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>
    `,
  });
};

const sendInvoiceEmail = async (to, companyName, invoice, pdfBuffer) => {
  await sendMail({
    to,
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
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Invoice No.</td>
              <td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#333;">${invoice.reference}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td>
              <td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.created_at)}</td>
            </tr>
            ${
              invoice.due_date
                ? `<tr>
                    <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Due</td>
                    <td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.due_date)}</td>
                  </tr>`
                : ''
            }
            <tr>
              <td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td>
              <td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(invoice.amount)}</td>
            </tr>
          </table>
          <p style="color:#444;font-size:13px;">For any questions about this invoice, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `Invoice-${invoice.reference}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
};

module.exports = {
  sendQuoteEmail,
  sendQuoteAcknowledgement,
  sendInvoiceEmail,
};