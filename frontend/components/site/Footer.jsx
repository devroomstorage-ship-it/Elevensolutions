'use client';
import Link from 'next/link';

export default function Footer({ settings = {} }) {
  const phones = [settings.phone_1, settings.phone_2, settings.phone_3].filter(Boolean);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#241432] text-white/70">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="font-display font-bold text-white text-lg mb-3">
            Eleven<span className="text-[var(--orchid-300)]"> Solutions</span>
          </div>
          <p className="text-[14px] leading-relaxed text-white/55 max-w-xs">
            {settings.company_tagline || 'Cargo that keeps moving.'} Freight and logistics across Kenya and East Africa.
          </p>
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-300)] mb-4">Services</h4>
          <ul className="space-y-2.5 text-[14px]">
            <li><Link href="/services/ftl" className="hover:text-white transition-colors">Full Truck Load</Link></li>
            <li><Link href="/services/ltl" className="hover:text-white transition-colors">Part Load / Groupage</Link></li>
            <li><Link href="/services/cross-border" className="hover:text-white transition-colors">Cross-Border Haulage</Link></li>
            <li><Link href="/services/contract" className="hover:text-white transition-colors">Contract Logistics</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-300)] mb-4">Company</h4>
          <ul className="space-y-2.5 text-[14px]">
            <li><Link href="/about" className="hover:text-white transition-colors">About us</Link></li>
            <li><a href="/#coverage" className="hover:text-white transition-colors">Coverage</a></li>
            <li><Link href="/track" className="hover:text-white transition-colors">Track a shipment</Link></li>
            <li><Link href="/portal/login" className="hover:text-white transition-colors">Staff login</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-300)] mb-4">Contact</h4>
          <address className="not-italic text-[14px] space-y-2.5">
            <p>{settings.po_box || 'P.O. Box 1977-0203, Ruiru'}</p>
            <p>{settings.address_line || 'Ruiru, Kenya'}</p>
            <div className="font-mono text-[13px] space-y-1 pt-1">
              {phones.map((p) => (
                <a key={p} href={`tel:${p}`} className="block hover:text-white transition-colors">{p}</a>
              ))}
            </div>
            <div className="pt-1 space-y-1">
              {settings.email_primary && <a href={`mailto:${settings.email_primary}`} className="block hover:text-white transition-colors break-all">{settings.email_primary}</a>}
              {settings.email_secondary && <a href={`mailto:${settings.email_secondary}`} className="block hover:text-white transition-colors break-all">{settings.email_secondary}</a>}
            </div>
          </address>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-2 text-[12px] text-white/40">
          <p>© {year} {settings.company_name || 'Eleven Solutions Ltd'}. All rights reserved.</p>
          <p className="font-mono">Ruiru · Kenya</p>
        </div>
      </div>
    </footer>
  );
}
