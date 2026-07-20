'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get } from '@/lib/api';

const formatKES = (n) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);

const activityIcon = { journey: '🚛', quote: '📋', invoice: '🧾' };

export default function DashboardPage() {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);

  useEffect(() => {
    get('/dashboard/summary').then(setData).catch(console.error).finally(() => setLoad(false));
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Operations Overview</h1>
            <p className="text-xs text-gray-500 mt-0.5">{new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
          </div>
          <span className="bg-[#F5EEF7] text-[#B060A0] text-xs font-medium px-3 py-1 rounded-full">
            {data?.openInvoices?.count || 0} open invoices
          </span>
        </div>

        <div className="p-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Active Trucks',     value: loading ? '…' : `${data?.trucks?.active || 0} / ${data?.trucks?.total || 13}` },
              { label: 'Trips This Month',  value: loading ? '…' : data?.tripsThisMonth || 0 },
              { label: 'Revenue This Month',value: loading ? '…' : formatKES(data?.revenueThisMonth), large: true },
              { label: 'Open Invoices',     value: loading ? '…' : data?.openInvoices?.count || 0 },
            ].map(c => (
              <div key={c.label} className="bg-gray-100/70 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                <p className={`font-semibold text-gray-900 ${c.large ? 'text-lg' : 'text-2xl'}`}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Truck status strip */}
          {data?.trucks && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
              <p className="text-xs font-semibold text-gray-700 mb-3">Fleet Status</p>
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Available',    count: data.trucks.available,    color: 'bg-green-100 text-green-800' },
                  { label: 'On Route',     count: data.trucks.active,       color: 'bg-blue-100 text-blue-800' },
                  { label: 'Maintenance',  count: data.trucks.maintenance,  color: 'bg-red-100 text-red-800' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className={`${s.color} text-xs font-medium px-2 py-0.5 rounded-full`}>{s.label}</span>
                    <span className="text-gray-900 font-semibold text-sm">{s.count || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-700">Recent Activity</p>
            </div>
            {loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {(data?.recentActivity || []).map((a, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <span className="text-base mt-0.5">{activityIcon[a.type] || '•'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-800 truncate">{a.detail}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{a.reference}</p>
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {new Date(a.created_at).toLocaleTimeString('en-GB',{ hour:'2-digit', minute:'2-digit' })}
                    </span>
                  </div>
                ))}
                {!data?.recentActivity?.length && (
                  <div className="p-8 text-center text-gray-400 text-sm">No recent activity</div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
