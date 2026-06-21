'use client';

export default function Process({ section, testimonials = [] }) {
  const steps = section?.data?.steps || [
    { n: 1, title: 'Request a quote', text: 'Tell us your route, cargo and weight. Online or by phone.' },
    { n: 2, title: 'We confirm capacity', text: 'We check fleet availability and send a fixed quotation, fast.' },
    { n: 3, title: 'Track in transit', text: 'Live updates from pickup to drop-off, with eTIMS invoicing.' },
    { n: 4, title: 'Delivered and invoiced', text: 'Proof of delivery and a compliant invoice, automatically.' },
  ];
  const t = testimonials[0];

  return (
    <section id="process" className="bg-[var(--paper)] py-24">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        <div className="max-w-2xl mb-14">
          <p className="eyebrow mb-3">{section?.heading || 'How it works'}</p>
          <h2 className="font-display font-bold text-[var(--ink)] tracking-tight"
            style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)' }}>
            {section?.subheading || 'From quote to delivery in four steps'}
          </h2>
        </div>

        {/* The steps ARE a real sequence, so numbered markers carry meaning here. */}
        <div className="grid md:grid-cols-4 gap-0 relative">
          {steps.map((s, i) => (
            <div key={s.n} className="relative px-1 md:px-5 first:pl-0 pb-8 md:pb-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[13px] text-grad font-medium">0{s.n}</span>
                <span className="flex-1 h-px bg-[var(--line)]" />
              </div>
              <h3 className="font-display font-semibold text-[var(--ink)] text-[17px] mb-2">{s.title}</h3>
              <p className="text-[var(--mist)] text-[14px] leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>

        {t && (
          <figure className="mt-20 max-w-3xl mx-auto text-center">
            <div className="flex justify-center gap-1 mb-5">
              {Array.from({ length: t.rating || 5 }).map((_, i) => (
                <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="#B060A0">
                  <path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/>
                </svg>
              ))}
            </div>
            <blockquote className="font-display font-semibold text-[var(--ink)] leading-snug"
              style={{ fontSize: 'clamp(1.3rem, 2.4vw, 1.9rem)' }}>
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-5 text-[var(--mist)] text-sm">
              <span className="text-[var(--ink)] font-semibold">{t.author}</span>
              {t.role && <> · {t.role}</>}{t.company && <> · {t.company}</>}
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  );
}
