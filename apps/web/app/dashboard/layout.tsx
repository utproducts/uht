'use client';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import RoleSwitcher from '../components/RoleSwitcher';

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

const ROLE_NAV: Record<string, { label: string; items: { name: string; href: string }[] }> = {
  admin: { label: 'Admin', items: [
    { name: 'Overview', href: '/dashboard/admin' },
    { name: 'Events', href: '/admin/events' },
    { name: 'Teams', href: '/admin/teams' },
    { name: 'Users', href: '/admin/users' },
    { name: 'Registrations', href: '/admin/registrations' },
    { name: 'Schedule Builder', href: '/admin/schedule' },
    { name: 'Financials', href: '/admin/financials' },
    { name: 'Communications', href: '/admin/comms' },
    { name: 'Email Campaigns', href: '/admin/email' },
    { name: 'Reports', href: '/admin/reports' },
    { name: 'Hotels', href: '/admin/hotels' },
    { name: 'Sponsors', href: '/admin/sponsors' },
    { name: 'Book Ice', href: '/admin/ice' },
    { name: 'Settings', href: '/admin/settings' },
  ]},
  director: { label: 'Director', items: [
    { name: 'My Events', href: '/dashboard/director' },
  ]},
  organization: { label: 'Organization', items: [
    { name: 'Overview', href: '/dashboard/organization' },
    { name: 'Teams', href: '/dashboard/organization/teams' },
    { name: 'Coaches', href: '/dashboard/organization/coaches' },
    { name: 'Rosters', href: '/dashboard/organization/rosters' },
    { name: 'Events', href: '/dashboard/organization/events' },
  ]},
  coach: { label: 'Coach', items: [
    { name: 'My Teams', href: '/dashboard/coach' },
    { name: 'Roster', href: '/dashboard/coach/roster' },
    { name: 'Events', href: '/dashboard/coach/events' },
    { name: 'Schedule', href: '/dashboard/coach/schedule' },
    { name: 'Coupon Codes', href: '/dashboard/coach/coupons' },
  ]},
  manager: { label: 'Manager', items: [
    { name: 'My Teams', href: '/dashboard/manager' },
    { name: 'Roster', href: '/dashboard/manager/roster' },
    { name: 'Events', href: '/dashboard/manager/events' },
    { name: 'Schedule', href: '/dashboard/manager/schedule' },
    { name: 'Coupon Codes', href: '/dashboard/manager/coupons' },
  ]},
  parent: { label: 'Parent / Player', items: [
    { name: 'Overview', href: '/dashboard/parent' },
    { name: 'My Teams', href: '/dashboard/parent/teams' },
    { name: 'Schedule', href: '/dashboard/parent/schedule' },
    { name: 'Results', href: '/dashboard/parent/results' },
    { name: 'Stats', href: '/dashboard/parent/stats' },
  ]},
  scorekeeper: { label: 'Scorekeeper', items: [
    { name: 'Active Games', href: '/dashboard/scorekeeper' },
    { name: 'Assignments', href: '/dashboard/scorekeeper/assignments' },
    { name: 'Completed', href: '/dashboard/scorekeeper/completed' },
  ]},
  referee: { label: 'Referee', items: [
    { name: 'Overview', href: '/dashboard/referee' },
    { name: 'Assignments', href: '/dashboard/referee/assignments' },
    { name: 'Reports', href: '/dashboard/referee/reports' },
  ]},
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const roleKey = pathname.split('/')[2] || 'admin';
  const nav = ROLE_NAV[roleKey] || ROLE_NAV.admin;
  const [userName, setUserName] = useState(readUserName);

  const refreshName = useCallback(() => setUserName(readUserName()), []);

  useEffect(() => {
    // Re-read on storage changes (e.g. login in another tab)
    window.addEventListener('storage', refreshName);
    // Also re-read on mount in case value changed since initial render
    refreshName();
    return () => window.removeEventListener('storage', refreshName);
  }, [refreshName]);

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-6 justify-between shadow-sm">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold hidden sm:inline">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-4">
          {userName && (
            <span className="text-white text-sm font-medium">
              Hi, {userName}
            </span>
          )}
          <span className="text-white/40 text-xs hidden sm:inline">|</span>
          <span className="text-white/60 text-sm font-medium hidden sm:inline">{nav.label}</span>
          <button onClick={() => { localStorage.removeItem('uht_token'); localStorage.removeItem('uht_user'); localStorage.removeItem('uht_role'); window.location.href = '/login'; }}
            className="text-white/60 text-sm hover:text-white transition-colors font-medium">Sign out</button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-[#e8e8ed] min-h-[calc(100vh-3.5rem)] py-5 px-3 hidden md:block">
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#86868b]">{nav.label}</p>
          <nav className="space-y-0.5">
            {nav.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== `/dashboard/${roleKey}` && pathname.startsWith(item.href));
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={
                    "block px-3 py-2.5 rounded-xl text-sm transition-all " +
                    (isActive
                      ? "bg-[#f0f7ff] text-[#003e79] font-semibold shadow-sm"
                      : "text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]")
                  }
                >
                  {item.name}
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8e8ed] z-40 flex justify-around py-2 px-1 safe-bottom">
          {nav.items.slice(0, 5).map((item) => {
            const isActive = pathname === item.href || (item.href !== `/dashboard/${roleKey}` && pathname.startsWith(item.href));
            return (
              <a key={item.name} href={item.href}
                className={"flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors " +
                  (isActive ? "text-[#003e79] font-semibold" : "text-[#86868b]")}>
                {item.name.replace('My ', '').replace('Coupon Codes', 'Coupons')}
              </a>
            );
          })}
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-8 pb-24 md:pb-8">{children}</main>
      </div>
      <RoleSwitcher />
    </div>
  );
}
