'use client';
import { usePathname } from 'next/navigation';
import RoleSwitcher from '../components/RoleSwitcher';

const ROLE_NAV: Record<string, { label: string; items: { name: string; href: string; icon: string }[] }> = {
  admin: { label: 'Admin', items: [
    { name: 'Overview', href: '/dashboard/admin', icon: '\u{1F4CA}' },
    { name: 'Events', href: '/dashboard/admin/events', icon: '\u{1F3C6}' },
    { name: 'Teams', href: '/dashboard/admin/teams', icon: '\u{1F465}' },
    { name: 'Users', href: '/dashboard/admin/users', icon: '\u{1F464}' },
    { name: 'Registrations', href: '/dashboard/admin/registrations', icon: '\u{1F4DD}' },
    { name: 'Schedule Builder', href: '/dashboard/admin/schedule', icon: '\u{1F4C5}' },
    { name: 'Financials', href: '/dashboard/admin/financials', icon: '\u{1F4B0}' },
    { name: 'Communications', href: '/dashboard/admin/comms', icon: '\u{1F4E7}' },
    { name: 'Settings', href: '/dashboard/admin/settings', icon: '\u{2699}' },
  ]},
  director: { label: 'Director', items: [
    { name: 'Overview', href: '/dashboard/director', icon: '\u{1F4CA}' },
    { name: 'My Events', href: '/dashboard/director/events', icon: '\u{1F3C6}' },
    { name: 'Registrations', href: '/dashboard/director/registrations', icon: '\u{1F4DD}' },
    { name: 'Scores', href: '/dashboard/director/scores', icon: '\u{1F3AF}' },
    { name: 'Schedule', href: '/dashboard/director/schedule', icon: '\u{1F4C5}' },
    { name: 'Comms', href: '/dashboard/director/comms', icon: '\u{1F4E7}' },
  ]},
  organization: { label: 'Organization', items: [
    { name: 'Overview', href: '/dashboard/organization', icon: '\u{1F4CA}' },
    { name: 'Teams', href: '/dashboard/organization/teams', icon: '\u{1F465}' },
    { name: 'Coaches', href: '/dashboard/organization/coaches', icon: '\u{1F4CB}' },
    { name: 'Rosters', href: '/dashboard/organization/rosters', icon: '\u{1F4C4}' },
    { name: 'Events', href: '/dashboard/organization/events', icon: '\u{1F3C6}' },
  ]},
  coach: { label: 'Coach', items: [
    { name: 'Overview', href: '/dashboard/coach', icon: '\u{1F4CA}' },
    { name: 'My Teams', href: '/dashboard/coach/teams', icon: '\u{1F465}' },
    { name: 'Roster', href: '/dashboard/coach/roster', icon: '\u{1F4C4}' },
    { name: 'Events', href: '/dashboard/coach/events', icon: '\u{1F3C6}' },
    { name: 'Schedule', href: '/dashboard/coach/schedule', icon: '\u{1F4C5}' },
  ]},
  manager: { label: 'Manager', items: [
    { name: 'Overview', href: '/dashboard/manager', icon: '\u{1F4CA}' },
    { name: 'My Team', href: '/dashboard/manager/team', icon: '\u{1F465}' },
    { name: 'Players', href: '/dashboard/manager/players', icon: '\u{1F464}' },
    { name: 'Events', href: '/dashboard/manager/events', icon: '\u{1F3C6}' },
    { name: 'Payments', href: '/dashboard/manager/payments', icon: '\u{1F4B3}' },
  ]},
  parent: { label: 'Parent / Player', items: [
    { name: 'Overview', href: '/dashboard/parent', icon: '\u{1F4CA}' },
    { name: 'My Teams', href: '/dashboard/parent/teams', icon: '\u{1F465}' },
    { name: 'Schedule', href: '/dashboard/parent/schedule', icon: '\u{1F4C5}' },
    { name: 'Results', href: '/dashboard/parent/results', icon: '\u{1F3C6}' },
    { name: 'Stats', href: '/dashboard/parent/stats', icon: '\u{2B50}' },
  ]},
  scorekeeper: { label: 'Scorekeeper', items: [
    { name: 'Active Games', href: '/dashboard/scorekeeper', icon: '\u{1F3D2}' },
    { name: 'Assignments', href: '/dashboard/scorekeeper/assignments', icon: '\u{1F4C5}' },
    { name: 'Completed', href: '/dashboard/scorekeeper/completed', icon: '\u{2705}' },
  ]},
  referee: { label: 'Referee', items: [
    { name: 'Overview', href: '/dashboard/referee', icon: '\u{1F4CA}' },
    { name: 'Assignments', href: '/dashboard/referee/assignments', icon: '\u{1F4C5}' },
    { name: 'Reports', href: '/dashboard/referee/reports', icon: '\u{1F4DD}' },
  ]},
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const roleKey = pathname.split('/')[2] || 'admin';
  const nav = ROLE_NAV[roleKey] || ROLE_NAV.admin;

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="bg-navy-700 h-14 flex items-center px-6 justify-between">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-white/70 text-sm">{nav.label} Dashboard</span>
          <a href="/login" className="text-white/50 text-sm hover:text-white transition-colors">Sign out</a>
        </div>
      </header>
      <div className="flex">
        <aside className="w-60 bg-white border-r border-gray-200 min-h-[calc(100vh-3.5rem)] p-4">
          <nav className="space-y-1">
            {nav.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <a key={item.name} href={item.href} className={"flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors " + (isActive ? "bg-brand-50 text-brand-600 font-medium" : "text-[#1d1d1f] hover:bg-gray-50")}>
                  <span className="text-base">{item.icon}</span>
                  <span>{item.name}</span>
                </a>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
      <RoleSwitcher />
    </div>
  );
}
