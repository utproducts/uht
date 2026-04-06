'use client';
import { usePathname } from 'next/navigation';

const ADMIN_NAV = [
  { name: 'Overview', href: '/dashboard/admin', icon: '\u{1F4CA}' },
  { name: 'Events', href: '/admin/events', icon: '\u{1F3C6}' },
  { name: 'Teams', href: '/admin/teams', icon: '\u{1F465}' },
  { name: 'Users', href: '/admin/users', icon: '\u{1F464}' },
  { name: 'Registrations', href: '/admin/registrations', icon: '\u{1F4DD}' },
  { name: 'Schedule Builder', href: '/admin/schedule', icon: '\u{1F4C5}' },
  { name: 'Financials', href: '/admin/financials', icon: '\u{1F4B0}' },
  { name: 'Communications', href: '/admin/comms', icon: '\u{1F4E7}' },
  { name: 'Hotels', href: '/admin/hotels', icon: '\u{1F3E8}' },
  { name: 'Sponsors', href: '/admin/sponsors', icon: '\u{1F91D}' },
  { name: 'Book Ice', href: '/admin/ice', icon: '\u{26F8}' },
  { name: 'Settings', href: '/admin/settings', icon: '\u{2699}' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="bg-navy-700 h-14 flex items-center px-6 justify-between">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold">Ultimate Tournaments</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-white/70 text-sm">Admin Dashboard</span>
          <a href="/login" className="text-white/50 text-sm hover:text-white transition-colors">Sign out</a>
        </div>
      </header>
      <div className="flex">
        <aside className="w-60 bg-white border-r border-gray-200 min-h-[calc(100vh-3.5rem)] p-4 flex-shrink-0">
          <nav className="space-y-1">
            {ADMIN_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard/admin' && pathname.startsWith(item.href));
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors " +
                    (isActive
                      ? "bg-brand-50 text-brand-600 font-medium"
                      : "text-[#1d1d1f] hover:bg-gray-50")
                  }
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.name}</span>
                </a>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
