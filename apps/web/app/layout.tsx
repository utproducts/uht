import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ultimate Hockey Tournaments',
  description: 'Premier youth and adult hockey tournaments across the Midwest. Register your team, view schedules, and track live scores.',
  keywords: ['hockey', 'tournaments', 'youth hockey', 'USA Hockey', 'ice hockey', 'tournament registration'],
  openGraph: {
    title: 'Ultimate Hockey Tournaments',
    description: 'Premier youth and adult hockey tournaments across the Midwest.',
    url: 'https://ultimatetournaments.com',
    siteName: 'Ultimate Hockey Tournaments',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <Navigation />
        <main>{children}</main>
        <Footer />
        <ChatWidget />
      </body>
    </html>
  );
}

function Navigation() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#e8e8ed]">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/uht-logo.png"
              alt="Ultimate Hockey Tournaments"
              className="h-10 w-auto"
            />
            <span className="font-semibold text-[#1d1d1f] text-lg tracking-tight">
              Ultimate Tournaments
            </span>
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="/events" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Events</a>
            <a href="/cities" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Cities</a>
            <a href="/book-ice" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Book Ice</a>
            <a href="/sponsors" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Sponsors</a>
            <a href="/faq" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">FAQ</a>
            <a href="/contact" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Contact</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors font-medium">Sign In</a>
            <a href="/events" className="btn-primary text-sm py-2 px-5">Find Events</a>
          </div>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
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

function ChatWidget() {
  return (
    <div id="chat-widget" className="fixed bottom-6 right-6 z-50">
      <button
        className="w-14 h-14 bg-navy-700 rounded-full shadow-elevated flex items-center justify-center text-white hover:bg-navy-800 transition-all duration-200 hover:scale-105 active:scale-95"
        aria-label="Chat with us"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
