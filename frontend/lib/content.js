// Server-side fetch of public site content from the API.
// Falls back to sensible defaults so the site still renders if the API is down.

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const FALLBACK = {
  settings: {
    company_name: 'Eleven Solutions Ltd',
    company_tagline: 'Cargo that keeps moving.',
    po_box: 'P.O. Box 1977-0203, Ruiru',
    address_line: 'Ruiru, Kenya',
    phone_1: '0717900400', phone_2: '0711900400', phone_3: '0716900400',
    email_primary: 'info@elevensolutions.co.ke',
    email_secondary: 'elevensolutionltd@gmail.com',
    hero_heading: 'Freight that keeps East Africa moving',
    hero_sub: 'A modern Kenyan logistics operator with a 13-truck fleet, live tracking, eTIMS-compliant invoicing, and a team that answers the phone.',
    stat_trucks: '13', stat_uptime: '24/7', stat_compliance: '100%',
  },
  sections: [],
  services: [
    { slug: 'ftl', title: 'Full Truck Load', tagline: 'Your cargo, one dedicated truck', icon: 'truck',
      description: 'Dedicated trucks for large consignments moving point-to-point across Kenya and the wider East African corridor.',
      features: ['Dedicated vehicle', 'Direct point-to-point', 'Real-time tracking', 'Up to 28 tonnes'] },
    { slug: 'ltl', title: 'Part Load / Groupage', tagline: 'Pay for the space you use', icon: 'boxes',
      description: 'Cost-effective shared-capacity transport for smaller consignments.',
      features: ['Shared capacity', 'Lower cost', 'Scheduled departures', 'Insured in transit'] },
    { slug: 'cross-border', title: 'Cross-Border Haulage', tagline: 'Beyond the Kenyan border', icon: 'globe',
      description: 'Regional freight into Uganda, Tanzania and Rwanda with customs handled.',
      features: ['Uganda, Tanzania, Rwanda', 'Customs paperwork', 'Corridor crews', 'Border tracking'] },
    { slug: 'contract', title: 'Contract Logistics', tagline: 'A fleet that feels like yours', icon: 'calendar',
      description: 'Ongoing scheduled transport with recurring lanes and reserved capacity.',
      features: ['Reserved capacity', 'Recurring lanes', 'Monthly billing', 'Account manager'] },
  ],
  areas: [
    { name: 'Nairobi', country: 'Kenya', is_hub: true }, { name: 'Ruiru', country: 'Kenya', is_hub: true },
    { name: 'Mombasa', country: 'Kenya' }, { name: 'Nakuru', country: 'Kenya' },
    { name: 'Kisumu', country: 'Kenya' }, { name: 'Eldoret', country: 'Kenya' },
    { name: 'Kampala', country: 'Uganda' }, { name: 'Dar es Salaam', country: 'Tanzania' },
    { name: 'Kigali', country: 'Rwanda' },
  ],
  testimonials: [],
};

export async function getSiteContent() {
  try {
    const res = await fetch(`${BASE}/content/site`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error('content fetch failed');
    const data = await res.json();
    // Merge so a partial payload still has defaults.
    return {
      settings: { ...FALLBACK.settings, ...(data.settings || {}) },
      sections: data.sections?.length ? data.sections : FALLBACK.sections,
      services: data.services?.length ? data.services : FALLBACK.services,
      areas: data.areas?.length ? data.areas : FALLBACK.areas,
      testimonials: data.testimonials || FALLBACK.testimonials,
    };
  } catch {
    return FALLBACK;
  }
}

export function section(sections, key) {
  return sections?.find((s) => s.section_key === key) || null;
}
