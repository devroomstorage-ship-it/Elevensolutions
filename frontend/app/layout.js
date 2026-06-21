import './globals.css';

export const metadata = {
  title: 'Eleven Solutions Ltd — Freight & Logistics, Ruiru Kenya',
  description: 'A modern Kenyan freight operator. 13-truck fleet, live tracking, eTIMS-compliant invoicing, and cross-border haulage across East Africa.',
  keywords: 'freight, logistics, trucking, cargo, Ruiru, Nairobi, Kenya, East Africa, eTIMS, cross-border',
  openGraph: {
    title: 'Eleven Solutions Ltd',
    description: 'Freight that keeps East Africa moving.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect + load Google Fonts via <link> — more reliable than @import in CSS */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="site">{children}</body>
    </html>
  );
}
