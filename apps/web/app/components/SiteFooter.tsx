'use client';

import { usePathname } from 'next/navigation';

export default function SiteFooter() {
  const pathname = usePathname();

  // Hide footer on dashboard and admin pages (they have their own layout)
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return null;

  return (
    <footer className="bg-[#f5f5f7] border-t border-[#e8e8ed]">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
              <span className="font-semibold text-[#1d1d1f]">Ultimate Tournaments</span>
            </div>
            <p className="text-sm text-[#6e6e73] leading-relaxed">
              Premier youth and adult hockey tournaments across the Midwest.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#1d1d1f] mb-3">Events</h4>
            <div className="space-y-2">
              <a href="/events" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Upcoming Events</a>
              <a href="/events?tab=past" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Past Events</a>
              <a href="/cities" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Cities</a>
              <a href="/book-ice" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Book Ice</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#1d1d1f] mb-3">Support</h4>
            <div className="space-y-2">
              <a href="/faq" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">FAQ</a>
              <a href="/contact" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Contact Us</a>
              <a href="/sponsors" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Become a Sponsor</a>
              <a href="/referees" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Become a Referee</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#1d1d1f] mb-3">Portals</h4>
            <div className="space-y-2">
              <a href="/login" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Sign In</a>
              <a href="/register" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Create Account</a>
              <a href="/scorekeeper" className="block text-sm text-[#6e6e73] hover:text-[#1d1d1f]">Scorekeeper Login</a>
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-[#d2d2d7] flex items-center justify-between">
          <p className="text-xs text-[#86868b]">&copy; {new Date().getFullYear()} Ultimate Hockey Tournaments. All rights reserved.</p>
          <p className="text-xs text-[#86868b]">USA Hockey Sanctioned Events</p>
        </div>
      </div>
    </footer>
  );
}
