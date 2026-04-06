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
  deposit_cents: number | null;
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
    case 'active': return 'bg-cyan-500 text-white';
    case 'registration_closed': return 'bg-amber-500 text-white';
    default: return 'bg-gray-400 text-white';
  }
}

/* ── city accent colors ── */
function cityAccent(city: string): { bg: string; border: string; glow: string; text: string } {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return { bg: 'from-blue-600/20 to-blue-900/40', border: 'border-blue-400/40', glow: 'shadow-blue-500/20', text: 'text-blue-300' };
  if (c.includes('st. louis') || c.includes('st louis')) return { bg: 'from-red-600/20 to-red-900/40', border: 'border-red-400/40', glow: 'shadow-red-500/20', text: 'text-red-300' };
  if (c.includes('south bend')) return { bg: 'from-green-600/20 to-green-900/40', border: 'border-green-400/40', glow: 'shadow-green-500/20', text: 'text-green-300' };
  if (c.includes('ann arbor')) return { bg: 'from-yellow-600/20 to-amber-900/40', border: 'border-yellow-400/40', glow: 'shadow-yellow-500/20', text: 'text-yellow-300' };
  if (c.includes('madison')) return { bg: 'from-red-700/20 to-red-950/40', border: 'border-red-500/40', glow: 'shadow-red-600/20', text: 'text-red-300' };
  if (c.includes('holland')) return { bg: 'from-orange-600/20 to-orange-900/40', border: 'border-orange-400/40', glow: 'shadow-orange-500/20', text: 'text-orange-300' };
  return { bg: 'from-cyan-600/20 to-cyan-900/40', border: 'border-cyan-400/40', glow: 'shadow-cyan-500/20', text: 'text-cyan-300' };
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ── Featured Event (Next Upcoming) ── */
function FeaturedEvent({ event }: { event: Event }) {
  const ageGroups = parseJsonArray(event.age_groups);
  const days = daysUntil(event.start_date);
  const accent = cityAccent(event.city);

  return (
    <div className="relative group">
      {/* Glow effect behind card */}
      <div className={`absolute -inset-1 bg-gradient-to-r from-[#00ccff] via-[#0088ff] to-[#00ccff] rounded-3xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500`} />

      <div className="relative bg-gradient-to-br from-[#0c1a2e] to-[#0a1525] rounded-2xl overflow-hidden border border-white/10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
          {/* Left: Logo area */}
          <div className={`lg:col-span-2 relative bg-gradient-to-br ${accent.bg} p-8 lg:p-10 flex items-center justify-center min-h-[280px]`}>
            {/* Diagonal accents */}
            <div className="absolute inset-0 bg-diagonal-stripes opacity-5" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#00ccff]/10 to-transparent" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-[#00ccff]/10 to-transparent" />

            {event.logo_url ? (
              <img
                src={event.logo_url}
                alt={event.name}
                className="w-48 h-48 object-contain drop-shadow-[0_0_30px_rgba(0,204,255,0.3)] group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-48 h-48 rounded-3xl bg-white/5 backdrop-blur flex items-center justify-center border border-white/10">
                <span className="text-6xl">🏒</span>
              </div>
            )}

            {/* "NEXT UP" badge */}
            <div className="absolute top-4 left-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#00ccff] text-[#003e79]">
                <span className="w-2 h-2 bg-[#003e79] rounded-full animate-pulse" />
                Next Up
              </span>
            </div>
          </div>

          {/* Right: Event info */}
          <div className="lg:col-span-3 p-8 lg:p-10 flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor(event.status)}`}>
                {statusLabel(event.status)}
              </span>
              {days > 0 && days <= 60 && (
                <span className="text-[#00ccff] text-sm font-semibold">
                  {days} day{days !== 1 ? 's' : ''} away
                </span>
              )}
            </div>

            <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-3">{event.name}</h2>

            <div className="flex flex-wrap items-center gap-4 text-white/60 mb-5">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {event.city}, {event.state}
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {formatDateRange(event.start_date, event.end_date)}
              </span>
            </div>

            {/* Age group pills */}
            {ageGroups.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {ageGroups.map(ag => (
                  <span key={ag} className="px-3 py-1 bg-white/10 text-white/80 text-sm font-medium rounded-lg border border-white/10">
                    {ag}
                  </span>
                ))}
              </div>
            )}

            {/* Price + CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={`/register?event=${event.slug}&eventId=${event.id}`}
                className="px-8 py-3.5 rounded-xl bg-[#00ccff] text-[#003e79] font-bold text-base hover:bg-[#00e5ff] active:scale-95 transition-all shadow-lg shadow-[#00ccff]/25"
              >
                Register Now
              </a>
              <a
                href={`/events/${event.slug}`}
                className="px-6 py-3.5 rounded-xl bg-white/10 text-white font-semibold text-base hover:bg-white/20 transition-all border border-white/10"
              >
                View Details
              </a>
              {event.price_cents && (
                <span className="text-white/50 text-sm">Starting at <span className="text-white font-bold text-lg">{formatPrice(event.price_cents)}</span></span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Event Card ── */
function EventCard({ event }: { event: Event }) {
  const ageGroups = parseJsonArray(event.age_groups);
  const isUpcoming = event.status === 'registration_open' || event.status === 'active';
  const isPast = event.status === 'completed';
  const accent = cityAccent(event.city);
  const days = daysUntil(event.start_date);

  return (
    <a
      href={`/events/${event.slug}`}
      className={`group relative block rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${isPast ? 'opacity-70 hover:opacity-100' : ''}`}
    >
      {/* Card glow on hover */}
      <div className={`absolute -inset-0.5 bg-gradient-to-b from-[#00ccff]/0 to-[#00ccff]/0 group-hover:from-[#00ccff]/30 group-hover:to-transparent rounded-2xl blur-sm transition-all duration-300 opacity-0 group-hover:opacity-100`} />

      <div className={`relative bg-gradient-to-b from-[#111c2e] to-[#0d1624] border ${accent.border} rounded-2xl overflow-hidden group-hover:border-[#00ccff]/50 transition-colors`}>
        {/* Card Header */}
        <div className={`relative bg-gradient-to-br ${accent.bg} h-44 flex items-center justify-center overflow-hidden`}>
          <div className="absolute inset-0 bg-diagonal-stripes opacity-5" />

          {/* Watermark */}
          {event.logo_url && (
            <img src={event.logo_url} alt="" className="absolute inset-0 w-full h-full object-contain opacity-[0.06] scale-[1.8] blur-[1px] pointer-events-none" />
          )}

          {/* Logo */}
          <div className="relative z-10">
            {event.logo_url ? (
              <img src={event.logo_url} alt={event.name} className="w-24 h-24 object-contain drop-shadow-[0_0_20px_rgba(0,204,255,0.2)] group-hover:scale-110 transition-transform duration-300" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-white/5 backdrop-blur flex items-center justify-center border border-white/10">
                <span className="text-3xl">🏒</span>
              </div>
            )}
          </div>

          {/* Status badge */}
          <div className="absolute top-3 right-3 z-10">
            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${statusColor(event.status)}`}>
              {statusLabel(event.status)}
            </span>
          </div>

          {/* Countdown */}
          {isUpcoming && days > 0 && days <= 90 && (
            <div className="absolute top-3 left-3 z-10">
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/40 backdrop-blur-sm text-[#00ccff] border border-[#00ccff]/30">
                {days}d
              </span>
            </div>
          )}

          {/* Bottom gradient */}
          <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-[#111c2e] to-transparent" />
        </div>

        {/* Card Body */}
        <div className="p-5">
          <h3 className="text-base font-bold text-white leading-snug group-hover:text-[#00ccff] transition-colors line-clamp-2">
            {event.name}
          </h3>

          <div className="flex items-center gap-2 mt-2 text-white/50 text-sm">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>{event.city}, {event.state}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-white/50 text-sm">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span>{formatDateRange(event.start_date, event.end_date)}</span>
          </div>

          {/* Age groups */}
          {ageGroups.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {ageGroups.slice(0, 4).map(ag => (
                <span key={ag} className="inline-block px-2 py-0.5 bg-white/5 text-white/60 text-[11px] font-medium rounded border border-white/10">
                  {ag}
                </span>
              ))}
              {ageGroups.length > 4 && (
                <span className="inline-block px-2 py-0.5 bg-white/5 text-white/40 text-[11px] font-medium rounded border border-white/10">
                  +{ageGroups.length - 4}
                </span>
              )}
            </div>
          )}

          {/* Bottom row */}
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            {event.price_cents && isUpcoming ? (
              <span className="text-white/40 text-xs">From <span className="text-white font-bold text-sm">{formatPrice(event.price_cents)}</span></span>
            ) : (
              <span />
            )}
            {isUpcoming ? (
              <span
                onClick={(e) => { e.preventDefault(); window.location.href = `/register?event=${event.slug}&eventId=${event.id}`; }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-[#003e79] bg-[#00ccff] hover:bg-[#00e5ff] active:scale-95 transition-all"
              >
                Register
              </span>
            ) : (
              <span className="text-white/40 text-xs font-medium">View Results →</span>
            )}
          </div>
        </div>
      </div>
    </a>
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('register');
    if (slug) {
      window.history.replaceState({}, '', window.location.pathname);
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
      if (tab === 'upcoming') {
        data = data.filter(e => e.status !== 'completed');
      }
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

  // Separate featured (first upcoming) from rest
  const featured = tab === 'upcoming' && filtered.length > 0 ? filtered[0] : null;
  const gridEvents = tab === 'upcoming' && featured ? filtered.slice(1) : filtered;

  return (
    <div className="min-h-screen bg-[#060d18]">
      {/* ── Hero Section ── */}
      <div className="relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0">
          {/* Ice rink lines */}
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-[#00ccff]/10 to-transparent" />
          <div className="absolute top-0 left-2/4 w-px h-full bg-gradient-to-b from-transparent via-[#00ccff]/5 to-transparent" />
          <div className="absolute top-0 left-3/4 w-px h-full bg-gradient-to-b from-transparent via-[#00ccff]/10 to-transparent" />

          {/* Diagonal slashes — hockey stick feel */}
          <div className="absolute -top-20 -right-20 w-[500px] h-[200px] bg-gradient-to-l from-[#00ccff]/8 to-transparent rotate-[15deg]" />
          <div className="absolute -top-10 -right-32 w-[400px] h-[100px] bg-gradient-to-l from-[#0088ff]/5 to-transparent rotate-[15deg]" />

          {/* Center ice circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-[#00ccff]/5 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-[#00ccff]/3 rounded-full" />

          {/* Top gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#060d18] via-transparent to-[#060d18]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-14 pb-8">
          {/* Title area */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1.5 h-8 bg-[#00ccff] rounded-full" />
                <span className="text-[#00ccff] text-sm font-bold uppercase tracking-widest">2025–26 Season</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-none tracking-tight">
                Tournaments
              </h1>
              <p className="text-white/40 mt-3 text-lg max-w-xl">
                Elite youth hockey events across the Midwest. Find your next tournament and register today.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 border border-white/10 self-start">
              <button
                onClick={() => setTab('upcoming')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === 'upcoming'
                    ? 'bg-[#00ccff] text-[#003e79] shadow-lg shadow-[#00ccff]/25'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setTab('past')}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  tab === 'past'
                    ? 'bg-[#00ccff] text-[#003e79] shadow-lg shadow-[#00ccff]/25'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Past Events
              </button>
            </div>
          </div>

          {/* Featured Event */}
          {featured && !search && !ageFilter && (
            <FeaturedEvent event={featured} />
          )}
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="sticky top-0 z-30 border-y border-white/5 bg-[#060d18]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-3.5">
          <div className="flex flex-wrap gap-3 items-center">
            {/* City chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              {['All', 'Chicago', 'St. Louis', 'South Bend', 'Ann Arbor', 'Madison', 'Holland'].map(city => {
                const active = city === 'All' ? !cityFilter : cityFilter === city;
                return (
                  <button
                    key={city}
                    onClick={() => setCityFilter(city === 'All' ? '' : city)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      active
                        ? 'bg-[#00ccff] text-[#003e79] shadow-sm shadow-[#00ccff]/25'
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-white/10'
                    }`}
                  >
                    {city === 'All' ? 'All Cities' : city}
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:block w-px h-6 bg-white/10" />

            {/* Age filter */}
            <select
              value={ageFilter}
              onChange={e => setAgeFilter(e.target.value)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 text-white/50 border border-white/10 focus:outline-none focus:border-[#00ccff]/50 appearance-none cursor-pointer"
              style={{ backgroundImage: 'none' }}
            >
              <option value="">All Ages</option>
              <option value="Mite">Mite</option>
              <option value="Squirt">Squirt</option>
              <option value="Pee Wee">Pee Wee</option>
              <option value="Bantam">Bantam</option>
              <option value="16u">16u / JV</option>
              <option value="18u">18u / Var.</option>
            </select>

            {/* Search */}
            <div className="flex-1 min-w-[160px]">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-4 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-[#00ccff]/50 transition-colors"
                />
              </div>
            </div>

            <span className="text-xs text-white/30 ml-auto tabular-nums">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Events Grid ── */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-10">
        {/* Section label */}
        {featured && !search && !ageFilter && tab === 'upcoming' && gridEvents.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-5 bg-[#00ccff]/60 rounded-full" />
            <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wider">More Tournaments</h2>
            <div className="flex-1 h-px bg-white/5" />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-[#111c2e] border border-white/5 animate-pulse">
                <div className="h-44 bg-gradient-to-br from-white/5 to-white/[0.02]" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-white/5 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-1/2" />
                  <div className="flex gap-2 mt-3">
                    <div className="h-5 w-12 bg-white/5 rounded" />
                    <div className="h-5 w-12 bg-white/5 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : gridEvents.length === 0 && !featured ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <span className="text-4xl">🏒</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No events found</h3>
            <p className="text-white/40 max-w-md mx-auto">
              {tab === 'upcoming'
                ? 'New tournaments are being added — check back soon!'
                : 'Try adjusting your filters to find past events.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gridEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
