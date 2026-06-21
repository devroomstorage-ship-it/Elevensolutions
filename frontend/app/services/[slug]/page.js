import Navbar from '@/components/site/Navbar';
import Footer from '@/components/site/Footer';
import Link from 'next/link';
import { getSiteContent } from '@/lib/content';

export default async function ServicePage({ params }) {
  const { slug } = params;
  const { settings, services } = await getSiteContent();
  const svc = services.find((s) => s.slug === slug);

  if (!svc) {
    return (
      <main className="min-h-screen bg-[var(--paper)]">
        <Navbar company={settings.company_name} />
        <div className="max-w-3xl mx-auto px-5 pt-40 pb-32 text-center">
          <h1 className="font-display font-bold text-2xl text-[var(--ink)]">Service not found</h1>
          <Link href="/#services" className="mt-4 inline-block text-[var(--plum-700)] font-semibold">← Back to services</Link>
        </div>
        <Footer settings={settings} />
      </main>
    );
  }

  const features = Array.isArray(svc.features) ? svc.features : [];
  const others = services.filter((s) => s.slug !== slug);

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <Navbar company={settings.company_name} />

      {/* Dark header band */}
      <section className="relative bg-[#2E1A40] pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(800px 400px at 80% 10%, rgba(176,96,160,0.22), transparent 60%)' }} />
        <div className="relative max-w-4xl mx-auto px-5 lg:px-8">
          <Link href="/#services" className="font-mono text-[12px] text-[var(--orchid-300)] hover:text-white transition-colors">← All services</Link>
          <p className="eyebrow mt-6 mb-3">{svc.tagline}</p>
          <h1 className="font-display font-extrabold text-white tracking-tight"
            style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.6rem)' }}>
            {svc.title}
          </h1>
          <p className="mt-5 text-white/70 text-[17px] leading-relaxed max-w-2xl">{svc.description}</p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-5 lg:px-8 py-20">
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
              <span className="w-8 h-8 rounded-lg bg-grad flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
              </span>
              <span className="text-[var(--ink)] text-[15px] font-medium">{f}</span>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-grad p-8 sm:p-10 text-center">
          <h2 className="font-display font-bold text-white text-2xl">Move with {svc.title}</h2>
          <p className="text-white/80 mt-2 text-[15px]">Get a fixed quote within two business hours.</p>
          <Link href="/#quote" className="mt-6 inline-block bg-white text-[var(--plum-700)] font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-colors">
            Request a quotation
          </Link>
        </div>
      </section>

      {/* Other services */}
      <section className="max-w-4xl mx-auto px-5 lg:px-8 pb-24">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-500)] mb-5">Other services</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          {others.map((s) => (
            <Link key={s.slug} href={`/services/${s.slug}`}
              className="rounded-xl border border-[var(--line)] bg-white p-5 hover:border-[var(--orchid-400)] transition-colors">
              <h4 className="font-display font-semibold text-[var(--ink)] text-[15px]">{s.title}</h4>
              <p className="text-[var(--mist)] text-[13px] mt-1">{s.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      <Footer settings={settings} />
    </main>
  );
}
