// Eleven Solutions Gmail email relay for Render Free.
// Deploy as Web App:
// Execute as: Me
// Who has access: Anyone
// Then set the same WEBHOOK_SECRET in Render as GOOGLE_SCRIPT_EMAIL_SECRET.

const WEBHOOK_SECRET = 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET';

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (payload.secret !== WEBHOOK_SECRET) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const text = String(payload.text || '').trim() || 'Please view this message in an HTML-capable email client.';
    const html = String(payload.html || '').trim();
    const replyTo = String(payload.replyTo || '').trim();
    const fromName = String(payload.fromName || 'Eleven Solutions Limited').trim();

    if (!to || !subject) {
      return jsonResponse({ success: false, error: 'Missing to or subject' });
    }

    const options = {
      name: fromName,
    };

    if (html) options.htmlBody = html;
    if (replyTo) options.replyTo = replyTo;

    if (Array.isArray(payload.attachments) && payload.attachments.length) {
      options.attachments = payload.attachments.map(function (attachment) {
        const bytes = Utilities.base64Decode(String(attachment.content || ''));
        const blob = Utilities.newBlob(
          bytes,
          attachment.contentType || 'application/octet-stream',
          attachment.filename || 'attachment'
        );
        return blob;
      });
    }

    GmailApp.sendEmail(to, subject, text, options);
    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message ? err.message : err) });
  }
}
