export function normalizeDisplayPhone(raw) {
  if (!raw) return '';
  const original = String(raw).trim();
  let compact = original.replace(/[\s\-()]/g, '');

  if (compact.startsWith('+')) {
    return compact;
  }

  if (compact.startsWith('254') && compact.length >= 12) {
    return `+${compact}`;
  }

  if (compact.startsWith('0') && compact.length >= 10) {
    return `+254${compact.slice(1)}`;
  }

  if (/^[71]\d{8}$/.test(compact)) {
    return `+254${compact}`;
  }

  return original;
}

export function telHref(raw) {
  const phone = normalizeDisplayPhone(raw);
  return phone ? `tel:${phone}` : '#';
}