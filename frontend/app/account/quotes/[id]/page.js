'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  pending:  'bg-amber-100 text-amber-800',
  sent:     'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired:  'bg-gray-100 text-gray-700',
};

export default function AccountQuoteDetailPage() {
  const { id } = useParams();
  const [quote, setQuote]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    get(`/client-portal/quotes/${id}`).then(setQuote).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ClientShell><div className="p-8 text-gray-400 text-sm">Loading…</div></ClientShell>;
  if (!quote)   return <ClientShell><div className="p-8 text-gray-400 text-sm">Quote not found.</div></ClientShell>;

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/account/quotes" className="text-xs text-gray-400 hover:text-gray-600">← Quotes</a>
        <div className="flex items-end justify-between mt-1">
          <h1 className="text-lg font-semibold text-gray-900">{quote.reference}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_COLOR[quote.status] || 'bg-gray-100 text-gray-700'}`}>
            {quote.status}
          </span>
        </div>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row k="Route"       v={`${quote.origin} → ${quote.destination}`} />
            <Row k="Cargo"       v={quote.cargo_type || '—'} />
            <Row k="Weight"      v={quote.weight_tons ? `${quote.weight_tons} tonnes` : '—'} />
            <Row k="Amount"      v={fmtKES(quote.amount)} />
            <Row k="Issued"      v={fmtDate(quote.created_at)} />
            <Row k="Valid until" v={fmtDate(quote.valid_until)} />
          </div>
        </div>
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
