'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import RoleSwitcher from '../components/RoleSwitcher';

const ADMIN_ROLES = ['admin', 'director'];

function readUserName(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('uht_user');
    if (stored) {
      const u = JSON.parse(stored);
      return u.firstName || u.first_name || '';
    }
  } catch {}
  return '';
}

function checkAdminAccess(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('uht_token');
    if (!token) return false;
    const stored = localStorage.getItem('uht_user');
    if (!stored) return false;
    const u = JSON.parse(stored);
    const roles: string[] = u.roles || [];
    return roles.some((r: string) => ADMIN_ROLES.includes(r));
  } catch {}
  return false;
}

const ADMIN_NAV = [
  { name: 'Overview', href: '/dashboard/admin' },
  { name: 'Events', href: '/admin/events' },
  { name: 'Teams', href: '/admin/teams' },
  { name: 'Organizations', href: '/admin/organizations' },
  { name: 'Users', href: '/admin/users' },
  { name: 'Contacts', href: '/admin/contacts' },
  { name: 'Registrations', href: '/admin/registrations' },
  { name: 'Schedule Builder', href: '/admin/schedule' },
  { name: 'Financials', href: '/admin/financials' },
  { name: 'Coupon Codes', href: '/admin/coupons' },
  { name: 'Shop', href: '/admin/shop' },
  { name: 'Referees', href: '/admin/referees' },
  { name: 'Communications', href: '/admin/comms' },
  { name: 'Email Campaigns', href: '/admin/email' },
  { name: 'Reports', href: '/admin/reports' },
  { name: 'Hotels', href: '/admin/hotels' },
  { name: 'Venues', href: '/admin/venues' },
  { name: 'Sponsors', href: '/admin/sponsors' },
  { name: 'Notifications', href: '/admin/notifications' },
  { name: 'RSVPs', href: '/admin/rsvps' },
  { name: 'FAQs', href: '/admin/faqs' },
  { name: 'Book Ice', href: '/admin/ice' },
  { name: 'Settings', href: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState(readUserName);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const refreshName = useCallback(() => setUserName(readUserName()), []);

  useEffect(() => {
    window.addEventListener('storage', refreshName);
    refreshName();
    return () => window.removeEventListener('storage', refreshName);
  }, [refreshName]);

  useEffect(() => {
    const allowed = checkAdminAccess();
    setHasAccess(allowed);
    if (!allowed) {
      const token = localStorage.getItem('uht_token');
      if (!token) {
        window.location.href = '/login?redirect=' + encodeURIComponent(pathname);
      } else {
        window.location.href = '/dashboard';
      }
    }
  }, [pathname, router]);

  if (hasAccess === null) {
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center"><div className="text-[#86868b]">Loading...</div></div>;
  }
  if (!hasAccess) {
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center"><div className="text-[#86868b]">Redirecting...</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-6 justify-between shadow-sm">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-3">
          {userName && (
            <span className="text-white text-sm font-medium hidden sm:inline">
              Hi, {userName}
            </span>
          )}
          <span className="text-white/30 hidden sm:inline">|</span>
          <RoleSwitcher />
          <span className="text-white/30 hidden sm:inline">|</span>
          <button onClick={() => { localStorage.removeItem('uht_token'); localStorage.removeItem('uht_user'); localStorage.removeItem('uht_role'); window.location.href = '/login'; }} className="text-white/60 text-sm hover:text-white transition-colors font-medium">Sign out</button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-[#e8e8ed] min-h-[calc(100vh-3.5rem)] py-5 px-3 flex-shrink-0">
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#86868b]">Admin</p>
          <nav className="space-y-0.5">
            {ADMIN_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard/admin' && pathname.startsWith(item.href));
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={
                    "block px-3 py-2 rounded-lg text-sm transition-colors " +
                    (isActive
                      ? "bg-[#f0f7ff] text-[#003e79] font-semibold"
                      : "text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]")
                  }
                >
                  {item.name}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
