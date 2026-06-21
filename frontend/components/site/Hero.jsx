'use client';

export default function Hero({ settings }) {
  const heading = settings?.hero_heading || 'Freight that keeps East Africa moving';
  const sub = settings?.hero_sub || '';
  const stats = [
    { value: settings?.stat_trucks || '13', label: 'Trucks in the fleet' },
    { value: settings?.stat_uptime || '24/7', label: 'Operations desk' },
    { value: settings?.stat_compliance || '100%', label: 'eTIMS compliant' },
  ];

  return (
    <section className="relative min-h-[100svh] flex items-center overflow-hidden bg-[#2E1A40]">
      {/* Ambient gradient wash */}
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(1200px 600px at 78% 18%, rgba(176,96,160,0.28), transparent 60%), radial-gradient(900px 500px at 12% 88%, rgba(80,48,112,0.45), transparent 55%)' }} />

      {/* Signature: self-drawing route across an abstract corridor */}
      <RouteCanvas />

      <div className="relative max-w-7xl mx-auto px-5 lg:px-8 pt-28 pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center w-full">
        <div>
          <p className="eyebrow mb-5 float-in float-in-1">Ruiru · Kenya · East Africa</p>
          <h1 className="font-display font-extrabold text-white leading-[1.04] tracking-tight float-in float-in-2"
            style={{ fontSize: 'clamp(2.4rem, 5.2vw, 4.4rem)' }}>
            {renderHeading(heading)}
          </h1>
          <p className="mt-6 text-white/70 text-[17px] leading-relaxed max-w-xl float-in float-in-3">
            {sub}
          </p>

          <div className="mt-9 flex flex-wrap gap-3 float-in float-in-3">
            <a href="/#quote"
              className="bg-grad text-white font-semibold px-6 py-3.5 rounded-full hover:opacity-90 transition-opacity">
              Request a quotation
            </a>
            <a href="/#services"
              className="border border-white/25 text-white font-medium px-6 py-3.5 rounded-full hover:bg-white/5 transition-colors">
              Explore services
            </a>
          </div>

          {/* Stats strip */}
          <div className="mt-12 flex gap-8 border-t border-white/10 pt-6 max-w-lg">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display font-bold text-white text-2xl">{s.value}</div>
                <div className="text-white/50 text-[12px] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: a quote-route card to make the hero feel operational */}
        <div className="hidden lg:block float-in float-in-3">
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] backdrop-blur-sm p-6">
            <p className="eyebrow mb-4">Live lane example</p>
            <LaneRow from="Mombasa" to="Nairobi" km="485" />
            <LaneRow from="Nairobi" to="Kampala" km="660" />
            <LaneRow from="Ruiru" to="Kisumu" km="350" />
            <a href="/#quote" className="mt-5 block text-center text-[13px] text-[var(--orchid-300)] hover:text-white transition-colors">
              Price your lane →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Bold the last word of the heading with the brand gradient.
function renderHeading(text) {
  const words = text.split(' ');
  const last = words.pop();
  return (<>{words.join(' ')} <span className="text-grad">{last}</span></>);
}

function LaneRow({ from, to, km }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/8 last:border-0">
      <div className="flex items-center gap-2 text-white/85 text-sm">
        <span>{from}</span>
        <svg width="28" height="8" viewBox="0 0 28 8" className="text-[var(--orchid-400)]">
          <line x1="0" y1="4" x2="22" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3"/>
          <path d="M22 1l5 3-5 3z" fill="currentColor"/>
        </svg>
        <span>{to}</span>
      </div>
      <span className="font-mono text-white/40 text-xs">{km} km</span>
    </div>
  );
}

// Abstract East-Africa corridor with an animated drawing route + pulsing hubs.
function RouteCanvas() {
  return (
    <svg className="absolute right-0 top-0 h-full w-1/2 opacity-[0.5] pointer-events-none hidden md:block"
      viewBox="0 0 500 700" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="rg" x1="0" y1="0" x2="500" y2="700">
          <stop offset="0%" stopColor="#C176B4" />
          <stop offset="100%" stopColor="#6A3E8E" />
        </linearGradient>
      </defs>
      {/* faint graticule */}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={'h'+i} x1="0" y1={i*100} x2="500" y2={i*100} stroke="#ffffff" strokeOpacity="0.04" />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={'v'+i} x1={i*125} y1="0" x2={i*125} y2="700" stroke="#ffffff" strokeOpacity="0.04" />
      ))}
      {/* the route */}
      <path className="route-path"
        d="M120 600 C 180 520, 140 460, 220 420 S 360 360, 300 270 S 220 160, 340 90"
        stroke="url(#rg)" strokeWidth="2.5" strokeLinecap="round" />
      {/* hubs */}
      {[[120,600],[220,420],[300,270],[340,90]].map(([x,y],i) => (
        <g key={i}>
          <circle className="route-dot" cx={x} cy={y} r="6" fill="#C176B4" style={{ animationDelay: `${i*0.3}s` }} />
          <circle cx={x} cy={y} r="11" stroke="#C176B4" strokeOpacity="0.3" fill="none" />
        </g>
      ))}
    </svg>
  );
}
