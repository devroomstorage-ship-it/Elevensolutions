'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { useAuth } from '@/lib/auth';
import { post } from '@/lib/api';

const navItems = [
  { label: 'Dashboard',        href: '/account/dashboard', icon: '▤' },
  { label: 'Quotes',           href: '/account/quotes',    icon: '📋' },
  { label: 'Invoices',         href: '/account/invoices',  icon: '🧾' },
  { label: 'Journeys',         href: '/account/journeys',  icon: '🚚' },
  { label: 'Company Profile',  href: '/account/profile',   icon: '🏢' },
];

// Doesn't reuse useAuth().logout() — that hook hardcodes a redirect to
// /portal/login, which is the staff login page, not this one.
async function clientLogout() {
  const refreshToken = Cookies.get('es_refresh_token');
  try { await post('/auth/logout', { refreshToken }); } catch {}
  Cookies.remove('es_access_token');
  Cookies.remove('es_refresh_token');
  window.location.href = '/account/login';
}

export default function ClientShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  // Staff and clients share the same session cookies. A staff session (or no
  // session at all) should never render the client shell — send it to the
  // client login instead of silently showing an empty/broken page.
  useEffect(() => {
    if (!loading && user?.role !== 'client') router.replace('/account/login');
  }, [user, loading, router]);

  if (loading || user?.role !== 'client') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-[#E8620A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="w-48 bg-[#0F1E2E] flex flex-col border-r border-white/10 flex-shrink-0">
        <div className="h-12 flex items-center px-4 border-b border-white/10">
          <div className="w-6 h-6 bg-[#E8620A] rounded flex items-center justify-center mr-2 flex-shrink-0">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <rect x="0" y="2" width="9" height="6" rx="1" fill="white"/>
              <rect x="9" y="4" width="3.5" height="4" rx="0.8" fill="rgba(255,255,255,0.7)"/>
            </svg>
          </div>
          <span className="text-white text-xs font-semibold tracking-wide truncate">ELEVEN SOL.</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          <p className="px-4 text-[10px] text-[#8FA3B8] font-semibold tracking-widest mb-2 uppercase">Client Portal</p>
          {navItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-xs transition-colors ${
                  active
                    ? 'text-white bg-[#E8620A]/15 border-l-2 border-[#E8620A] font-medium'
                    : 'text-[#8FA3B8] hover:text-white border-l-2 border-transparent'
                }`}>
                <span className="text-sm w-4 flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-[#E8620A]/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[#F7813B] text-[10px] font-bold">
                {user?.full_name?.charAt(0) || '?'}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
              <p className="text-[#8FA3B8] text-[10px]">Client</p>
            </div>
          </div>
          <button onClick={clientLogout}
            className="w-full text-left text-[#8FA3B8] hover:text-white text-xs transition-colors py-1">
            Sign out →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
