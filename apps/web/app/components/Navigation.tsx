'use client';

import { useState, useEffect } from 'react';

function getAuthState(): { loggedIn: boolean; role: string; name: string } {
  if (typeof window === 'undefined') return { loggedIn: false, role: '', name: '' };
  try {
    const token = localStorage.getItem('uht_token');
    const role = localStorage.getItem('uht_role') || 'parent';
    const userStr = localStorage.getItem('uht_user');
    if (token && !token.startsWith('mock-')) {
      const user = userStr ? JSON.parse(userStr) : {};
      const name = user.firstName || user.name || '';
      return { loggedIn: true, role, name };
    }
  } catch {}
  return { loggedIn: false, role: '', name: '' };
}

function getDashboardUrl(role: string): string {
  if (role === 'admin') return '/admin/events';
  if (role === 'director') return '/director';
  return '/dashboard/' + role;
}

export default function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [auth, setAuth] = useState<{ loggedIn: boolean; role: string; name: string }>({ loggedIn: false, role: '', name: '' });

  useEffect(() => {
    setAuth(getAuthState());
  }, []);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#e8e8ed]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img
              src="/uht-logo.png"
              alt="Ultimate Hockey Tournaments"
              className="h-8 sm:h-10 w-auto"
            />
            <span className="font-semibold text-[#1d1d1f] text-base sm:text-lg tracking-tight">
              Ultimate Tournaments
            </span>
          </a>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-7">
            <a href="/events" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Events</a>
            <a href="/events?tab=past" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Past Events</a>
            <a href="/cities" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Cities</a>
            <a href="/book-ice" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium whitespace-nowrap">Book Ice</a>
            <a href="/sponsors" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Sponsors</a>
            <a href="/referees" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Referees</a>
            <a href="/faq" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">FAQ</a>
            <a href="/contact" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Contact</a>
          </div>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-4">
            {auth.loggedIn ? (
              <a href={getDashboardUrl(auth.role)} className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">
                {auth.name ? `Hi, ${auth.name}` : 'My Dashboard'}
              </a>
            ) : (
              <a href="/login" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Sign In</a>
            )}
            <a href="/events" className="btn-primary text-sm py-2 px-5">Find Events</a>
          </div>

          {/* Mobile: Sign In + Hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            {auth.loggedIn ? (
              <a href={getDashboardUrl(auth.role)} className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] font-medium">Dashboard</a>
            ) : (
              <a href="/login" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] font-medium">Sign In</a>
            )}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 -mr-2 text-[#3d3d3d] hover:text-[#1d1d1f] transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-[#e8e8ed] bg-white/95 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-1">
            <a href="/events" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Events</a>
            <a href="/events?tab=past" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Past Events</a>
            <a href="/cities" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Cities</a>
            <a href="/book-ice" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Book Ice</a>
            <a href="/sponsors" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Sponsors</a>
            <a href="/referees" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Referees</a>
            <a href="/faq" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">FAQ</a>
            <a href="/contact" className="block py-2.5 px-3 text-sm font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] rounded-lg transition-colors">Contact</a>
            <div className="pt-2 border-t border-[#e8e8ed] mt-1">
              <a href="/events" className="block py-2.5 px-3 text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] rounded-lg text-center transition-colors">Find Events</a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
