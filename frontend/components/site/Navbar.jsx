'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const LINKS = [
  { href: '/#services', label: 'Services' },
  { href: '/#coverage', label: 'Coverage' },
  { href: '/#process', label: 'How it works' },
  { href: '/track', label: 'Track' },
  { href: '/contact', label: 'Contact' },
];

export default function Navbar({ company = 'Eleven Solutions Ltd' }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#2E1A40]/90 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Logo />
          <span className="font-display font-bold text-white text-[15px] tracking-tight">
            Eleven<span className="text-[var(--orchid-300)]"> Solutions</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="text-[13px] text-white/70 hover:text-white transition-colors font-medium">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/portal/login"
            className="hidden sm:inline text-[13px] text-white/60 hover:text-white transition-colors">
            Staff login
          </Link>
          <a href="/#quote"
            className="bg-grad text-white text-[13px] font-semibold px-4 py-2 rounded-full hover:opacity-90 transition-opacity">
            Get a quote
          </a>
          <button onClick={() => setOpen(!open)} className="md:hidden text-white p-1" aria-label="Menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M18 6 6 18M6 6l12 12"/> : <path d="M3 12h18M3 6h18M3 18h18"/>}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden bg-[#2E1A40] border-t border-white/10 px-5 py-3 flex flex-col gap-1">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white py-2 text-sm">{l.label}</a>
          ))}
          <Link href="/portal/login" className="text-white/50 py-2 text-sm">Staff login</Link>
        </nav>
      )}
    </header>
  );
}

// Stylised "11" mark echoing the logo's gradient bars.
function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0%" stopColor="#503070" />
          <stop offset="100%" stopColor="#B060A0" />
        </linearGradient>
      </defs>
      <path d="M9 6 C5 9 5 31 9 34 L14 34 L14 6 Z" fill="url(#lg)" />
      <rect x="19" y="6" width="6" height="28" rx="2" fill="url(#lg)" />
      <rect x="28" y="6" width="4" height="28" rx="2" fill="url(#lg)" opacity="0.55" />
    </svg>
  );
}
