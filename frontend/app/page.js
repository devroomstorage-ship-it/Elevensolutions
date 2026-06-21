import Navbar from '@/components/site/Navbar';
import Hero from '@/components/site/Hero';
import Services from '@/components/site/Services';
import Coverage from '@/components/site/Coverage';
import Process from '@/components/site/Process';
import QuoteForm from '@/components/site/QuoteForm';
import Footer from '@/components/site/Footer';
import { getSiteContent, section } from '@/lib/content';

export default async function HomePage() {
  const { settings, sections, services, areas, testimonials } = await getSiteContent();

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <Navbar company={settings.company_name} />
      <Hero settings={settings} />
      <Services services={services} />
      <Coverage areas={areas} />
      <Process section={section(sections, 'process')} testimonials={testimonials} />
      <QuoteForm settings={settings} />
      <Footer settings={settings} />
    </main>
  );
}
