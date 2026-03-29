import type { Metadata } from 'next';
import USAMap from './components/USAMap';

export const metadata: Metadata = {
  title: 'Ultimate Hockey Tournaments — Premier Youth & Adult Hockey Events',
};

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-navy-700">
        <div className="absolute inset-0">
          <img src="/AdobeStock_693343870.jpeg" alt="" className="w-full h-full object-cover opacity-30" />
        </div>
        <div className="section py-20 sm:py-28 text-center relative z-10">
          <div className="mb-6 flex justify-center">
            <img src="/uht-logo.png" alt="Ultimate Hockey Tournaments" className="h-24 sm:h-32 w-auto drop-shadow-lg" />
          </div>
          <p className="text-brand-300 font-medium text-sm tracking-wide uppercase mb-4">
            2026-2027 Season
          </p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold text-white max-w-4xl mx-auto leading-[1.05]">
            Where champions{' '}
            <span className="text-brand-400">compete.</span>
          </h1>
          <p className="mt-6 text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            Premier youth and adult hockey tournaments across the Midwest.
            Register your team, track live scores, and build your legacy.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a href="/events" className="btn-primary text-base px-8 py-4">View Events</a>
            <a href="/register" className="btn-secondary text-base px-8 py-4">Register Your Team</a>
          </div>
        </div>
      </section>

      {/* INTERACTIVE US MAP */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">Find events near you.</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">Click an active state to browse tournaments in your area.</p>
          </div>
          <USAMap />
        </div>
      </section>

      {/* CITIES */}
      <section className="bg-white">
        <div className="section">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">Our cities.</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">World-class tournaments in premier hockey markets.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Chicago', state: 'IL', events: 8 },
              { name: 'Wisconsin Dells', state: 'WI', events: 4 },
              { name: 'St. Louis', state: 'MO', events: 3 },
              { name: 'South Bend', state: 'IN', events: 3 },
              { name: 'Madison', state: 'WI', events: 2 },
              { name: 'Holland', state: 'MI', events: 2 },
              { name: 'Ann Arbor', state: 'MI', events: 2 },
            ].map((city) => (
              <a key={city.name} href={`/events?city=${encodeURIComponent(city.name)}`} className="card p-6 group cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1d1d1f] group-hover:text-brand-500 transition-colors">{city.name}</h3>
                    <p className="text-sm text-[#6e6e73] mt-1">{city.state}</p>
                  </div>
                  <span className="badge badge-brand">{city.events} events</span>
                </div>
                <div className="mt-4 flex items-center text-sm text-brand-500 font-medium">
                  View events
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* UPCOMING EVENTS */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">Upcoming events.</h2>
              <p className="mt-3 text-lg text-[#6e6e73]">Don&apos;t miss your chance to compete.</p>
            </div>
            <a href="/events" className="btn-ghost text-sm hidden sm:flex">
              View all events
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card overflow-hidden">
                <div className="aspect-[3/2] bg-gradient-to-br from-brand-50 to-navy-50 flex items-center justify-center">
                  <div className="w-24 h-24 bg-white rounded-2xl shadow-soft flex items-center justify-center">
                    <span className="text-[#86868b] text-xs">Event Logo</span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="badge badge-brand text-xs">Registration Open</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">Event Name {i}</h3>
                  <p className="text-sm text-[#6e6e73] mt-1">Chicago, IL &middot; Apr 12-14, 2026</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="badge text-xs">Mite</span>
                    <span className="badge text-xs">Squirt</span>
                    <span className="badge text-xs">Peewee</span>
                    <span className="badge text-xs">Bantam</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-[#6e6e73]">12/16 spots filled</span>
                    <a href="/events/event-slug" className="btn-primary text-sm py-2 px-5">Register</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center sm:hidden">
            <a href="/events" className="btn-secondary">View all events</a>
          </div>
        </div>
      </section>

      {/* SPONSOR CTA */}
      <section className="bg-white">
        <div className="section text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">Partner with us.</h2>
          <p className="mt-3 text-lg text-[#6e6e73] max-w-2xl mx-auto">
            Get your brand in front of thousands of hockey families.
            Per-event and season-long sponsorship packages available.
          </p>
          <div className="mt-8">
            <a href="/sponsors" className="btn-primary text-base px-8 py-4">Explore Sponsorships</a>
          </div>
        </div>
      </section>
    </>
  );
}
