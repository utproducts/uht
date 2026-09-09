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
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Ultimate Hockey Tournaments',
    description: 'Premier youth and adult hockey tournaments across the Midwest.',
    url: 'https://ultimatetournaments.com',
    siteName: 'Ultimate Hockey Tournaments',
    type: 'website',
  },
};

// Some school/corporate/home-filter networks block *.workers.dev, which broke
// every API call for those users even though the site itself loaded (Kelley
// Becker, 9/9 — "no teams" on her computer while the app worked). The zone
// route ultimatetournaments.com/api/* serves the same Worker, so when the page
// is on our own domain, rewrite Worker-URL fetches to the domain route before
// any app code runs. Preview deploys (pages.dev) keep the direct Worker URL.
const API_FALLBACK_SCRIPT = `(function(){try{
if(!/(^|\\.)ultimatetournaments\\.com$/.test(location.hostname))return;
var W='https://uht.chad-157.workers.dev',A='https://ultimatetournaments.com',f=window.fetch;
window.fetch=function(i,o){try{
if(typeof i==='string'&&i.indexOf(W)===0)i=A+i.slice(W.length);
else if(i&&typeof i==='object'&&typeof i.url==='string'&&i.url.indexOf(W)===0)i=new Request(A+i.url.slice(W.length),i);
}catch(e){}
return f.call(this,i,o);};
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: API_FALLBACK_SCRIPT }} />
      </head>
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

