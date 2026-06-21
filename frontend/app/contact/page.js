import Navbar from '@/components/site/Navbar';
import Footer from '@/components/site/Footer';
import QuoteForm from '@/components/site/QuoteForm';
import { getSiteContent } from '@/lib/content';

export const metadata = { title: 'Contact — Eleven Solutions Ltd' };

export default async function ContactPage() {
  const { settings } = await getSiteContent();
  const phones = [settings.phone_1, settings.phone_2, settings.phone_3].filter(Boolean);

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <Navbar company={settings.company_name} />

      <section className="relative bg-[#2E1A40] pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(800px 400px at 75% 15%, rgba(176,96,160,0.2), transparent 60%)' }} />
        <div className="relative max-w-5xl mx-auto px-5 lg:px-8">
          <p className="eyebrow mb-3">Talk to us</p>
          <h1 className="font-display font-extrabold text-white tracking-tight"
            style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)' }}>
            Get in touch
          </h1>
          <p className="mt-4 text-white/70 text-[17px] max-w-xl">
            Call the operations desk, email us, or send a quote request — whichever is easiest.
          </p>

          <div className="mt-10 grid sm:grid-cols-3 gap-5">
            <ContactCard title="Call us" lines={phones} hrefPrefix="tel:" />
            <ContactCard title="Email us" lines={[settings.email_primary, settings.email_secondary].filter(Boolean)} hrefPrefix="mailto:" />
            <ContactCard title="Find us" lines={[settings.po_box, settings.address_line].filter(Boolean)} />
          </div>
        </div>
      </section>

      <QuoteForm settings={settings} />
      <Footer settings={settings} />
    </main>
  );
}

function ContactCard({ title, lines, hrefPrefix }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] backdrop-blur-sm p-6">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--orchid-300)] mb-3">{title}</h3>
      <div className="space-y-1.5">
        {lines.map((l) => hrefPrefix ? (
          <a key={l} href={`${hrefPrefix}${l}`} className="block text-white/85 text-[15px] hover:text-white transition-colors break-words">{l}</a>
        ) : (
          <p key={l} className="text-white/85 text-[15px]">{l}</p>
        ))}
      </div>
    </div>
  );
}
