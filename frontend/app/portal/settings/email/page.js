'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post } from '@/lib/api';

export default function EmailSettingsPage() {
  const [form, setForm] = useState({
    email_from_address: '', email_from_name: '', email_reply_to: '',
    email_from_quotes: '', email_from_invoices: '', email_from_ack: '',
    email_smtp_host: '', email_smtp_port: '', email_smtp_user: '', email_smtp_pass: '',
  });
  const [original, setOriginal]     = useState(null);
  const [smtpConfigured, setSmtpOK] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState({ kind: '', text: '' });

  const [testTo, setTestTo]         = useState('');
  const [testPurpose, setTestPur]   = useState('quotes');
  const [testing, setTesting]       = useState(false);
  const [verifying, setVerifying]   = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    get('/email-settings')
      .then((r) => {
        setForm(r.settings);
        setOriginal(r.settings);
        setSmtpOK(!!r.smtpConfigured);
      })
      .catch((e) => setMsg({ kind: 'error', text: e.message || 'Could not load settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = original && JSON.stringify(form) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    setMsg({ kind: '', text: '' });
    try {
      // Don't re-send the masking sentinel — only send the password if it was edited.
      const body = { ...form };
      if (body.email_smtp_pass === '__SET__') delete body.email_smtp_pass;
      await patch('/email-settings', body);
      // Re-fetch to get the fresh masked state
      const r = await get('/email-settings');
      setForm(r.settings);
      setOriginal(r.settings);
      setSmtpOK(!!r.smtpConfigured);
      setMsg({ kind: 'success', text: 'Email settings saved.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save.' });
    } finally { setSaving(false); }
  };

  const verify = async () => {
    setVerifying(true);
    setMsg({ kind: '', text: '' });
    try {
      const r = await post('/email-settings/verify');
      setMsg({ kind: 'success', text: r.message || 'SMTP credentials accepted.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'SMTP verification failed.' });
    } finally { setVerifying(false); }
  };

  const sendTest = async () => {
    if (!testTo) return;
    setTesting(true);
    setMsg({ kind: '', text: '' });
    try {
      const r = await post('/email-settings/test', { to: testTo, purpose: testPurpose });
      setMsg({ kind: 'success', text: r.message || 'Test email sent.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Test send failed.' });
    } finally { setTesting(false); }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <a href="/portal/settings" className="text-xs text-gray-400 hover:text-gray-600">← Settings</a>
          <h1 className="text-base font-semibold text-gray-900 mt-1">Email &amp; SMTP</h1>
        </div>

        <div className="p-6 max-w-3xl space-y-5">
          {/* Status banner */}
          {!loading && !smtpConfigured && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1">SMTP is not fully configured</p>
              <p className="text-xs leading-relaxed">
                Host, user and password must all be set before emails will send.
                For Gmail, see the instructions at the bottom of this page.
              </p>
            </div>
          )}

          {/* Gmail App Password help */}
          <details className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900">
            <summary className="cursor-pointer font-semibold text-sm">How to set up Gmail (App Password)</summary>
            <ol className="mt-3 space-y-2 leading-relaxed list-decimal list-inside">
              <li>Enable 2-Step Verification on your Gmail account at
                <a className="underline ml-1" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">myaccount.google.com/security</a>.</li>
              <li>Visit <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a> and generate a new App Password (any name, e.g. "Eleven Solutions API").</li>
              <li>Google gives you a 16-character code. Paste it into the <strong>SMTP password</strong> field below.</li>
              <li>SMTP host stays <code className="bg-white px-1 rounded">smtp.gmail.com</code>, port <code className="bg-white px-1 rounded">465</code>.</li>
              <li>SMTP user is your full Gmail address.</li>
            </ol>
            <p className="mt-3 text-xs">Gmail allows 500 emails per day per account — more than enough for quotations and invoices.</p>
          </details>

          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : (
            <>
              {/* SMTP server */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">SMTP server</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Gmail today (defaults below). Later: change these four fields to your Safaricom SMTP details — no code change needed.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="SMTP host" value={form.email_smtp_host} onChange={set('email_smtp_host')} placeholder="smtp.gmail.com" />
                  <Field label="SMTP port" type="number" value={form.email_smtp_port} onChange={set('email_smtp_port')} placeholder="465" />
                  <Field label="SMTP user (your email)" value={form.email_smtp_user} onChange={set('email_smtp_user')} placeholder="devroomstorage@gmail.com" />
                  <Field
                    label="SMTP password (App Password)"
                    type="password"
                    value={form.email_smtp_pass}
                    onChange={set('email_smtp_pass')}
                    placeholder={form.email_smtp_pass === '__SET__' ? '••••••••••••••••' : '16-char App Password (no spaces)'}
                    onFocus={(e) => { if (form.email_smtp_pass === '__SET__') setForm({ ...form, email_smtp_pass: '' }); }}
                  />
                </div>
                <div className="mt-3">
                  <button onClick={verify} disabled={verifying || !smtpConfigured}
                    className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 disabled:opacity-50">
                    {verifying ? 'Verifying…' : 'Verify connection'}
                  </button>
                  <span className="text-xs text-gray-400 ml-2">(connects to SMTP and tries to log in, doesn't send anything)</span>
                </div>
              </div>

              {/* Default sender */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Default sender</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="From address" helper="The default address quote and invoice emails are sent from. With Gmail this should match the SMTP user above."
                    value={form.email_from_address} onChange={set('email_from_address')} placeholder="devroomstorage@gmail.com" />
                  <Field label="From name" helper="What clients see as the sender in their inbox."
                    value={form.email_from_name} onChange={set('email_from_name')} placeholder="Eleven Solutions Limited" />
                  <Field label="Reply-to (optional)" helper="When clients hit Reply, the email goes here instead."
                    value={form.email_reply_to} onChange={set('email_reply_to')} placeholder="(leave blank to use From)" />
                </div>
              </div>

              {/* Per-purpose overrides */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Per-purpose overrides</h2>
                <p className="text-xs text-gray-500 mb-4">Optional. Leave blank to use the default. With Gmail, you can only send from the address that matches the SMTP user.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Quotations" value={form.email_from_quotes}   onChange={set('email_from_quotes')}   placeholder="(default)" />
                  <Field label="Invoices"    value={form.email_from_invoices} onChange={set('email_from_invoices')} placeholder="(default)" />
                  <Field label="Acknowledgements" value={form.email_from_ack} onChange={set('email_from_ack')}      placeholder="(default)" />
                </div>
              </div>

              {msg.text && (
                <div className={`rounded-xl px-4 py-3 text-sm ${
                  msg.kind === 'success'
                    ? 'bg-green-50 border border-green-100 text-green-800'
                    : 'bg-red-50 border border-red-100 text-red-800'}`}>
                  {msg.text}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={save} disabled={!isDirty || saving}
                  className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-md">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>

              {/* Test send */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Send test email</h2>
                <p className="text-xs text-gray-500 mb-3">Confirms the SMTP credentials work end to end.</p>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Recipient</label>
                    <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full text-sm border border-gray-200 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                    <select value={testPurpose} onChange={(e) => setTestPur(e.target.value)}
                      className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
                      <option value="quotes">Quotations</option>
                      <option value="invoices">Invoices</option>
                      <option value="ack">Acknowledgements</option>
                    </select>
                  </div>
                  <button onClick={sendTest} disabled={!testTo || testing || !smtpConfigured}
                    className="bg-[#0F1E2E] hover:bg-[#1a3556] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
                    {testing ? 'Sending…' : 'Send test'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, helper, value, onChange, placeholder, type = 'text', onFocus }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={onChange} onFocus={onFocus} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
      {helper && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{helper}</p>}
    </div>
  );
}
