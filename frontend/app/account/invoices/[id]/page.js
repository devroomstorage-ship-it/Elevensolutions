'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Cookies from 'js-cookie';
import ClientShell from '@/components/account/ClientShell';
import { get, BASE } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  draft:     'bg-gray-100 text-gray-700',
  sent:      'bg-blue-100 text-blue-800',
  paid:      'bg-green-100 text-green-800',
  overdue:   'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
};

export default function AccountInvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    get(`/client-portal/invoices/${id}`).then(setInvoice).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  // window.open on a bare URL can't carry the Authorization header the
  // backend requires, so fetch the PDF as a blob (with the header) and open
  // the resulting object URL instead.
  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const token = Cookies.get('es_access_token');
      const res = await fetch(`${BASE}/client-portal/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not download the invoice PDF.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      alert(e.message || 'Could not download the invoice PDF.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <ClientShell><div className="p-8 text-gray-400 text-sm">Loading…</div></ClientShell>;
  if (!invoice) return <ClientShell><div className="p-8 text-gray-400 text-sm">Invoice not found.</div></ClientShell>;

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/account/invoices" className="text-xs text-gray-400 hover:text-gray-600">← Invoices</a>
        <div className="flex items-end justify-between mt-1">
          <h1 className="text-lg font-semibold text-gray-900">{invoice.reference}</h1>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_COLOR[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
              {invoice.status}
            </span>
            <button onClick={downloadPdf} disabled={downloading}
              className="text-xs bg-[#0F1E2E] hover:bg-[#1a3556] disabled:opacity-50 text-white px-3 py-1.5 rounded-md">
              {downloading ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-2xl space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row k="Amount"   v={fmtKES(invoice.total_amount || invoice.amount)} />
            <Row k="Due"      v={fmtDate(invoice.due_date)} />
            <Row k="Issued"   v={fmtDate(invoice.issue_date)} />
            <Row k="Paid"     v={invoice.paid_date ? fmtDate(invoice.paid_date) : '—'} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">KRA ETR verification code</h2>
          {invoice.kra_etr_code ? (
            <p className="text-sm font-mono text-gray-800">{invoice.kra_etr_code}</p>
          ) : (
            <p className="text-sm text-gray-400">Not yet issued.</p>
          )}
        </div>

        {invoice.notes && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Notes</h2>
            <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>
    </ClientShell>
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
