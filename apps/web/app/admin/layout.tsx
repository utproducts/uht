'use client';
import { usePathname } from 'next/navigation';
import RoleSwitcher from '../components/RoleSwitcher';

const ADMIN_NAV = [
  { name: 'Overview', href: '/dashboard/admin' },
  { name: 'Events', href: '/admin/events' },
  { name: 'Teams', href: '/admin/teams' },
  { name: 'Users', href: '/admin/users' },
  { name: 'Registrations', href: '/admin/registrations' },
  { name: 'Schedule Builder', href: '/admin/schedule' },
  { name: 'Financials', href: '/admin/financials' },
  { name: 'Referees', href: '/admin/referees' },
  { name: 'Communications', href: '/admin/comms' },
  { name: 'Email Campaigns', href: '/admin/email' },
  { name: 'Reports', href: '/admin/reports' },
  { name: 'Hotels', href: '/admin/hotels' },
  { name: 'Venues', href: '/admin/venues' },
  { name: 'Sponsors', href: '/admin/sponsors' },
  { name: 'Book Ice', href: '/admin/ice' },
  { name: 'Settings', href: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-6 justify-between shadow-sm">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-white/60 text-sm font-medium">Admin Dashboard</span>
          <a href="/login" className="text-white/40 text-sm hover:text-white transition-colors">Sign out</a>
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
      <RoleSwitcher />
    </div>
  );
}
