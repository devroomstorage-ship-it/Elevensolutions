'use client';
import Link from 'next/link';

const ICONS = {
  truck: (
    <><rect x="1" y="6" width="13" height="10" rx="1.5"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>
  ),
  boxes: (
    <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="8" y="13" width="8" height="8" rx="1"/></>
  ),
  globe: (
    <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></>
  ),
  calendar: (
    <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>
  ),
};

export default function Services({ services = [] }) {
  return (
    <section id="services" className="bg-[var(--paper)] py-24">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">What we move</p>
          <h2 className="font-display font-bold text-[var(--ink)] tracking-tight"
            style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)' }}>
            Four ways to put our fleet to work
          </h2>
          <p className="mt-4 text-[var(--mist)] text-[16px] leading-relaxed">
            From a single dedicated truck to recurring contract lanes across the region — choose the service that fits the shipment.
          </p>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {services.map((s, i) => (
            <Link key={s.slug} href={`/services/${s.slug}`}
              className="group relative rounded-2xl border border-[var(--line)] bg-white p-6 hover:border-[var(--orchid-400)] hover:shadow-[0_12px_40px_-12px_rgba(106,62,142,0.25)] transition-all duration-300">
              <div className="w-11 h-11 rounded-xl bg-grad flex items-center justify-center mb-5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[s.icon] || ICONS.truck}
                </svg>
              </div>
              <h3 className="font-display font-semibold text-[var(--ink)] text-[17px]">{s.title}</h3>
              <p className="text-[var(--orchid-500)] text-[12px] mt-0.5 font-medium">{s.tagline}</p>
              <p className="text-[var(--mist)] text-[14px] mt-3 leading-relaxed line-clamp-3">{s.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--plum-700)] group-hover:gap-2 transition-all">
                Learn more
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </span>
              <span className="absolute top-5 right-5 font-mono text-[11px] text-[var(--line)] group-hover:text-[var(--orchid-300)] transition-colors">
                0{i + 1}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
