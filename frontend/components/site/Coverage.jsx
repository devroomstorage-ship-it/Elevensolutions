'use client';

export default function Coverage({ areas = [] }) {
  // Group by country, hubs first.
  const byCountry = areas.reduce((acc, a) => {
    (acc[a.country] = acc[a.country] || []).push(a);
    return acc;
  }, {});

  return (
    <section id="coverage" className="relative bg-[#2E1A40] py-24 overflow-hidden">
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(700px 400px at 85% 10%, rgba(176,96,160,0.18), transparent 60%)' }} />
      <div className="relative max-w-7xl mx-auto px-5 lg:px-8 grid lg:grid-cols-[0.9fr_1.1fr] gap-14 items-center">
        <div>
          <p className="eyebrow mb-3">Where we run</p>
          <h2 className="font-display font-bold text-white tracking-tight"
            style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)' }}>
            One corridor, fully covered
          </h2>
          <p className="mt-4 text-white/65 text-[16px] leading-relaxed max-w-md">
            Hubs in Nairobi and Ruiru anchor a network that reaches the coast, the lake region, and across the border into the wider East African Community.
          </p>
          <div className="mt-8 flex gap-6">
            <div>
              <div className="font-display font-bold text-white text-3xl">{areas.filter(a => a.country === 'Kenya').length}</div>
              <div className="text-white/50 text-[12px]">Kenyan towns served</div>
            </div>
            <div>
              <div className="font-display font-bold text-white text-3xl">{new Set(areas.map(a => a.country)).size}</div>
              <div className="text-white/50 text-[12px]">Countries reached</div>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
          {Object.entries(byCountry).map(([country, list]) => (
            <div key={country}>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-300)] mb-3">{country}</h3>
              <ul className="space-y-2">
                {list.map((a) => (
                  <li key={a.name} className="flex items-center gap-2.5 text-white/80 text-[15px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${a.is_hub ? 'bg-[var(--orchid-400)]' : 'bg-white/30'}`} />
                    {a.name}
                    {a.is_hub && <span className="font-mono text-[10px] text-[var(--orchid-300)] border border-[var(--orchid-300)]/30 rounded px-1.5 py-0.5">HUB</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
