import type { Metadata } from 'next';
import './globals.css';
import ActivityTracker from './components/ActivityTracker';
import Navigation from './components/Navigation';
import ChatWidget from './components/ChatWidget';
import SiteFooter from './components/SiteFooter';

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
        <SiteFooter />
        <ChatWidget />
        <ActivityTracker />
      </body>
    </html>
  );
}

