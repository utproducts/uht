import type { Metadata } from 'next';
import { Oswald } from 'next/font/google';
import USAMap from './components/USAMap';

const oswald = Oswald({ subsets: ['latin'], weight: ['700'] });

export const metadata: Metadata = {
  title: 'Ultimate Hockey Tournaments — Premier Youth & Adult Hockey Events',
};

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]">
        {/* Soft decorative orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[#00ccff]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-white/5 rounded-full blur-2xl" />

        <div className="section py-24 sm:py-32 text-center relative z-10">
          <div className="mb-6 flex justify-center">
            <img
              src="/uht-logo.png"
              alt="Ultimate Hockey Tournaments"
              className="h-24 sm:h-32 w-auto drop-shadow-2xl"
            />
          </div>
          <p className="text-white/60 font-semibold text-sm tracking-widest uppercase mb-4">
            2025–26 Season
          </p>
          <h1
            className={oswald.className + " text-5xl sm:text-6xl lg:text-8xl font-bold uppercase tracking-tight text-white max-w-4xl mx-auto leading-[0.95]"}
          >
            WHERE CHAMPIONS{' '}
            <span className="text-[#a0e8ff]">COMPETE.</span>
          </h1>
          <p className="mt-6 text-xl text-white/70 max-w-2xl mx-auto leading-relaxed">
            Premier youth and adult hockey tournaments across the Midwest.
            Register your team, track live scores, and build your legacy.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <a href="/events" className="px-8 py-4 rounded-full bg-white text-[#003e79] font-semibold text-base hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg">
              View Events
            </a>
            <a href="/register" className="px-8 py-4 rounded-full bg-white/15 backdrop-blur-sm text-white font-semibold text-base border border-white/20 hover:bg-white/25 active:scale-[0.98] transition-all">
              Register Your Team
            </a>
          </div>
        </div>

        {/* Curved bottom edge */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 60V0c240 40 480 60 720 60s480-20 720-60v60H0z" fill="#f0f7ff" />
          </svg>
        </div>
      </section>

      {/* FIND EVENTS — MAP + STATE CARDS */}
      <section className="bg-[#f0f7ff]">
        <div className="section">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">Find events near you</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">Click an active state to browse tournaments in your area.</p>
          </div>
          <div className="hidden md:block mb-10">
            <USAMap />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { abbr: 'IL', name: 'Illinois', cities: ['Chicago'], events: 8 },
              { abbr: 'WI', name: 'Wisconsin', cities: ['WI Dells', 'Madison'], events: 6 },
              { abbr: 'MO', name: 'Missouri', cities: ['St. Louis'], events: 3 },
              { abbr: 'IN', name: 'Indiana', cities: ['South Bend'], events: 3 },
              { abbr: 'MI', name: 'Michigan', cities: ['Holland', 'Ann Arbor'], events: 4 },
            ].map((state) => (
              <a
                key={state.abbr}
                href={"/events?state=" + state.abbr}
                className="bg-white rounded-2xl p-5 shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_-10px_rgba(0,62,121,0.15)] hover:-translate-y-0.5 transition-all group border border-[#e8e8ed]"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-[#003e79] group-hover:text-[#00ccff] transition-colors">
                    {state.abbr}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f0f7ff] text-[#003e79]">{state.events} events</span>
                </div>
                <p className="text-sm font-medium text-[#1d1d1f]">{state.name}</p>
                <p className="text-xs text-[#6e6e73] mt-1">{state.cities.join(' · ')}</p>
                <div className="mt-3 flex items-center text-xs text-[#003e79] font-medium">
                  Browse events
                  <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Curved bottom */}
        <div className="relative -mb-px">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 40V0c240 28 480 40 720 40S1200 28 1440 0v40H0z" fill="#ffffff" />
          </svg>
        </div>
      </section>

      {/* CITIES */}
      <section className="bg-white">
        <div className="section">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">Our cities</h2>
            <p className="mt-3 text-lg text-[#6e6e73]">World-class tournaments in premier hockey markets.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { name: 'Chicago', state: 'IL', events: 8, gradient: 'from-[#003e79] to-[#00ccff]' },
              { name: 'Wisconsin Dells', state: 'WI', events: 4, gradient: 'from-[#005599] to-[#00ccff]' },
              { name: 'St. Louis', state: 'MO', events: 3, gradient: 'from-[#1a3a5c] to-[#00aabb]' },
              { name: 'South Bend', state: 'IN', events: 3, gradient: 'from-[#0c4a1e] to-[#00ccbb]' },
              { name: 'Madison', state: 'WI', events: 2, gradient: 'from-[#c5050c] to-[#ff6b6b]' },
              { name: 'Holland', state: 'MI', events: 2, gradient: 'from-[#4a2c0f] to-[#dda040]' },
              { name: 'Ann Arbor', state: 'MI', events: 2, gradient: 'from-[#00274c] to-[#00aaff]' },
            ].map((city) => (
              <a
                key={city.name}
                href={"/events?city=" + encodeURIComponent(city.name)}
                className="group relative rounded-2xl overflow-hidden border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_-10px_rgba(0,62,121,0.15)] hover:-translate-y-0.5 transition-all"
              >
                {/* Mini gradient accent bar */}
                <div className={`h-2 bg-gradient-to-r ${city.gradient}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[#1d1d1f] group-hover:text-[#003e79] transition-colors">{city.name}</h3>
                      <p className="text-sm text-[#6e6e73] mt-0.5">{city.state}</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f0f7ff] text-[#003e79]">{city.events} events</span>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-[#003e79] font-medium">
                    View events
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* UPCOMING EVENTS */}
      <section className="bg-[#fafafa]">
        <div className="section">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">Upcoming events</h2>
              <p className="mt-3 text-lg text-[#6e6e73]">Don&apos;t miss your chance to compete.</p>
            </div>
            <a href="/events" className="hidden sm:flex items-center text-sm text-[#003e79] font-medium hover:text-[#00ccff] transition-colors">
              View all events
              <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: 'The Deep Dish Cup', slug: 'chicago-deep-dish-cup-2026', logo: '/event-logos/deep-dish-cup.png', location: 'Chicago, IL', date: 'May 1-3, 2026', ages: ['Mite', 'Squirt', 'Pee Wee', 'Bantam'], spots: '12/16', gradient: 'from-[#003e79] via-[#005a9e] to-[#00ccff]' },
              { name: 'Windy City Showdown', slug: 'windy-city-showdown-2026', logo: '/event-logos/windy-city-showdown.png', location: 'Chicago, IL', date: 'May 16-18, 2026', ages: ['Squirt', 'Pee Wee', 'Bantam'], spots: '8/12', gradient: 'from-[#003e79] via-[#005a9e] to-[#00ccff]' },
              { name: 'Dells Summer Classic', slug: 'dells-summer-classic-2026', logo: '/event-logos/dells-summer-classic.png', location: 'WI Dells, WI', date: 'Jun 6-8, 2026', ages: ['Mite', 'Squirt', 'Pee Wee'], spots: '6/12', gradient: 'from-[#005599] via-[#0077bb] to-[#00ccff]' },
            ].map((evt) => (
              <div key={evt.slug} className="group bg-white rounded-2xl overflow-hidden border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_30px_-10px_rgba(0,62,121,0.15)] hover:-translate-y-0.5 transition-all">
                {/* Gradient header */}
                <div className={`relative bg-gradient-to-br ${evt.gradient} h-52 flex items-center justify-center overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />
                  {evt.logo ? (
                    <img src={evt.logo} alt={evt.name + ' logo'} className="relative z-10 w-36 h-36 object-contain drop-shadow-xl group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="relative z-10 w-36 h-36 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                      <span className="text-5xl">🏒</span>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 z-10">
                    <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/90 backdrop-blur-sm text-emerald-700 border border-emerald-200">Registration Open</span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-[#1d1d1f] group-hover:text-[#003e79] transition-colors">{evt.name}</h3>
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-2 text-sm text-[#6e6e73]">
                      <svg className="w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      {evt.location}
                    </p>
                    <p className="flex items-center gap-2 text-sm text-[#6e6e73]">
                      <svg className="w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {evt.date}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {evt.ages.map((age) => (
                      <span key={age} className="inline-block px-2.5 py-0.5 bg-[#f0f7ff] text-[#003e79] text-xs font-medium rounded-md">{age}</span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-[#86868b]">{evt.spots} spots filled</span>
                    <a href={'/events/' + evt.slug} className="px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] active:scale-[0.98] transition-all">
                      Register
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center sm:hidden">
            <a href="/events" className="px-6 py-3 rounded-full bg-white text-[#003e79] font-semibold border border-[#d2d2d7] hover:bg-[#f5f5f7] transition-all">View all events</a>
          </div>
        </div>
      </section>

      {/* SPONSOR CTA */}
      <section className="bg-white">
        <div className="section text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1d1d1f]">Partner with us</h2>
          <p className="mt-3 text-lg text-[#6e6e73] max-w-2xl mx-auto">
            Get your brand in front of thousands of hockey families.
            Per-event and season-long sponsorship packages available.
          </p>
          <div className="mt-8">
            <a href="/sponsors" className="px-8 py-4 rounded-full bg-[#003e79] text-white font-semibold text-base hover:bg-[#002d5a] active:scale-[0.98] transition-all shadow-md">
              Explore Sponsorships
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
