'use client';
import Sidebar from '@/components/admin/Sidebar';
import Link from 'next/link';

const SECTIONS = [
  { href: '/portal/settings/email', title: 'Email & senders',
    desc: 'Configure which address quotation and invoice emails are sent from. Per-purpose overrides supported.' },
  { href: '/portal/settings/pricing', title: 'Pricing',
    desc: 'Global fuel price per litre used by the journey cost calculator.' },
];

export default function SettingsPage() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Settings</h1>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {SECTIONS.map(s => (
            <Link key={s.href} href={s.href}
              className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm hover:border-gray-200 transition-all">
              <h2 className="text-sm font-semibold text-gray-900">{s.title}</h2>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.desc}</p>
              <p className="text-xs text-[#E8620A] mt-3 font-medium">Open →</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
