import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Events — Ultimate Hockey Tournaments',
  description: 'Browse and register for upcoming hockey tournaments across the Midwest.',
};

/**
 * Events listing page
 * Grid layout showing all events with:
 * - Logo, date, event name, divisions, register button, availability
 * - Filtering by city, age group, date range
 * - NO modals — full detail pages instead
 */
export default function EventsPage() {
  return (
    <div className="bg-white min-h-screen">
      {/* Search/Filter Bar */}
      <div className="bg-[#f5f5f7] border-b border-[#e8e8ed]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-6">
          <h1 className="text-3xl font-semibold text-[#1d1d1f] mb-6">Events</h1>

          <div className="flex flex-wrap gap-3">
            {/* City filter */}
            <select className="input max-w-[200px] text-sm py-2.5">
              <option value="">All Cities</option>
              <option>Chicago, IL</option>
              <option>Wisconsin Dells, WI</option>
              <option>St. Louis, MO</option>
              <option>South Bend, IN</option>
              <option>Madison, WI</option>
              <option>Holland, MI</option>
              <option>Ann Arbor, MI</option>
            </select>

            {/* Age group filter */}
            <select className="input max-w-[180px] text-sm py-2.5">
              <option value="">All Age Groups</option>
              <option>Mite</option>
              <option>8U</option>
              <option>10U</option>
              <option>12U</option>
              <option>14U</option>
              <option>16U</option>
              <option>18U</option>
              <option>Adult</option>
            </select>

            {/* Season filter */}
            <select className="input max-w-[180px] text-sm py-2.5">
              <option value="">All Seasons</option>
              <option>Fall 2026</option>
              <option>Winter 2026-27</option>
              <option>Spring 2027</option>
            </select>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                placeholder="Search events..."
                className="input text-sm py-2.5"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Event cards will be rendered dynamically from API */}
          {/* This is the static scaffold showing the card structure */}
          {Array.from({ length: 6 }).map((_, i) => (
            <a
              key={i}
              href={`/events/event-slug-${i + 1}`}
              className="card overflow-hidden group"
            >
              {/* Event Logo — prominently displayed */}
              <div className="aspect-[3/2] bg-gradient-to-br from-[#f5f5f7] to-[#e8e8ed] flex items-center justify-center relative">
                <div className="w-28 h-28 bg-white rounded-2xl shadow-soft flex items-center justify-center">
                  <span className="text-[#86868b] text-xs font-medium">Event Logo</span>
                </div>
                {/* Status badge */}
                <div className="absolute top-4 right-4">
                  <span className="badge badge-success text-xs font-semibold">
                    Registration Open
                  </span>
                </div>
              </div>

              {/* Event Details */}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-[#1d1d1f] group-hover:text-brand-500 transition-colors">
                  Sample Tournament {i + 1}
                </h3>
                <p className="text-sm text-[#6e6e73] mt-1">
                  Chicago, IL &middot; Apr {12 + i * 2}-{14 + i * 2}, 2026
                </p>

                {/* Divisions offered */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="badge text-xs">Mite</span>
                  <span className="badge text-xs">Squirt</span>
                  <span className="badge text-xs">Peewee</span>
                  <span className="badge text-xs">Bantam</span>
                </div>

                {/* Availability + Register */}
                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {/* Availability bar */}
                      <div className="w-24 h-1.5 bg-[#e8e8ed] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${60 + i * 5}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#86868b]">
                        {Math.floor(10 + i * 2)}/{16} spots
                      </span>
                    </div>
                  </div>
                  <span className="btn-primary text-sm py-2 px-5">
                    Register
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
