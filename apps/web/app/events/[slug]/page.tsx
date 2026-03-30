import type { Metadata } from 'next';

const EVENTS: Record<string, any> = {
  'chicago-deep-dish-cup-2026': {
    name: 'The Deep Dish Cup',
    date: 'May 01 - 03, 2026',
    location: 'Chicago, Illinois',
    status: 'Open',
    ageGroups: ['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.'],
    skillLevels: 'AA, A, B, C, D, House',
    gameGuarantee: 4,
    description: 'Welcome to the Deep Dish Cup which is a part of the Chicago series for Ultimate Tournaments. This event will take place on May 1st-3rd. This event is a 4 game guarantee!',
    ageDefinitions: [
      { label: 'Mite', value: '8 & Under' },
      { label: 'Squirt', value: '10 & Under' },
      { label: 'Pee Wee', value: '12 & Under' },
      { label: 'Bantam', value: '14 & Under' },
      { label: 'Midget', value: '18 & Under' },
    ],
    arenas: [
      { name: 'Canlan West Dundee - Center', address: '801 Wesemann Dr, West Dundee, IL 60118' },
      { name: 'Canlan West Dundee - South', address: '801 Wesemann Dr, West Dundee, IL 60118' },
      { name: 'Canlan West Dundee - JJ', address: '801 Wesemann Dr, West Dundee, IL 60118' },
      { name: 'Addison Ice Arena - NHL', address: '475 S Grace St, Addison, IL 60101' },
      { name: 'Addison Ice Arena - Olympic', address: '475 S Grace St, Addison, IL 60101' },
    ],
    pricing: [
      { ageGroup: 'Mite', format: '11 min', price: '$1,695.00' },
      { ageGroup: 'Squirt', format: '12 min', price: '$1,745.00' },
      { ageGroup: 'Pee Wee', format: '12 min', price: '$1,795.00' },
      { ageGroup: 'Bantam', format: '13 min', price: '$1,895.00' },
      { ageGroup: '16u/JV', format: '14 min', price: '$1,995.00' },
      { ageGroup: '18u/Var.', format: '14 min', price: '$1,995.00' },
    ],
    hotels: [
      { name: 'Aloft Chicago O\'Hare', rate: '$179.00', beds: '2 Beds/1 Bed', rating: 5.1 },
      { name: 'Crowne Plaza Chicago O\'Hare', rate: '$149.00', beds: 'Double Queen Beds', rating: 5.1 },
      { name: 'Renaissance Chicago O\'Hare Suites', rate: '$139.00', beds: 'Two Double Beds', rating: 5.1 },
      { name: 'Hilton Rosemont/Chicago O\'Hare', rate: '$144.00', beds: 'Double Queens', rating: 5.1 },
      { name: 'DoubleTree O\'Hare Rosemont', rate: '$159.00', beds: 'Double Beds', rating: 5.1 },
      { name: 'Courtyard Chicago O\'Hare', rate: '$139.00', beds: 'Double Queen', rating: 5.1 },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(EVENTS).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const event = EVENTS[params.slug];
  return {
    title: event ? event.name + ' | Ultimate Hockey Tournaments' : 'Event Not Found',
  };
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Open' ? 'bg-green-500' : status === 'Closed' ? 'bg-red-500' : 'bg-yellow-500';
  return <span className={color + ' text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide'}>{status}</span>;
}

function TabButton({ label, active }: { label: string; active: boolean }) {
  return (
    <button className={
      'px-5 py-3 text-sm font-semibold border-b-2 transition-colors ' +
      (active ? 'border-[#00ccff] text-[#00ccff]' : 'border-transparent text-[#6e6e73] hover:text-white')
    }>{label}</button>
  );
}

export default function EventPage({ params }: { params: { slug: string } }) {
  const event = EVENTS[params.slug];

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#003e79]">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Event Not Found</h1>
          <a href="/events" className="text-[#00ccff] hover:underline">Back to Events</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Breadcrumb */}
      <div className="bg-[#003e79]">
        <div className="section">
          <nav className="flex items-center gap-2 text-sm py-4">
            <a href="/events" className="text-[#00ccff] hover:underline">Events</a>
            <span className="text-white/40">/</span>
            <span className="text-white/70">{event.name}</span>
          </nav>
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-[#003e79] pb-12">
        <div className="section">
          <div className="flex flex-col md:flex-row items-start gap-8">
            {/* Event Logo Placeholder */}
            <div className="w-28 h-28 bg-[#001f3f] rounded-xl flex items-center justify-center border border-white/10 shrink-0">
              <svg className="w-16 h-16 text-[#00ccff]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>

            {/* Event Details */}
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{event.name}</h1>
                  <div className="mt-3 flex items-center gap-3">
                    <StatusBadge status={event.status} />
                    <span className="text-white/60 text-sm">{event.gameGuarantee} Game Guarantee</span>
                  </div>
                </div>
                <a href="#register" className="btn-primary text-base px-8 py-3 shrink-0">Register Now</a>
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <div className="bg-white/5 rounded-lg px-4 py-3">
                  <p className="text-[#00ccff] text-xs font-semibold uppercase tracking-wider">Date</p>
                  <p className="text-white font-medium mt-1">{event.date}</p>
                </div>
                <div className="bg-white/5 rounded-lg px-4 py-3">
                  <p className="text-[#00ccff] text-xs font-semibold uppercase tracking-wider">Location</p>
                  <p className="text-white font-medium mt-1">{event.location}</p>
                </div>
                <div className="bg-white/5 rounded-lg px-4 py-3">
                  <p className="text-[#00ccff] text-xs font-semibold uppercase tracking-wider">Age Groups</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {event.ageGroups.map((ag: string) => (
                      <span key={ag} className="badge badge-brand text-xs">{ag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[#e5e5e7] sticky top-0 z-20">
        <div className="section flex gap-0 overflow-x-auto">
          <TabButton label="Event Info" active={true} />
          <TabButton label="Schedule" active={false} />
          <TabButton label="Rules" active={false} />
          <TabButton label="Promos" active={false} />
        </div>
      </div>

      {/* Content */}
      <div className="section py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Event Description */}
            <div className="card p-6">
              <h2 className="text-xl font-bold text-[#003e79] mb-4">Event Information</h2>
              <p className="text-[#6e6e73] leading-relaxed">{event.description}</p>
              <div className="mt-4">
                <p className="text-sm font-semibold text-[#1d1d1f] mb-2">Skill Levels: {event.skillLevels}</p>
                <p className="text-sm font-semibold text-[#1d1d1f] mb-3">Spring Age Level Determined by Age not Birth Year:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {event.ageDefinitions.map((ad: any) => (
                    <div key={ad.label} className="bg-[#f5f5f7] rounded-lg px-3 py-2">
                      <span className="font-semibold text-[#003e79] text-sm">{ad.label}:</span>
                      <span className="text-[#6e6e73] text-sm ml-1">{ad.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Arenas */}
            <div className="card p-6">
              <h2 className="text-xl font-bold text-[#003e79] mb-4">Arenas</h2>
              <div className="space-y-3">
                {event.arenas.map((arena: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-[#f5f5f7] rounded-lg px-4 py-3">
                    <div>
                      <p className="font-semibold text-[#1d1d1f] text-sm">{arena.name}</p>
                      <p className="text-[#6e6e73] text-xs mt-0.5">{arena.address}</p>
                    </div>
                    <a
                      href={'https://maps.google.com/?q=' + encodeURIComponent(arena.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00ccff] hover:text-[#003e79] transition-colors shrink-0 ml-4"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Format & Pricing */}
            <div className="card p-6">
              <h2 className="text-xl font-bold text-[#003e79] mb-4">Format & Pricing</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#003e79] text-white">
                      <th className="text-left px-4 py-3 rounded-tl-lg font-semibold">Age Group</th>
                      <th className="text-center px-4 py-3 font-semibold">Period Length</th>
                      <th className="text-right px-4 py-3 rounded-tr-lg font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.pricing.map((row: any, i: number) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-[#f5f5f7]' : 'bg-white'}>
                        <td className="px-4 py-3 font-medium text-[#1d1d1f]">{row.ageGroup}</td>
                        <td className="px-4 py-3 text-center text-[#6e6e73]">{row.format}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#003e79]">{row.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Info Card */}
            <div className="card p-6 bg-[#003e79] text-white">
              <h3 className="font-bold text-lg mb-4">Quick Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-white/60">Event</span><span className="font-medium">{event.name}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Dates</span><span className="font-medium">{event.date}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Location</span><span className="font-medium">{event.location}</span></div>
                <div className="flex justify-between"><span className="text-white/60">Games</span><span className="font-medium">{event.gameGuarantee} Guaranteed</span></div>
                <div className="flex justify-between"><span className="text-white/60">Arenas</span><span className="font-medium">{event.arenas.length} Rinks</span></div>
              </div>
              <a href="#register" className="mt-6 block w-full text-center bg-[#00ccff] hover:bg-[#00b8e6] text-[#003e79] font-bold py-3 rounded-lg transition-colors">Register Now</a>
            </div>

            {/* Accommodations */}
            <div className="card p-6">
              <h3 className="font-bold text-lg text-[#003e79] mb-4">Accommodations</h3>
              <div className="space-y-3">
                {event.hotels.map((hotel: any, i: number) => (
                  <div key={i} className="bg-[#f5f5f7] rounded-lg p-3">
                    <p className="font-semibold text-[#1d1d1f] text-sm">{hotel.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-[#6e6e73]">{hotel.beds}</span>
                      <span className="text-sm font-bold text-[#003e79]">{hotel.rate}<span className="text-xs font-normal text-[#6e6e73]">/night</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
