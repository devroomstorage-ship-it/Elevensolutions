'use client';
import { useMemo, useState } from 'react';
import { CARGO_TYPES } from '@/lib/quoteOptions';
import { normalizeDisplayPhone, telHref } from '@/lib/phone';
import PlacesAutocomplete from '@/components/admin/PlacesAutocomplete';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Format in LOCAL time — toISOString() shifts to UTC, which for timezones
// east of UTC (Kenya is UTC+3) turns "tomorrow" back into "today" and makes
// the prefilled date fail the input's own min= check, silently blocking submit.
function tomorrowISODate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function QuoteForm({ settings }) {
  const minPickupDate = useMemo(() => tomorrowISODate(), []);
  const [form, setForm] = useState({
    companyName: '',
    contactEmail: '',
    contactPhone: '+254',
    pickupDate: minPickupDate,
    origin: '',
    destination: '',
    cargoType: '',
    weightTons: '',
    notes: '',
  });
  const [state, setState] = useState({ status: 'idle', message: '', reference: '' });
  // Coordinates arrive only when the customer picks a Google suggestion.
  const [coords, setCoords] = useState({ pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null });
  const [route, setRoute] = useState({ status: 'idle', distanceKm: null, durationMin: null, error: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const canCalcRoute = coords.pickupLat != null && coords.dropoffLat != null;

  const calcRoute = async () => {
    setRoute({ status: 'loading', distanceKm: null, durationMin: null, error: '' });
    try {
      const res = await fetch(`${BASE}/public/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not calculate the route.');
      setRoute({ status: 'done', distanceKm: data.distanceKm, durationMin: data.durationMin, error: '' });
    } catch (err) {
      setRoute({ status: 'error', distanceKm: null, durationMin: null, error: err.message });
    }
  };

  const phones = [settings?.phone_1, settings?.phone_2, settings?.phone_3]
    .filter(Boolean)
    .map((p) => normalizeDisplayPhone(p));

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', message: '', reference: '' });

    const weight = form.weightTons === '' ? undefined : Number(form.weightTons);
    if (weight !== undefined && weight < 0) {
      setState({ status: 'error', message: 'Weight cannot be negative.', reference: '' });
      return;
    }

    if (!/^\+[1-9]\d{7,14}$/.test(form.contactPhone.replace(/[\s\-()]/g, ''))) {
      setState({ status: 'error', message: 'Enter a phone number with country code, e.g. +254717900400.', reference: '' });
      return;
    }

    if (!form.pickupDate || form.pickupDate < minPickupDate) {
      setState({ status: 'error', message: 'Pickup date must be after today.', reference: '' });
      return;
    }

    if (!form.origin.trim() || !form.destination.trim()) {
      setState({ status: 'error', message: 'Enter both the pickup location and the drop-off destination.', reference: '' });
      return;
    }

    try {
      const res = await fetch(`${BASE}/public/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, weightTons: weight }),
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
            Send the route, pickup date, contact number and cargo details — we reply with a fixed quote within two business hours. Prefer to talk?
          </p>
          <div className="mt-6 space-y-2 font-mono text-[14px] text-[var(--orchid-300)]">
            {phones.map((p) => (
              <a key={p} href={telHref(p)} className="block hover:text-white transition-colors">{p}</a>
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
              <Field
                label="Phone number with country code"
                type="tel"
                value={form.contactPhone}
                onChange={set('contactPhone')}
                placeholder="+254717900400"
                pattern="^\+[1-9][0-9]{7,14}$"
                required
              />
              <Field
                label="Pickup date"
                type="date"
                value={form.pickupDate}
                onChange={set('pickupDate')}
                min={minPickupDate}
                required
              />
              <PlacesAutocomplete
                label="Pickup location *"
                value={form.origin}
                onChange={(v) => {
                  setForm((f) => ({ ...f, origin: v }));
                  setCoords((c) => ({ ...c, pickupLat: null, pickupLng: null }));
                  setRoute({ status: 'idle', distanceKm: null, durationMin: null, error: '' });
                }}
                onSelect={(s) => {
                  setForm((f) => ({ ...f, origin: s.address }));
                  setCoords((c) => ({ ...c, pickupLat: s.lat, pickupLng: s.lng }));
                }}
              />
              <PlacesAutocomplete
                label="Drop-off / destination *"
                value={form.destination}
                onChange={(v) => {
                  setForm((f) => ({ ...f, destination: v }));
                  setCoords((c) => ({ ...c, dropoffLat: null, dropoffLng: null }));
                  setRoute({ status: 'idle', distanceKm: null, durationMin: null, error: '' });
                }}
                onSelect={(s) => {
                  setForm((f) => ({ ...f, destination: s.address }));
                  setCoords((c) => ({ ...c, dropoffLat: s.lat, dropoffLng: s.lng }));
                }}
              />
              {canCalcRoute && (
                <div className="sm:col-span-2 flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={calcRoute} disabled={route.status === 'loading'}
                    className="text-sm font-medium px-4 py-2 rounded-full border border-[var(--plum-700)] text-[var(--plum-700)] hover:bg-[var(--paper)] disabled:opacity-50 transition-colors">
                    {route.status === 'loading' ? 'Calculating…' : '📍 Calculate route'}
                  </button>
                  {route.status === 'done' && (
                    <p className="text-sm text-[var(--ink)]">
                      ≈ <strong>{route.distanceKm} km</strong>
                      {route.durationMin ? ` · about ${Math.floor(route.durationMin / 60)}h ${route.durationMin % 60}m drive` : ''}
                    </p>
                  )}
                  {route.status === 'error' && (
                    <p className="text-sm text-red-600">{route.error}</p>
                  )}
                </div>
              )}
              <SelectField label="Cargo type" value={form.cargoType} onChange={set('cargoType')} required>
                <option value="">Select cargo type</option>
                {CARGO_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </SelectField>
              <Field
                label="Weight (tonnes)"
                type="number"
                value={form.weightTons}
                onChange={set('weightTons')}
                min="0"
                step="0.01"
              />
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

function Field({ label, value, onChange, type = 'text', required, placeholder, min, step, pattern }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--ink)] mb-1.5">
        {label}{required && <span className="text-[var(--orchid-500)]"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        min={min}
        step={step}
        pattern={pattern}
        className="w-full text-sm border border-[var(--line)] rounded-lg px-3 py-2.5"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, required, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--ink)] mb-1.5">
        {label}{required && <span className="text-[var(--orchid-500)]"> *</span>}
      </label>
      <select
        value={value}
        onChange={onChange}
        required={required}
        className="w-full text-sm border border-[var(--line)] rounded-lg px-3 py-2.5 bg-white"
      >
        {children}
      </select>
    </div>
  );
}