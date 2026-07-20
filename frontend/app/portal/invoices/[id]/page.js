'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Cookies from 'js-cookie';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, BASE } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pending' },
  { value: 'sent',      label: 'Sent' },
  { value: 'paid',      label: 'Paid' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];
const STATUS_COLOR = {
  pending:  'bg-amber-100 text-amber-800',
  sent:     'bg-blue-100 text-blue-800',
  paid:     'bg-green-100 text-green-800',
  overdue:  'bg-red-100 text-red-800',
  cancelled:'bg-gray-100 text-gray-700',
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  // KRA ETR editing state
  const [etr, setEtr]         = useState('');
  const [savingEtr, setSavingEtr] = useState(false);
  const [msg, setMsg]         = useState({ kind: '', text: '' });

  const load = () => {
    get(`/invoices/${id}`)
      .then((inv) => {
        setInvoice(inv);
        setEtr(inv.kra_etr_code || '');
      })
      .catch((e) => setMsg({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); }, [id]);

  const saveEtr = async () => {
    setSavingEtr(true);
    setMsg({ kind: '', text: '' });
    try {
      // Send null when user cleared the field; send trimmed value otherwise
      const value = etr.trim() || null;
      const updated = await patch(`/invoices/${id}`, { kraEtrCode: value });
      setInvoice(updated);
      setMsg({ kind: 'success', text: value ? 'KRA ETR code saved.' : 'KRA ETR code cleared.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save.' });
    } finally {
      setSavingEtr(false);
    }
  };

  // window.open on a bare URL can't carry the Authorization header the
  // backend requires, so fetch the PDF as a blob (with the header) and open
  // the resulting object URL instead.
  const downloadPdf = async () => {
    try {
      const token = Cookies.get('es_access_token');
      const res = await fetch(`${BASE}/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not download the invoice PDF.');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) {
      alert(e.message || 'Could not download the invoice PDF.');
    }
  };

  if (loading) return <Shell><div className="p-8 text-gray-400 text-sm">Loading…</div></Shell>;
  if (!invoice) return <Shell><div className="p-8 text-gray-400 text-sm">Invoice not found.</div></Shell>;

  const etrChanged = (etr.trim() || null) !== (invoice.kra_etr_code || null);

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/portal/invoices" className="text-xs text-gray-400 hover:text-gray-600">← Invoices</a>
        <div className="flex items-end justify-between mt-1">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{invoice.reference}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {invoice.company_name || invoice.client_company_name || '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_COLOR[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
              {invoice.status}
            </span>
            <button onClick={downloadPdf}
              className="text-xs bg-[#3A2150] hover:bg-[#503070] text-white px-3 py-1.5 rounded-md">
              Download PDF
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-4xl">
        {/* Facts */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Invoice details</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row k="Issued"     v={fmtDate(invoice.created_at)} />
            <Row k="Due"        v={fmtDate(invoice.due_date)} />
            <Row k="Client"     v={invoice.company_name || invoice.client_company_name || '—'} />
            <Row k="Email"      v={invoice.contact_email || invoice.client_email || '—'} />
            <Row k="Amount"     v={fmtKES(invoice.total_amount ?? invoice.amount)} />
            <Row k="Reference"  v={invoice.journey_reference || '—'} />
          </div>
        </div>

        {/* KRA ETR code editor */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">KRA ETR verification code</h2>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            Once you sign the invoice on the KRA portal, paste the ETR verification code here.
            It will appear on the invoice PDF footer and in the details table so the client
            can verify it against KRA records.
          </p>

          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={etr}
              onChange={(e) => setEtr(e.target.value)}
              placeholder="e.g. KRA-ETR-8823-4471-2091"
              maxLength={64}
              className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B060A0]/40" />
            <button
              onClick={saveEtr}
              disabled={!etrChanged || savingEtr}
              className="bg-[#B060A0] hover:bg-[#C176B4] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md whitespace-nowrap">
              {savingEtr ? 'Saving…' : (invoice.kra_etr_code ? 'Update' : 'Save')}
            </button>
          </div>

          {invoice.kra_etr_code && !etrChanged && (
            <p className="text-[11px] text-gray-400 mt-2">
              Current code: <span className="font-mono">{invoice.kra_etr_code}</span>
              {' · '}
              <button
                onClick={() => { setEtr(''); }}
                className="text-red-500 hover:text-red-600 hover:underline">Clear</button>
            </p>
          )}

          {msg.text && (
            <div className={`mt-3 rounded-md px-3 py-2 text-sm ${
              msg.kind === 'success'
                ? 'bg-green-50 border border-green-100 text-green-800'
                : 'bg-red-50 border border-red-100 text-red-800'}`}>
              {msg.text}
            </div>
          )}
        </div>

        {invoice.notes && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between border-b border-gray-50 py-1.5 last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800 text-right">{v}</span>
    </div>
  );
}
