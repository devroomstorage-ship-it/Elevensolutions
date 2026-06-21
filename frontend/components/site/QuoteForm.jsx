'use client';
import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function QuoteForm({ settings }) {
  const [form, setForm] = useState({
    companyName: '', contactEmail: '', origin: '', destination: '',
    cargoType: '', weightTons: '', notes: '',
  });
  const [state, setState] = useState({ status: 'idle', message: '', reference: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', message: '', reference: '' });
    try {
      const res = await fetch(`${BASE}/public/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, weightTons: form.weightTons || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setState({ status: 'done', message: data.message, reference: data.reference });
    } catch (err) {
      setState({ status: 'error', message: err.message, reference: '' });
    }
  };

  return (
    <section id="quote" className="relative bg-[#3A2150] py-24 overflow-hidden">
      <div className="absolute inset-0"
        style={{ background: 'radial-gradient(800px 500px at 15% 20%, rgba(176,96,160,0.22), transparent 60%)' }} />
      <div className="relative max-w-5xl mx-auto px-5 lg:px-8 grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
        <div>
          <p className="eyebrow mb-3">Get moving</p>
          <h2 className="font-display font-bold text-white tracking-tight"
            style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)' }}>
            Request a quotation
          </h2>
          <p className="mt-4 text-white/65 text-[16px] leading-relaxed">
            Send the route and cargo details — we reply with a fixed quote within two business hours. Prefer to talk?
          </p>
          <div className="mt-6 space-y-2 font-mono text-[14px] text-[var(--orchid-300)]">
            {[settings?.phone_1, settings?.phone_2, settings?.phone_3].filter(Boolean).map((p) => (
              <a key={p} href={`tel:${p}`} className="block hover:text-white transition-colors">{p}</a>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-2xl">
          {state.status === 'done' ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-grad flex items-center justify-center mx-auto mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <h3 className="font-display font-bold text-[var(--ink)] text-xl">Request received</h3>
              <p className="text-[var(--mist)] text-sm mt-2 max-w-sm mx-auto">{state.message}</p>
              {state.reference && (
                <p className="mt-4 font-mono text-sm text-[var(--plum-700)] bg-[var(--paper)] inline-block px-3 py-1.5 rounded-lg">
                  Ref: {state.reference}
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
              <Field label="Company name" value={form.companyName} onChange={set('companyName')} required />
              <Field label="Email" type="email" value={form.contactEmail} onChange={set('contactEmail')} required />
              <Field label="Pickup (origin)" value={form.origin} onChange={set('origin')} required />
              <Field label="Drop-off (destination)" value={form.destination} onChange={set('destination')} required />
              <Field label="Cargo type" value={form.cargoType} onChange={set('cargoType')} />
              <Field label="Weight (tonnes)" type="number" value={form.weightTons} onChange={set('weightTons')} />
              <div className="sm:col-span-2">
                <label className="block text-[13px] font-medium text-[var(--ink)] mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={set('notes')} rows={3}
                  className="w-full text-sm border border-[var(--line)] rounded-lg px-3 py-2.5 resize-none" />
              </div>
              {state.status === 'error' && (
                <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.message}</p>
              )}
              <button type="submit" disabled={state.status === 'sending'}
                className="sm:col-span-2 bg-grad text-white font-semibold py-3.5 rounded-full hover:opacity-90 disabled:opacity-60 transition-opacity">
                {state.status === 'sending' ? 'Sending…' : 'Send request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--ink)] mb-1.5">
        {label}{required && <span className="text-[var(--orchid-500)]"> *</span>}
      </label>
      <input type={type} value={value} onChange={onChange} required={required}
        className="w-full text-sm border border-[var(--line)] rounded-lg px-3 py-2.5" />
    </div>
  );
}
