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

const ADMIN_NAV_SECTIONS: { title: string | null; items: { name: string; href: string }[] }[] = [
  {
    title: null,
    items: [{ name: 'Overview', href: '/admin' }],
  },
  {
    title: 'Tournaments',
    items: [
      { name: 'Events', href: '/admin/events' },
      { name: 'Registrations', href: '/admin/registrations' },
      { name: 'Schedule Builder', href: '/admin/schedule' },
      { name: 'Referees', href: '/admin/referees' },
      { name: 'RSVPs', href: '/admin/rsvps' },
    ],
  },
  {
    title: 'People',
    items: [
      { name: 'Teams', href: '/admin/teams' },
      { name: 'Organizations', href: '/admin/organizations' },
      { name: 'Users', href: '/admin/users' },
      { name: 'Contacts', href: '/admin/contacts' },
      { name: 'Inquiries', href: '/admin/inquiries' },
    ],
  },
  {
    title: 'Money',
    items: [
      { name: 'Financials', href: '/admin/financials' },
      { name: 'Coupon Codes', href: '/admin/coupons' },
      { name: 'Shop', href: '/admin/shop' },
      { name: 'Sponsors', href: '/admin/sponsors' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { name: 'Communications', href: '/admin/comms' },
      { name: 'Email Campaigns', href: '/admin/email' },
      { name: 'Notifications', href: '/admin/notifications' },
    ],
  },
  {
    title: 'Locations',
    items: [
      { name: 'Hotels', href: '/admin/hotels' },
      { name: 'Venues', href: '/admin/venues' },
      { name: 'Book Ice', href: '/admin/ice' },
    ],
  },
  {
    title: 'Site',
    items: [
      { name: 'Reports', href: '/admin/reports' },
      { name: 'FAQs', href: '/admin/faqs' },
      { name: 'Settings', href: '/admin/settings' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState(readUserName);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  // Mobile: the 224px sidebar eats most of a phone screen, so it becomes a
  // slide-in drawer, hidden by default. Unchanged on md and up.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Collapsible sidebar sections — remembered across visits
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('uht_admin_nav_open') || '{}'); } catch { return {}; }
  });
  const toggleSection = (title: string, currentlyOpen: boolean) => {
    setOpenSections(prev => {
      const next = { ...prev, [title]: !currentlyOpen };
      try { localStorage.setItem('uht_admin_nav_open', JSON.stringify(next)); } catch {}
      return next;
    });
  };

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

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  if (hasAccess === null) {
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center"><div className="text-[#86868b]">Loading...</div></div>;
  }
  if (!hasAccess) {
    return <div className="min-h-screen bg-[#fafafa] flex items-center justify-center"><div className="text-[#86868b]">Redirecting...</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#003e79] to-[#005599] h-14 flex items-center px-4 sm:px-6 justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setMobileNavOpen(o => !o)}
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            className="md:hidden -ml-2 p-2 rounded-lg text-white/80 active:bg-white/10 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              {mobileNavOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
          <a href="/" className="flex items-center gap-3 min-w-0">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold truncate">Ultimate Tournaments</span>
          </a>
        </div>
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

      {/* Backdrop for the mobile drawer */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden fixed inset-0 top-14 bg-black/40 z-30"
          aria-hidden="true"
        />
      )}

      <div className="flex">
        {/* Sidebar — static column on md+, slide-in drawer below that */}
        <aside
          className={
            "w-56 bg-white border-r border-[#e8e8ed] min-h-[calc(100vh-3.5rem)] py-5 px-3 flex-shrink-0 " +
            "max-md:fixed max-md:top-14 max-md:left-0 max-md:bottom-0 max-md:z-40 max-md:overflow-y-auto " +
            "max-md:shadow-xl max-md:transition-transform " +
            (mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full")
          }
        >
          <nav>
            {ADMIN_NAV_SECTIONS.map((section, si) => {
              // '/admin' (Overview) must match exactly — startsWith would light it up on every admin page
              const itemActive = (href: string) =>
                pathname === href || pathname === `${href}/` || (href !== '/admin' && pathname.startsWith(href));
              const sectionHasActive = section.items.some((item) => itemActive(item.href));
              // Explicit user choice wins; otherwise default open for the active section
              const isOpen = !section.title
                || (section.title in openSections ? !!openSections[section.title] : sectionHasActive);
              return (
                <div key={section.title || 'top'} className={si === 0 ? '' : 'mt-2'}>
                  {section.title && (
                    <button
                      onClick={() => toggleSection(section.title!, isOpen)}
                      className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-[#86868b] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
                    >
                      {section.title}
                      <svg
                        className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                  {isOpen && (
                    <div className="space-y-0.5 mt-0.5">
                      {section.items.map((item) => {
                        const isActive = itemActive(item.href);
                        return (
                          <a
                            key={item.name}
                            href={item.href}
                            onClick={() => setMobileNavOpen(false)}
                            className={
                              "block px-3 py-1.5 rounded-lg text-sm transition-colors " +
                              (isActive
                                ? "bg-[#f0f7ff] text-[#003e79] font-semibold"
                                : "text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]")
                            }
                          >
                            {item.name}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
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
