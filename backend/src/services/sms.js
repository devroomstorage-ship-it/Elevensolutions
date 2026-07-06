// Placeholder SMS service.
// Later, this can be connected to Africa's Talking, Twilio, or another SMS provider.

async function sendSms(to, message) {
  if (!process.env.SMS_PROVIDER) {
    console.log('SMS skipped: SMS_PROVIDER is not configured.', { to, message });
    return { skipped: true };
  }

  // Add provider implementation here when SMS credentials are available.
  console.log('SMS provider configured but no implementation exists yet.', { to, message });
  return { skipped: true };
}

async function sendQuoteReferenceSms(phone, reference) {
  if (!phone) return { skipped: true };
  return sendSms(phone, `Your Eleven Solutions quote request has been received. Reference: ${reference}. Use this number to track your quote status.`);
}

async function sendQuoteOtpSms(phone, otp) {
  if (!phone) return { skipped: true };
  return sendSms(phone, `Your Eleven Solutions verification code is ${otp}. It expires in 10 minutes.`);
}

module.exports = {
  sendSms,
  sendQuoteReferenceSms,
  sendQuoteOtpSms,
};
