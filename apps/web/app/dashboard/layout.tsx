'use client';
import { usePathname } from 'next/navigation';
import RoleSwitcher from '../components/RoleSwitcher';

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
    { name: 'My Events', href: '/director' },
  ]},
  organization: { label: 'Organization', items: [
    { name: 'Overview', href: '/dashboard/organization' },
    { name: 'Teams', href: '/dashboard/organization/teams' },
    { name: 'Coaches', href: '/dashboard/organization/coaches' },
    { name: 'Rosters', href: '/dashboard/organization/rosters' },
    { name: 'Events', href: '/dashboard/organization/events' },
  ]},
  coach: { label: 'Coach', items: [
    { name: 'Overview', href: '/dashboard/coach' },
    { name: 'My Teams', href: '/dashboard/coach/teams' },
    { name: 'Roster', href: '/dashboard/coach/roster' },
    { name: 'Events', href: '/dashboard/coach/events' },
    { name: 'Schedule', href: '/dashboard/coach/schedule' },
  ]},
  manager: { label: 'Manager', items: [
    { name: 'Overview', href: '/dashboard/manager' },
    { name: 'My Team', href: '/dashboard/manager/team' },
    { name: 'Players', href: '/dashboard/manager/players' },
    { name: 'Events', href: '/dashboard/manager/events' },
    { name: 'Payments', href: '/dashboard/manager/payments' },
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

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-6 justify-between shadow-sm">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-white/60 text-sm font-medium">{nav.label} Dashboard</span>
          <a href="/login" className="text-white/40 text-sm hover:text-white transition-colors">Sign out</a>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-[#e8e8ed] min-h-[calc(100vh-3.5rem)] py-5 px-3">
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#86868b]">{nav.label}</p>
          <nav className="space-y-0.5">
            {nav.items.map((item) => {
              const isActive = pathname === item.href;
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
        <main className="flex-1 p-8">{children}</main>
      </div>
      <RoleSwitcher />
    </div>
  );
}
