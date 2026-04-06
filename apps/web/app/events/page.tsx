'use client';

import { useState, useEffect, useCallback } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface Event {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  logo_url: string | null;
  information: string | null;
  age_groups: string | null;
  divisions: string | null;
  price_cents: number | null;
  slots_count: number | null;
  is_sold_out: number;
}

/* ── helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'short' });
  if (s.getMonth() === e.getMonth()) {
    return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const mo2 = e.toLocaleString('en-US', { month: 'short' });
  return `${mo} ${s.getDate()} – ${mo2} ${e.getDate()}, ${s.getFullYear()}`;
}

function formatPrice(cents: number | null) {
  if (!cents) return '';
  return `$${(cents / 100).toLocaleString()}`;
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function statusLabel(status: string) {
  switch (status) {
    case 'registration_open': return 'Registration Open';
    case 'completed': return 'Completed';
    case 'active': return 'In Progress';
    case 'registration_closed': return 'Registration Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'registration_open': return 'bg-emerald-500 text-white';
    case 'completed': return 'bg-gray-500 text-white';
    case 'active': return 'bg-blue-500 text-white';
    case 'registration_closed': return 'bg-amber-500 text-white';
    default: return 'bg-gray-400 text-white';
  }
}

/* ── city color map for card gradients ── */
function cityGradient(city: string): string {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return 'from-[#003e79] to-[#00264d]';
  if (c.includes('st. louis') || c.includes('st louis')) return 'from-[#1a3a5c] to-[#0d1f33]';
  if (c.includes('south bend')) return 'from-[#0c4a1e] to-[#082d12]';
  if (c.includes('ann arbor')) return 'from-[#00274c] to-[#001a33]';
  if (c.includes('madison')) return 'from-[#c5050c] to-[#7a0308]';
  if (c.includes('holland')) return 'from-[#4a2c0f] to-[#2d1a09]';
  return 'from-[#003e79] to-[#001f3f]';
}

/* ── Event Card ── */
function EventCard({ event }: { event: Event }) {
  const ageGroups = parseJsonArray(event.age_groups);
  const isUpcoming = event.status === 'registration_open' || event.status === 'active';
  const isPast = event.status === 'completed';

  // Extract the "tournament name" part (after the city prefix)
  const displayName = event.name.replace(/^\w[\w\s.'']*\s*-\s*/, '');

  return (
    <div
      className={`group relative rounded-2xl overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 border-l-4 border-[#00ccff] ${
        isPast ? 'opacity-75 hover:opacity-100' : ''
      }`}
    >
      {/* ── Card Header: gradient bg + watermark logo + actual logo ── */}
      <div className={`relative bg-gradient-to-br ${cityGradient(event.city)} h-48 flex items-center justify-center overflow-hidden`}>
        {/* Diagonal stripe accent */}
        <div className="absolute inset-0 bg-diagonal-stripes opacity-10 pointer-events-none" />
        {/* Large watermark/shadow logo in background */}
        {event.logo_url && (
          <img
            src={event.logo_url}
            alt=""
            className="absolute inset-0 w-full h-full object-contain opacity-[0.07] scale-[1.8] blur-[1px] pointer-events-none select-none"
          />
        )}

        {/* Actual logo - crisp and centered */}
        <div className="relative z-10 flex flex-col items-center">
          {event.logo_url ? (
            <img
              src={event.logo_url}
              alt={event.name}
              className="w-28 h-28 object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
              <span className="text-white/60 text-3xl">🏒</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="absolute top-3 right-3 z-10">
          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor(event.status)}`}>
            {statusLabel(event.status)}
          </span>
        </div>

        {/* Price badge */}
        {event.price_cents && isUpcoming && (
          <div className="absolute top-3 left-3 z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-white/20 backdrop-blur-sm text-white">
              {formatPrice(event.price_cents)}
            </span>
          </div>
        )}

        {/* Bottom fade for text readability */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* ── Card Body ── */}
      <div className="p-5 bg-white">
        {/* Event name */}
        <h3 className="text-lg font-bold text-[#1d1d1f] leading-tight group-hover:text-[#00ccff] transition-colors">
          {displayName}
        </h3>
        {/* Location & dates */}
        <p className="text-sm text-[#6e6e73] mt-1.5">
          {event.city}, {event.state} · {formatDateRange(event.start_date, event.end_date)}
        </p>

        {/* Age groups */}
        {ageGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ageGroups.map(ag => (
              <span key={ag} className="inline-block px-2.5 py-0.5 bg-[#f5f5f7] text-[#6e6e73] text-xs font-medium rounded-md">
                {ag}
              </span>
            ))}
          </div>
        )}

        {/* Info snippet */}
        {event.information && (
          <p className="text-xs text-[#86868b] mt-3 line-clamp-2">{event.information}</p>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          {isUpcoming ? (
            <>
              <a
                href={`/events/${event.slug}`}
                className="text-sm font-medium text-[#00ccff] hover:text-[#0099bf] transition-colors"
              >
                View Details
              </a>
              <a
                href={`/register?event=${event.slug}&eventId=${event.id}`}
                onClick={(e) => e.stopPropagation()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#00ccff] hover:bg-[#00b8e6] active:scale-95 transition-all shadow-sm inline-block"
              >
                Register
              </a>
            </>
          ) : (
            <a
              href={`/events/${event.slug}`}
              className="text-sm font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
            >
              View Results →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Events Page ── */
export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cityFilter, setCityFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [search, setSearch] = useState('');
  // On mount, check URL for ?register=<slug> (redirect to new registration page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('register');
    if (slug) {
      // Clean the URL and redirect to registration page once events load
      window.history.replaceState({}, '', window.location.pathname);
      // We'll redirect once events are loaded below
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = tab === 'upcoming' ? '' : '&status=completed';
      const cityParam = cityFilter ? `&city=${encodeURIComponent(cityFilter)}` : '';
      const res = await fetch(`${API}/events?per_page=50${statusParam}${cityParam}`);
      const json = await res.json();
      let data: Event[] = json.data || [];

      // Client-side filter for upcoming (exclude completed) vs past
      if (tab === 'upcoming') {
        data = data.filter(e => e.status !== 'completed');
      }

      // Sort: upcoming by start_date ASC, past by start_date DESC
      data.sort((a, b) => {
        const da = new Date(a.start_date).getTime();
        const db = new Date(b.start_date).getTime();
        return tab === 'upcoming' ? da - db : db - da;
      });

      setEvents(data);
    } catch (err) {
      console.error('Failed to load events:', err);
    }
    setLoading(false);
  }, [tab, cityFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Client-side filters
  let filtered = events;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.city.toLowerCase().includes(q) ||
      (e.information || '').toLowerCase().includes(q)
    );
  }
  if (ageFilter) {
    filtered = filtered.filter(e => {
      const ags = parseJsonArray(e.age_groups);
      return ags.some(ag => ag.toLowerCase().includes(ageFilter.toLowerCase()));
    });
  }

  // Get unique cities for filter
  const cities = Array.from(new Set(events.map(e => e.city))).sort();

  const upcomingCount = events.filter(e => e.status !== 'completed').length;
  const pastCount = events.filter(e => e.status === 'completed').length;

  return (
    <div className="bg-gradient-to-b from-[#0a1929] via-[#051e35] to-[#051e35] min-h-screen">
      {/* Hero header */}
      <div className="bg-gradient-to-br from-[#003e79] to-[#001f3f] relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10 w-64 h-64 border border-white/20 rounded-full" />
          <div className="absolute bottom-5 right-20 w-96 h-96 border border-white/10 rounded-full" />
        </div>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-12 relative z-10">
          <h1 className="text-4xl font-bold text-white">Events</h1>
          <p className="text-white/60 mt-2 text-lg">
            Browse tournaments across the Midwest and register your team today.
          </p>

          {/* Tabs */}
          <div className="mt-8 flex gap-1 bg-white/10 rounded-xl p-1 w-fit">
            <button
              onClick={() => setTab('upcoming')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === 'upcoming'
                  ? 'bg-white text-[#003e79] shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setTab('past')}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === 'past'
                  ? 'bg-white text-[#003e79] shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Past Events
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gradient-to-r from-[#003e79]/95 to-[#002851]/95 backdrop-blur-md border-b border-[#00ccff]/20 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-[#00ccff]/30 bg-white/10 backdrop-blur-sm text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-[#00ccff]"
            >
              <option value="">All Cities</option>
              <option value="Chicago">Chicago, IL</option>
              <option value="St. Louis">St. Louis, MO</option>
              <option value="South Bend">South Bend, IN</option>
              <option value="Ann Arbor">Ann Arbor, MI</option>
              <option value="Madison">Madison, WI</option>
              <option value="Holland">Holland, MI</option>
              <option value="Wisconsin Dells">Wisconsin Dells, WI</option>
            </select>

            <select
              value={ageFilter}
              onChange={e => setAgeFilter(e.target.value)}
              className="px-4 py-2.5 rounded-lg border border-[#00ccff]/30 bg-white/10 backdrop-blur-sm text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-[#00ccff]"
            >
              <option value="">All Age Groups</option>
              <option value="Mite">Mite</option>
              <option value="Squirt">Squirt</option>
              <option value="Pee Wee">Pee Wee</option>
              <option value="Bantam">Bantam</option>
              <option value="16u">16u / JV</option>
              <option value="18u">18u / Var.</option>
            </select>

            <div className="flex-1 min-w-[180px]">
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-full px-4 py-2.5 rounded-lg border border-[#00ccff]/30 bg-white/10 backdrop-blur-sm text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#00ccff] focus:border-[#00ccff]"
              />
            </div>

            <span className="text-sm text-white/70 ml-auto">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-10">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-white shadow-card animate-pulse">
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-6 w-14 bg-gray-100 rounded" />
                    <div className="h-6 w-14 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏒</div>
            <h3 className="text-xl font-semibold text-[#1d1d1f]">No events found</h3>
            <p className="text-[#6e6e73] mt-2">
              {tab === 'upcoming'
                ? 'Check back soon for new upcoming tournaments!'
                : 'Try adjusting your filters to find past events.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(event => (
              <EventCard
                key={event.id}
                event={event}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
