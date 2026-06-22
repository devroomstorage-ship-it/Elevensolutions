'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post } from '@/lib/api';

export default function EmailSettingsPage() {
  const [form, setForm] = useState({
    email_from_address: '', email_from_name: '', email_reply_to: '',
    email_from_quotes: '', email_from_invoices: '', email_from_ack: '',
  });
  const [original, setOriginal]   = useState(null);   // for "dirty" detection
  const [sgOK, setSgOK]           = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ kind: '', text: '' });

  // Test-send state
  const [testTo, setTestTo]       = useState('');
  const [testPurpose, setTestPur] = useState('quotes');
  const [testing, setTesting]     = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    get('/email-settings')
      .then((r) => {
        setForm(r.settings);
        setOriginal(r.settings);
        setSgOK(!!r.sendgridConfigured);
      })
      .catch((e) => setMsg({ kind: 'error', text: e.message || 'Could not load settings.' }))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = original && JSON.stringify(form) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    setMsg({ kind: '', text: '' });
    try {
      await patch('/email-settings', form);
      setOriginal(form);
      setMsg({ kind: 'success', text: 'Email settings saved.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save.' });
    } finally { setSaving(false); }
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
          <h1 className="text-base font-semibold text-gray-900 mt-1">Email &amp; senders</h1>
        </div>

        <div className="p-6 max-w-3xl space-y-5">
          {/* SendGrid status */}
          {!loading && !sgOK && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1">SendGrid is not configured</p>
              <p className="text-xs leading-relaxed">
                The <code className="bg-white px-1 rounded">SENDGRID_API_KEY</code> environment variable on the server isn't set
                (or doesn't start with <code className="bg-white px-1 rounded">SG.</code>). Emails will not send until that's
                fixed in the server's <code className="bg-white px-1 rounded">.env</code> file. The settings on this page still
                apply once SendGrid is set up.
              </p>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold mb-1">About SendGrid verified senders</p>
            <p>
              SendGrid only accepts emails sent from <strong>verified</strong> addresses or domains. Before using a from-address
              here, verify it on{' '}
              <a href="https://app.sendgrid.com/settings/sender_auth" target="_blank" rel="noreferrer"
                className="underline text-blue-700 hover:text-blue-900">SendGrid → Sender Authentication</a>.
              Verifying the entire <code className="bg-white px-1 rounded">elevensolutions.co.ke</code> domain via DNS is recommended:
              once done, <em>any</em> address at that domain works without further setup.
            </p>
          </div>

          {/* Form */}
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
          ) : (
            <>
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Default sender</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field
                    label="From address *"
                    helper="The default address quotation and invoice emails will be sent from."
                    value={form.email_from_address} onChange={set('email_from_address')}
                    placeholder="info@elevensolutions.co.ke"
                  />
                  <Field
                    label="From name"
                    helper="What the client sees as the sender, e.g. in their inbox."
                    value={form.email_from_name} onChange={set('email_from_name')}
                    placeholder="Eleven Solutions Limited"
                  />
                  <Field
                    label="Reply-to (optional)"
                    helper="When clients hit Reply, the email goes here instead."
                    value={form.email_reply_to} onChange={set('email_reply_to')}
                    placeholder="(leave blank to use the From address)"
                  />
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Per-purpose overrides</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Optional. Leave blank to use the default. Each address must be verified on SendGrid.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field
                    label="Quotations"
                    helper="Used for formal quotes (e.g. sales@…)."
                    value={form.email_from_quotes} onChange={set('email_from_quotes')}
                    placeholder="(default)"
                  />
                  <Field
                    label="Invoices"
                    helper="Used for invoices (e.g. accounts@…)."
                    value={form.email_from_invoices} onChange={set('email_from_invoices')}
                    placeholder="(default)"
                  />
                  <Field
                    label="Acknowledgements"
                    helper="The 'we got your request' email."
                    value={form.email_from_ack} onChange={set('email_from_ack')}
                    placeholder="(default)"
                  />
                </div>
              </div>

              {msg.text && (
                <div className={`rounded-xl px-4 py-3 text-sm ${
                  msg.kind === 'success' ? 'bg-green-50 border border-green-100 text-green-800'
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
                <p className="text-xs text-gray-500 mb-3">
                  Sends a quick test using the resolved sender for the chosen purpose. Use this to confirm SendGrid accepts the from-address.
                </p>
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
                  <button onClick={sendTest} disabled={!testTo || testing || !sgOK}
                    className="bg-[#0F1E2E] hover:bg-[#1a3556] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md">
                    {testing ? 'Sending…' : 'Send test'}
                  </button>
                </div>
                {!sgOK && (
                  <p className="text-xs text-gray-400 mt-2">Test send is disabled until SendGrid is configured.</p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, helper, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type="text" value={value || ''} onChange={onChange} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
      {helper && <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{helper}</p>}
    </div>
  );
}
