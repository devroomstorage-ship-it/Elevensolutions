'use client';
import { useState } from 'react';
import Navbar from '@/components/site/Navbar';
import Footer from '@/components/site/Footer';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Minimal client-side settings for chrome; full content comes from the home page.
const SETTINGS = {
  company_name: 'Eleven Solutions Ltd',
  po_box: 'P.O. Box 1977-0203, Ruiru', address_line: 'Ruiru, Kenya',
  phone_1: '0717900400', phone_2: '0711900400', phone_3: '0716900400',
  email_primary: 'info@elevensolutions.co.ke', email_secondary: 'elevensolutionltd@gmail.com',
  company_tagline: 'Cargo that keeps moving.',
};

export default function TrackPage() {
  const [ref, setRef] = useState('');
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });

  const track = async (e) => {
    e.preventDefault();
    if (!ref.trim()) return;
    setState({ status: 'loading', data: null, error: '' });
    try {
      // Public tracking endpoint (returns status only — no sensitive data).
      const res = await fetch(`${BASE}/public/track/${encodeURIComponent(ref.trim())}`);
      if (res.status === 404) { setState({ status: 'notfound', data: null, error: '' }); return; }
      if (!res.ok) throw new Error('Tracking is temporarily unavailable.');
      const data = await res.json();
      setState({ status: 'done', data, error: '' });
    } catch (err) {
      setState({ status: 'error', data: null, error: err.message });
    }
  };

  const STAGES = ['scheduled', 'loading', 'in_transit', 'delivered'];

  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <Navbar company={SETTINGS.company_name} />

      <section className="relative bg-[#2E1A40] pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(800px 400px at 70% 15%, rgba(176,96,160,0.2), transparent 60%)' }} />
        <div className="relative max-w-2xl mx-auto px-5 lg:px-8 text-center">
          <p className="eyebrow mb-3">Where's my cargo?</p>
          <h1 className="font-display font-extrabold text-white tracking-tight"
            style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)' }}>
            Track a shipment
          </h1>
          <p className="mt-4 text-white/70 text-[16px]">Enter the journey reference from your confirmation (e.g. JRN-2026-001).</p>

          <form onSubmit={track} className="mt-8 flex gap-2 max-w-md mx-auto">
            <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())}
              placeholder="JRN-2026-001"
              className="flex-1 font-mono text-sm bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-full px-5 py-3" />
            <button type="submit" disabled={state.status === 'loading'}
              className="bg-grad text-white font-semibold px-6 py-3 rounded-full hover:opacity-90 disabled:opacity-60 transition-opacity">
              {state.status === 'loading' ? '…' : 'Track'}
            </button>
          </form>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 lg:px-8 py-16 min-h-[30vh]">
        {state.status === 'notfound' && (
          <p className="text-center text-[var(--mist)]">No shipment found with that reference. Check the code and try again, or call us.</p>
        )}
        {state.status === 'error' && (
          <p className="text-center text-red-600">{state.error}</p>
        )}
        {state.status === 'done' && state.data && (
          <div className="rounded-2xl border border-[var(--line)] bg-white p-7">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="font-mono text-[12px] text-[var(--mist)]">{state.data.reference}</p>
                <p className="font-display font-bold text-[var(--ink)] text-lg mt-1">{state.data.origin} → {state.data.destination}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-grad text-white capitalize">
                {String(state.data.status || '').replace('_', ' ')}
              </span>
            </div>
            {/* Progress rail */}
            <div className="flex items-center">
              {STAGES.map((stg, i) => {
                const reached = STAGES.indexOf(state.data.status) >= i;
                return (
                  <div key={stg} className="flex-1 flex items-center last:flex-none">
                    <div className={`w-3 h-3 rounded-full ${reached ? 'bg-grad' : 'bg-[var(--line)]'}`} />
                    {i < STAGES.length - 1 && <div className={`flex-1 h-0.5 ${STAGES.indexOf(state.data.status) > i ? 'bg-[var(--orchid-400)]' : 'bg-[var(--line)]'}`} />}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[11px] text-[var(--mist)] capitalize">
              {STAGES.map((s) => <span key={s}>{s.replace('_', ' ')}</span>)}
            </div>
          </div>
        )}
      </section>

      <Footer settings={SETTINGS} />
    </main>
  );
}
