import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ultimate Hockey Tournaments — Premier Youth & Adult Hockey Events',
};

/* SVG path data for Midwest states */
const STATE_PATHS: Record<string, { d: string; label: string; x: number; y: number }> = {
  IL: {
    d: 'M540,280 L555,280 560,290 565,310 568,340 565,370 558,390 545,400 535,395 530,380 528,350 530,320 535,295Z',
    label: 'IL', x: 548, y: 340,
  },
  WI: {
    d: 'M510,180 L530,175 550,180 565,185 570,200 568,225 560,250 548,265 535,270 520,268 510,255 505,235 505,210Z',
    label: 'WI', x: 535, y: 225,
  },
  MI: {
    d: 'M575,175 L595,170 615,180 625,200 620,225 610,245 595,255 580,255 570,245 568,225 570,200Z',
    label: 'MI', x: 595, y: 215,
  },
  IN: {
    d: 'M570,290 L590,288 595,300 598,330 595,360 588,375 575,380 565,370 568,340Z',
    label: 'IN', x: 582, y: 335,
  },
  MO: {
    d: 'M470,330 L520,325 530,330 535,350 530,380 520,400 505,410 490,405 475,395 465,375 462,350Z',
    label: 'MO', x: 498, y: 368,
  },
  MN: {
    d: 'M460,140 L500,135 515,145 520,165 515,190 505,210 490,215 475,210 460,195 455,175 455,155Z',
    label: 'MN', x: 488, y: 175,
  },
  IA: {
    d: 'M460,230 L505,225 520,235 525,255 520,275 505,285 490,288 475,282 462,270 458,250Z',
    label: 'IA', x: 490, y: 258,
  },
  OH: {
    d: 'M600,270 L625,265 640,275 645,295 640,320 630,335 615,340 600,335 595,315 595,290Z',
    label: 'OH', x: 620, y: 302,
  },
};

const ACTIVE_STATES = ['IL', 'WI', 'MI', 'IN', 'MO'];

export default function HomePage() {
  return (
    <>
      {/* ==================
          HERO SECTION
          ================== */}
      <section className="relative overflow-hidden bg-navy-700">
        <div className="absolute inset-0">
          <img
            src="/AdobeStock_693343870.jpeg"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="section py-20 sm:py-28 text-center relative z-10">
          {/* Logo above season text */}
          <div className="mb-6 flex justify-center">
            <img
              src="/UHT%20(MAIN%20FILES)..png"
              alt="Ultimate Hockey Tournaments"
              className="h-24 sm:h-32 w-auto drop-shadow-lg"
            />
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
            <a href="/events" className="btn-primary text-base px-8 py-4">
              View Events
            </a>
            <a href="/register" className="btn-secondary text-base px-8 py-4">
              Register Your Team
            </a>
          </div>
        </div>
      </section>

      {/* ==================
          INTERACTIVE STATE MAP
          ================== */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
              Find events near you.
            </h2>
            <p className="mt-3 text-lg text-[#6e6e73]">
              Select a state to browse tournaments in your area.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* State cards grid — clean, interactive */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { code: 'IL', name: 'Illinois', cities: ['Chicago'], events: 8 },
                { code: 'WI', name: 'Wisconsin', cities: ['Wisconsin Dells', 'Madison'], events: 6 },
                { code: 'MO', name: 'Missouri', cities: ['St. Louis'], events: 3 },
                { code: 'IN', name: 'Indiana', cities: ['South Bend'], events: 3 },
                { code: 'MI', name: 'Michigan', cities: ['Holland', 'Ann Arbor'], events: 4 },
              ].map((state) => (
                <a
                  key={state.code}
                  href={`/events?state=${state.code}`}
                  className="group relative bg-white rounded-2xl p-5 border border-[#e8e8ed] hover:border-brand-500 hover:shadow-elevated transition-all duration-300"
                >
                  {/* State abbreviation */}
                  <div className="text-4xl font-bold text-navy-700 group-hover:text-brand-500 transition-colors">
                    {state.code}
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-semibold text-[#1d1d1f]">{state.name}</div>
                    <div className="text-xs text-[#6e6e73] mt-0.5">
                      {state.cities.join(', ')}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="badge badge-brand text-xs">{state.events} events</span>
                    <svg className="w-4 h-4 text-[#86868b] group-hover:text-brand-500 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              ))}
            </div>

            {/* Visual SVG map below the cards */}
            <div className="mt-10 bg-white rounded-3xl shadow-card p-6 sm:p-8">
              <svg
                viewBox="400 120 300 310"
                className="w-full h-auto"
                aria-label="Map of Midwest states with tournament locations"
              >
                {/* Background states (inactive) */}
                {Object.entries(STATE_PATHS)
                  .filter(([code]) => !ACTIVE_STATES.includes(code))
                  .map(([code, state]) => (
                    <g key={code}>
                      <path
                        d={state.d}
                        fill="#e8e8ed"
                        stroke="#d2d2d7"
                        strokeWidth="1.5"
                      />
                      <text
                        x={state.x}
                        y={state.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="text-[10px] fill-[#86868b] font-medium"
                        style={{ fontSize: '10px' }}
                      >
                        {state.label}
                      </text>
                    </g>
                  ))}

                {/* Active states (with events) */}
                {Object.entries(STATE_PATHS)
                  .filter(([code]) => ACTIVE_STATES.includes(code))
                  .map(([code, state]) => (
                    <a key={code} href={`/events?state=${code}`}>
                      <g className="cursor-pointer group">
                        <path
                          d={state.d}
                          fill="#003e79"
                          stroke="#00ccff"
                          strokeWidth="2"
                          className="transition-all duration-200 hover:fill-[#00508f]"
                        />
                        <text
                          x={state.x}
                          y={state.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-[11px] fill-white font-bold pointer-events-none"
                          style={{ fontSize: '11px' }}
                        >
                          {state.label}
                        </text>
                      </g>
                    </a>
                  ))}

                {/* City dots on active states */}
                {[
                  { x: 545, y: 310, name: 'Chicago' },
                  { x: 530, y: 210, name: 'WI Dells' },
                  { x: 518, y: 240, name: 'Madison' },
                  { x: 580, y: 360, name: 'South Bend' },
                  { x: 500, y: 380, name: 'St. Louis' },
                  { x: 610, y: 225, name: 'Holland' },
                  { x: 618, y: 235, name: 'Ann Arbor' },
                ].map((city) => (
                  <g key={city.name}>
                    <circle
                      cx={city.x}
                      cy={city.y}
                      r="4"
                      fill="#00ccff"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <text
                      x={city.x + 8}
                      y={city.y + 1}
                      className="text-[8px] fill-[#1d1d1f] font-medium"
                      style={{ fontSize: '8px' }}
                    >
                      {city.name}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ==================
          CITIES SECTION
          ================== */}
      <section className="bg-white">
        <div className="section">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
              Our cities.
            </h2>
            <p className="mt-3 text-lg text-[#6e6e73]">
              World-class tournaments in premier hockey markets.
            </p>
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
              <a
                key={city.name}
                href={`/events?city=${encodeURIComponent(city.name)}`}
                className="card p-6 group cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1d1d1f] group-hover:text-brand-500 transition-colors">
                      {city.name}
                    </h3>
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

      {/* ==================
          UPCOMING EVENTS
          ================== */}
      <section className="bg-[#f5f5f7]">
        <div className="section">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
                Upcoming events.
              </h2>
              <p className="mt-3 text-lg text-[#6e6e73]">
                Don&apos;t miss your chance to compete.
              </p>
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
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">
                    Event Name {i}
                  </h3>
                  <p className="text-sm text-[#6e6e73] mt-1">
                    Chicago, IL &middot; Apr 12-14, 2026
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="badge text-xs">Mite</span>
                    <span className="badge text-xs">Squirt</span>
                    <span className="badge text-xs">Peewee</span>
                    <span className="badge text-xs">Bantam</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-[#6e6e73]">12/16 spots filled</span>
                    <a href="/events/event-slug" className="btn-primary text-sm py-2 px-5">
                      Register
                    </a>
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

      {/* ==================
          SPONSOR CTA
          ================== */}
      <section className="bg-white">
        <div className="section text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-[#1d1d1f]">
            Partner with us.
          </h2>
          <p className="mt-3 text-lg text-[#6e6e73] max-w-2xl mx-auto">
            Get your brand in front of thousands of hockey families.
            Per-event and season-long sponsorship packages available.
          </p>
          <div className="mt-8">
            <a href="/sponsors" className="btn-primary text-base px-8 py-4">
              Explore Sponsorships
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
