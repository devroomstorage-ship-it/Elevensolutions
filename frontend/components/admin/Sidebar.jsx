'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const navItems = [
  { label: 'Dashboard',       href: '/portal/dashboard', icon: '▤',  roles: null },
  { label: 'Fleet & Trucks',  href: '/portal/fleet',     icon: '🚛', roles: null },
  { label: 'Drivers',         href: '/portal/drivers',   icon: '🧑‍✈️', roles: ['super_admin','fleet_manager','planner','finance'] },
  { label: 'Clients',         href: '/portal/clients',   icon: '🏢', roles: ['super_admin','fleet_manager','finance'] },
  { label: 'Journey Planner', href: '/portal/schedule',  icon: '🗺️', roles: ['super_admin','fleet_manager','planner'] },
  { label: 'Quotations',      href: '/portal/quotes',    icon: '📋', roles: ['super_admin','finance','fleet_manager','planner'] },
  { label: 'Invoices',        href: '/portal/invoices',  icon: '🧾', roles: ['super_admin','finance'] },
  { label: 'Finance',         href: '/portal/finance',   icon: '💰', roles: ['super_admin','finance'] },
];

const systemItems = [
  { label: 'Website',          href: '/portal/content',     roles: ['super_admin','finance'] },
  { label: 'Users & Roles',    href: '/portal/users',       roles: ['super_admin'] },
  { label: 'QuickBooks Sync',  href: '/portal/quickbooks',  roles: ['super_admin','finance'] },
  { label: 'Audit Log',        href: '/portal/audit',       roles: ['super_admin'] },
  { label: 'Settings',         href: '/portal/settings',    roles: ['super_admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuth();

  const visible = (item) => !item.roles || hasRole(...item.roles);

  return (
    <aside className="w-48 bg-[#0F1E2E] flex flex-col border-r border-white/10 flex-shrink-0">

      {/* Logo */}
      <div className="h-12 flex items-center px-4 border-b border-white/10">
        <div className="w-6 h-6 bg-[#E8620A] rounded flex items-center justify-center mr-2 flex-shrink-0">
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <rect x="0" y="2" width="9" height="6" rx="1" fill="white"/>
            <rect x="9" y="4" width="3.5" height="4" rx="0.8" fill="rgba(255,255,255,0.7)"/>
          </svg>
        </div>
        <span className="text-white text-xs font-semibold tracking-wide truncate">ELEVEN SOL.</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <p className="px-4 text-[10px] text-[#8FA3B8] font-semibold tracking-widest mb-2 uppercase">Main</p>
        {navItems.filter(visible).map(item => {
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

        <p className="px-4 text-[10px] text-[#8FA3B8] font-semibold tracking-widest mb-2 mt-5 uppercase">System</p>
        {systemItems.filter(visible).map(item => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-xs transition-colors border-l-2 ${
                active ? 'text-white border-[#E8620A]' : 'text-[#8FA3B8] hover:text-white border-transparent'
              }`}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-[#E8620A]/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[#F7813B] text-[10px] font-bold">
              {user?.full_name?.charAt(0) || '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
            <p className="text-[#8FA3B8] text-[10px] capitalize">{user?.role?.replace('_',' ')}</p>
          </div>
        </div>
        <button onClick={logout}
          className="w-full text-left text-[#8FA3B8] hover:text-white text-xs transition-colors py-1">
          Sign out →
        </button>
      </div>
    </aside>
  );
}
