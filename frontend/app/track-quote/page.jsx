'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function StatusBadge({ label }) {
  return (
    <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
      {label || 'Received'}
    </span>
  );
}

export default function TrackQuotePage() {
  const [step, setStep] = useState('reference');
  const [reference, setReference] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const clearAlerts = () => {
    setMessage('');
    setError('');
  };

  async function requestOtp(e) {
    e.preventDefault();
    clearAlerts();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/public/quotes/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send OTP.');
      setMessage(data.message || 'Verification code sent.');
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    clearAlerts();
    setLoading(true);
    try {
      const verifyRes = await fetch(`${API_URL}/public/quotes/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, otp }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Invalid OTP.');

      const statusRes = await fetch(`${API_URL}/public/quotes/status`, {
        headers: { Authorization: `Bearer ${verifyData.token}` },
      });
      const statusData = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusData.error || 'Could not load quote status.');

      setToken(verifyData.token);
      setQuote(statusData);
      setStep('status');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    if (!token) return;
    clearAlerts();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/public/quotes/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not refresh quote status.');
      setQuote(data);
      setMessage('Status refreshed.');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Quote Tracking</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Track your quote</h1>
        <p className="mt-3 text-slate-600">
          Enter your Eleven Solutions quote reference number. We will send a verification code to the email linked to the quote.
        </p>
      </div>

      {message && <div className="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700">{message}</div>}
      {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {step === 'reference' && (
        <form onSubmit={requestOtp} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Quote reference number</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="E11-K8F4M2"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-orange-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-5 rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Sending code...' : 'Send verification code'}
          </button>
        </form>
      )}

      {step === 'otp' && (
        <form onSubmit={verifyOtp} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-slate-600">Reference: <strong>{reference}</strong></p>
          <label className="block text-sm font-medium text-slate-700">6-digit verification code</label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="482916"
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-orange-500"
            required
          />
          <div className="mt-5 flex gap-3">
            <button type="submit" disabled={loading} className="rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              {loading ? 'Verifying...' : 'View quote status'}
            </button>
            <button type="button" onClick={() => setStep('reference')} className="rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700">
              Change reference
            </button>
          </div>
        </form>
      )}

      {step === 'status' && quote && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm text-slate-500">Quote Reference</p>
              <h2 className="text-2xl font-bold text-slate-900">{quote.reference}</h2>
            </div>
            <StatusBadge label={quote.statusLabel} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Pickup" value={quote.origin} />
            <Info label="Destination" value={quote.destination} />
            <Info label="Cargo" value={quote.cargoType} />
            <Info label="Weight" value={quote.weightTons ? `${quote.weightTons} tons` : '—'} />
            <Info label="Pickup date" value={quote.pickupDate ? new Date(quote.pickupDate).toLocaleDateString() : '—'} />
            <Info label="Submitted" value={quote.submittedAt ? new Date(quote.submittedAt).toLocaleString() : '—'} />
          </div>

          {quote.quotation?.available && (
            <div className="mt-6 rounded-xl bg-slate-50 p-5">
              <h3 className="font-semibold text-slate-900">Quotation</h3>
              <p className="mt-2 text-slate-700">Amount: <strong>{quote.quotation.amount || 'Available in the quotation document'}</strong></p>
            </div>
          )}

          {quote.invoice && (
            <div className="mt-6 rounded-xl bg-slate-50 p-5">
              <h3 className="font-semibold text-slate-900">Invoice</h3>
              <p className="mt-2 text-slate-700">Invoice No: <strong>{quote.invoice.invoiceNumber || '—'}</strong></p>
              <p className="text-slate-700">Status: <strong>{quote.invoice.status}</strong></p>
              {quote.invoice.pdfUrl && (
                <a href={quote.invoice.pdfUrl} target="_blank" className="mt-3 inline-block text-orange-600 underline">
                  View invoice
                </a>
              )}
            </div>
          )}

          <button onClick={refreshStatus} disabled={loading} className="mt-6 rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 disabled:opacity-60">
            {loading ? 'Refreshing...' : 'Refresh status'}
          </button>
        </section>
      )}
    </main>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value || '—'}</p>
    </div>
  );
}
