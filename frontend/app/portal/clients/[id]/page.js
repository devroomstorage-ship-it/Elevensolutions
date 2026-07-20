'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function ClientDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg]         = useState({ kind: '', text: '' });

  useEffect(() => {
    if (!id) return;
    get(`/clients/${id}/360`)
      .then(setData)
      .catch((e) => setMsg({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [id]);

  const sendInvite = async () => {
    setInviting(true);
    setMsg({ kind: '', text: '' });
    try {
      await post(`/clients/${id}/invite`, {});
      setMsg({ kind: 'success', text: 'Invite sent — the client will receive a set-password email.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not send invite.' });
    } finally {
      setInviting(false);
    }
  };

  if (loading) return <Shell><div className="p-8 text-gray-400 text-sm">Loading…</div></Shell>;
  if (!data)    return <Shell><div className="p-8 text-gray-400 text-sm">Client not found.</div></Shell>;

  const { profile, summary, quotes, journeys, invoices } = data;
  const canInvite = hasRole('super_admin', 'fleet_manager', 'finance');

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/portal/clients" className="text-xs text-gray-400 hover:text-gray-600">← Clients</a>
        <div className="flex items-end justify-between mt-1">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{profile.company_name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{profile.email}</p>
          </div>
          {canInvite && (
            <button onClick={sendInvite} disabled={inviting}
              className="text-xs bg-[#B060A0] hover:bg-[#C176B4] disabled:opacity-50 text-white px-3 py-1.5 rounded-md">
              {inviting ? 'Sending…' : 'Invite to customer portal'}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl">
        {msg.text && (
          <div className={`rounded-md px-3 py-2 text-sm ${
            msg.kind === 'success'
              ? 'bg-green-50 border border-green-100 text-green-800'
              : 'bg-red-50 border border-red-100 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Profile</h2>
            <Row k="Contact"    v={profile.contact_name || '—'} />
            <Row k="Email"      v={profile.email || '—'} />
            <Row k="Phone"      v={profile.phone || '—'} />
            <Row k="Address"    v={profile.address || '—'} />
            <Row k="Client since" v={fmtDate(profile.created_at)} />

            {summary && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                <Row k="Quotes"        v={summary.quote_count ?? 0} />
                <Row k="Journeys"      v={summary.journey_count ?? 0} />
                <Row k="Invoices"      v={summary.invoice_count ?? 0} />
                <Row k="Lifetime paid" v={fmtKES(summary.lifetime_revenue_paid)} />
                <Row k="Outstanding"   v={fmtKES(summary.outstanding_balance)} />
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-5">
            <Section title="Quotes">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr><th className="py-2">Ref</th><th>Route</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id} className="border-t border-gray-100">
                      <td className="py-2">{q.reference}</td>
                      <td>{q.origin} → {q.destination}</td>
                      <td>{fmtKES(q.amount)}</td>
                      <td className="capitalize">{q.status}</td>
                    </tr>
                  ))}
                  {!quotes.length && <tr><td colSpan="4" className="py-6 text-center text-gray-400">No quotes yet.</td></tr>}
                </tbody>
              </table>
            </Section>

            <Section title="Journeys">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr><th className="py-2">Ref</th><th>Route</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {journeys.map(j => (
                    <tr key={j.id} className="border-t border-gray-100">
                      <td className="py-2">
                        <a href={`/portal/journeys/${j.id}`} className="text-[#B060A0] hover:underline">{j.reference}</a>
                      </td>
                      <td>{j.origin} → {j.destination}</td>
                      <td>{fmtDate(j.scheduled_date)}</td>
                      <td className="capitalize">{j.status?.replace('_', ' ')}</td>
                    </tr>
                  ))}
                  {!journeys.length && <tr><td colSpan="4" className="py-6 text-center text-gray-400">No journeys yet.</td></tr>}
                </tbody>
              </table>
            </Section>

            <Section title="Invoices">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr><th className="py-2">Ref</th><th>Amount</th><th>Due</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-t border-gray-100">
                      <td className="py-2">
                        <a href={`/portal/invoices/${inv.id}`} className="text-[#B060A0] hover:underline">{inv.reference}</a>
                      </td>
                      <td>{fmtKES(inv.total_amount ?? inv.amount)}</td>
                      <td>{fmtDate(inv.due_date)}</td>
                      <td className="capitalize">{inv.status}</td>
                    </tr>
                  ))}
                  {!invoices.length && <tr><td colSpan="4" className="py-6 text-center text-gray-400">No invoices yet.</td></tr>}
                </tbody>
              </table>
            </Section>
          </div>
        </div>
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
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800 text-right">{v}</span>
    </div>
  );
}
