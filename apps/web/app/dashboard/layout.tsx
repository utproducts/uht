'use client';
import { usePathname } from 'next/navigation';
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

const ROLE_NAV: Record<string, { label: string; items: { name: string; href: string }[] }> = {
  admin: { label: 'Admin', items: [
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
    { name: 'My Teams', href: '/dashboard/coach/teams' },
    { name: 'Roster', href: '/dashboard/coach/roster' },
    { name: 'Events', href: '/dashboard/coach/events' },
    { name: 'Schedule', href: '/dashboard/coach/schedule' },
  ]},
  manager: { label: 'Manager', items: [
    { name: 'My Teams', href: '/dashboard/manager/teams' },
    { name: 'Roster', href: '/dashboard/manager/roster' },
    { name: 'Events', href: '/dashboard/manager/events' },
    { name: 'Schedule', href: '/dashboard/manager/schedule' },
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
  const [blocked, setBlocked] = useState(false);

  const refreshName = useCallback(() => setUserName(readUserName()), []);

  useEffect(() => {
    window.addEventListener('storage', refreshName);
    refreshName();
    return () => window.removeEventListener('storage', refreshName);
  }, [refreshName]);

  // Block non-admin users from /dashboard/admin paths
  useEffect(() => {
    if (roleKey === 'admin' && !checkAdminAccess()) {
      setBlocked(true);
      const token = localStorage.getItem('uht_token');
      if (!token) {
        window.location.href = '/login';
      } else {
        // Redirect to their actual role dashboard
        const role = localStorage.getItem('uht_role') || 'coach';
        window.location.href = '/dashboard/' + role;
      }
    }
  }, [roleKey]);

  if (blocked) {
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center"><div className="text-[#86868b]">Redirecting...</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-6 justify-between shadow-sm">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold hidden sm:inline">Ultimate Tournaments</span>
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
          <button onClick={() => { localStorage.removeItem('uht_token'); localStorage.removeItem('uht_user'); localStorage.removeItem('uht_role'); window.location.href = '/login'; }}
            className="text-white/60 text-sm hover:text-white transition-colors font-medium">Sign out</button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-[#e8e8ed] min-h-[calc(100vh-3.5rem)] py-5 px-3 flex-shrink-0 hidden md:block">
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#86868b]">{nav.label}</p>
          <nav className="space-y-0.5">
            {nav.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== `/dashboard/${roleKey}` && pathname.startsWith(item.href));
              return (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={(e) => {
                    // Force reload when clicking the same page link
                    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
                      e.preventDefault();
                      window.location.href = item.href;
                    }
                  }}
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

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e8e8ed] z-40 flex justify-around py-2 px-1 safe-bottom">
          {nav.items.slice(0, 5).map((item) => {
            const isActive = pathname === item.href || (item.href !== `/dashboard/${roleKey}` && pathname.startsWith(item.href));
            return (
              <a key={item.name} href={item.href}
                onClick={(e) => {
                  if (pathname === item.href || pathname.startsWith(item.href + '/')) {
                    e.preventDefault();
                    window.location.href = item.href;
                  }
                }}
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
    </div>
  );
}
