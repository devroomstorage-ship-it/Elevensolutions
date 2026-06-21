import Navbar from '@/components/site/Navbar';
import Footer from '@/components/site/Footer';
import Link from 'next/link';
import { getSiteContent } from '@/lib/content';

export const metadata = { title: 'About — Eleven Solutions Ltd' };

export default async function AboutPage() {
  const { settings, areas } = await getSiteContent();
  const values = [
    { title: 'Reliability', text: 'A truck that shows up and cargo that arrives — the basics, done consistently.' },
    { title: 'Transparency', text: 'Live tracking and compliant invoicing mean you always know where things stand.' },
    { title: 'Coverage', text: 'From the coast to the lake to across the border, one operator handles the whole corridor.' },
  ];

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <Navbar company={settings.company_name} />

      <section className="relative bg-[#2E1A40] pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(800px 400px at 80% 10%, rgba(176,96,160,0.2), transparent 60%)' }} />
        <div className="relative max-w-4xl mx-auto px-5 lg:px-8">
          <p className="eyebrow mb-3">Who we are</p>
          <h1 className="font-display font-extrabold text-white tracking-tight"
            style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.6rem)' }}>
            A modern Kenyan freight operator
          </h1>
          <p className="mt-5 text-white/70 text-[17px] leading-relaxed max-w-2xl">
            Based in Ruiru, Eleven Solutions runs a {settings.stat_trucks || '13'}-truck fleet across Kenya and the
            wider East African corridor. We pair dependable haulage with the kind of digital backbone — live tracking,
            eTIMS-compliant invoicing, role-based operations — that larger logistics businesses rely on.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-5 lg:px-8 py-20">
        <div className="grid sm:grid-cols-3 gap-5">
          {values.map((v, i) => (
            <div key={v.title} className="rounded-2xl border border-[var(--line)] bg-white p-6">
              <span className="font-mono text-[13px] text-grad font-medium">0{i + 1}</span>
              <h3 className="font-display font-semibold text-[var(--ink)] text-lg mt-3">{v.title}</h3>
              <p className="text-[var(--mist)] text-[14px] mt-2 leading-relaxed">{v.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-grad p-8 sm:p-10 text-center">
          <h2 className="font-display font-bold text-white text-2xl">Put our fleet to work</h2>
          <p className="text-white/80 mt-2">Reaching {new Set(areas.map(a => a.country)).size} countries across East Africa.</p>
          <Link href="/#quote" className="mt-6 inline-block bg-white text-[var(--plum-700)] font-semibold px-6 py-3 rounded-full hover:bg-white/90 transition-colors">
            Request a quotation
          </Link>
        </div>
      </section>

      <Footer settings={settings} />
    </main>
  );
}
