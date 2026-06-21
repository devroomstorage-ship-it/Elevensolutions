'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function QuickBooksPage() {
  const [status,  setStatus]  = useState(null);
  const [loading, setLoad]    = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    get('/quickbooks/status').then(setStatus).catch(console.error).finally(() => setLoad(false));
  }, []);

  const disconnect = async () => {
    if (!confirm('Disconnect QuickBooks? Existing invoices will not be affected.')) return;
    setWorking(true);
    try {
      await post('/quickbooks/disconnect', {});
      setStatus({ connected: false });
    } catch(err) { alert(err.message); }
    finally { setWorking(false); }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">QuickBooks Sync</h1>
        </div>

        <div className="p-6 max-w-lg">

          {loading ? (
            <div className="text-gray-400 text-sm">Checking connection…</div>
          ) : status?.connected ? (
            <div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm">✓</div>
                  <div>
                    <p className="text-sm font-semibold text-green-800">QuickBooks Online Connected</p>
                    <p className="text-xs text-green-600">Company ID: {status.realmId}</p>
                  </div>
                </div>
                {status.lastSync && (
                  <p className="text-xs text-green-600 mt-2">Last sync: {new Date(status.lastSync).toLocaleString('en-GB')}</p>
                )}
                {status.expired && (
                  <p className="text-xs text-red-600 mt-2">⚠️ Token expired — reconnect to continue syncing</p>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-3">What syncs automatically</h2>
                <div className="space-y-2">
                  {[
                    ['Invoice created in portal',   '→ Invoice created in QuickBooks'],
                    ['Invoice emailed to client',   '→ Invoice marked Sent in QuickBooks'],
                    ['Payment marked as received',  '→ Payment recorded in QuickBooks'],
                    ['New client added',            '→ Contact created in QuickBooks'],
                  ].map(([a,b]) => (
                    <div key={a} className="flex items-start gap-2 text-xs">
                      <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                      <span className="text-gray-600">{a}</span>
                      <span className="text-[#E8620A] font-medium flex-shrink-0">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <a href={`${API}/quickbooks/connect`}
                  className="bg-[#0F1E2E] hover:bg-[#162840] text-white text-xs font-medium px-4 py-2 rounded-md transition-colors">
                  Reconnect / Refresh Token
                </a>
                <button onClick={disconnect} disabled={working}
                  className="border border-red-200 text-red-600 text-xs px-4 py-2 rounded-md hover:bg-red-50 disabled:opacity-50">
                  {working ? '…' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-5 text-center">
                <p className="text-3xl mb-3">📊</p>
                <h2 className="text-sm font-semibold text-gray-800 mb-2">Connect QuickBooks Online</h2>
                <p className="text-xs text-gray-500 mb-5 max-w-xs mx-auto">
                  Link your QuickBooks Online account to automatically sync invoices and payments.
                  No manual data entry required.
                </p>
                <a href={`${API}/quickbooks/connect`}
                  className="inline-block bg-[#2CA01C] hover:bg-[#248a15] text-white text-xs font-medium px-6 py-2.5 rounded-md transition-colors">
                  Connect QuickBooks Online
                </a>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-700 mb-3">What you will need</p>
                <ul className="space-y-1.5 text-xs text-gray-500">
                  {['A QuickBooks Online account (any plan)','Admin access to the QuickBooks company','Your QuickBooks login credentials'].map(i=>(
                    <li key={i} className="flex gap-2"><span className="text-[#E8620A]">•</span>{i}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
