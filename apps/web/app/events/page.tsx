'use client';

import { useState, useEffect, useMemo } from 'react';

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
  price_min_cents: number | null;
  price_max_cents: number | null;
  deposit_cents: number | null;
  slots_count: number | null;
  is_sold_out: number;
  schedule_published: number | null;
}

/* ── helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const mo = s.toLocaleString('en-US', { month: 'long' });
  if (s.getMonth() === e.getMonth()) {
    return `${mo} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const mo2 = e.toLocaleString('en-US', { month: 'long' });
  return `${mo} ${s.getDate()} – ${mo2} ${e.getDate()}, ${s.getFullYear()}`;
}

function formatPrice(cents: number | null) {
  if (!cents) return '';
  return `$${(cents / 100).toLocaleString()}`;
}

function formatPriceRange(event: Event): string {
  const min = event.price_min_cents;
  const max = event.price_max_cents;
  // If we have division-level pricing, show a range
  if (min && max && min > 0 && max > 0) {
    if (min === max) return `$${(min / 100).toLocaleString()}`;
    return `$${(min / 100).toLocaleString()}–$${(max / 100).toLocaleString()}`;
  }
  // Fall back to base event price
  if (event.price_cents) return `$${(event.price_cents / 100).toLocaleString()}`;
  return '';
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function statusLabel(status: string) {
  switch (status) {
    case 'published':
    case 'registration_open': return 'Registration Open';
    case 'completed': return 'Completed';
    case 'active': return 'In Progress';
    case 'registration_closed': return 'Registration Closed';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'published':
    case 'registration_open': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'completed': return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'active': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'registration_closed': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-gray-100 text-gray-500 border-gray-200';
  }
}

function cityAccent(city: string): string {
  const c = city.toLowerCase();
  if (c.includes('chicago')) return '#003e79';
  if (c.includes('st. louis') || c.includes('st louis')) return '#1a3a5c';
  if (c.includes('south bend')) return '#0c4a1e';
  if (c.includes('ann arbor')) return '#00274c';
  if (c.includes('madison')) return '#c5050c';
  if (c.includes('holland')) return '#4a2c0f';
  if (c.includes('wis') || c.includes('dells')) return '#2d6a2e';
  return '#003e79';
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** Check if an event's end_date has passed */
function isEventPast(ev: Event): boolean {
  const end = new Date(ev.end_date + 'T23:59:59');
  return end < new Date();
}

/** Month name from 0-indexed month number */
function monthName(m: number): string {
  return new Date(2026, m, 1).toLocaleString('en-US', { month: 'short' });
}

/* ── Event Card (grid view) ── */
function EventCard({ event, isNextUp }: { event: Event; isNextUp?: boolean }) {
  const ageGroups = parseJsonArray(event.age_groups);
  const past = isEventPast(event);
  const isUpcoming = !past;
  const days = daysUntil(event.start_date);
  const scheduleLive = event.schedule_published === 1;
  const accent = cityAccent(event.city);

  return (
    <div className={`group bg-white rounded-2xl overflow-hidden shadow-[0_2px_20px_-6px_rgba(0,62,121,0.12)] hover:shadow-[0_8px_40px_-12px_rgba(0,62,121,0.22)] transition-all duration-300 hover:-translate-y-1 border border-[#e8e8ed] flex flex-col h-full ${past ? 'opacity-75 hover:opacity-100' : ''}`}>
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${accent}, ${accent}88)` }} />
      <div className="p-5 flex flex-col flex-1">
        <div className="flex gap-4">
          <div className="shrink-0">
            {event.logo_url ? (
              <div className="w-20 h-20 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center overflow-hidden group-hover:border-[#003e79]/20 transition-colors">
                <img src={event.logo_url} alt={event.name} className="w-16 h-16 object-contain group-hover:scale-105 transition-transform duration-300" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center">
                <span className="text-3xl">🏒</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-[#1d1d1f] leading-snug group-hover:text-[#003e79] transition-colors line-clamp-2">{event.name}</h3>
              {(event.price_min_cents || event.price_cents) && isUpcoming && (
                <span className="shrink-0 text-sm font-bold text-[#003e79] whitespace-nowrap">{formatPriceRange(event)}</span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-sm text-[#3d3d3d]">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#86868b] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {event.city}, {event.state}
              </span>
              <span className="text-[#c8c8cd]">·</span>
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#86868b] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {formatDateRange(event.start_date, event.end_date)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {scheduleLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Schedule Live
            </span>
          ) : (
            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${past ? statusBadge('completed') : statusBadge(event.status)}`}>
              {past ? 'Completed' : statusLabel(event.status)}
            </span>
          )}
          {isNextUp && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#f0f7ff] text-[#003e79] border border-[#003e79]/10">
              <span className="w-1.5 h-1.5 bg-[#00ccff] rounded-full animate-pulse" />
              Next Up{days > 0 && days <= 90 ? ` · ${days}d` : ''}
            </span>
          )}
          {!isNextUp && isUpcoming && days > 0 && days <= 90 && (
            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#f0f7ff] text-[#003e79] border border-[#003e79]/10">
              {days} day{days !== 1 ? 's' : ''} away
            </span>
          )}
        </div>

        {ageGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ageGroups.slice(0, 5).map(ag => (
              <span key={ag} className="inline-block px-2 py-0.5 bg-[#f5f5f7] text-[#6e6e73] text-[11px] font-medium rounded-md">{ag}</span>
            ))}
            {ageGroups.length > 5 && (
              <span className="inline-block px-2 py-0.5 bg-[#f5f5f7] text-[#86868b] text-[11px] font-medium rounded-md">+{ageGroups.length - 5}</span>
            )}
          </div>
        )}

        {event.information && (
          <p className="text-[13px] text-[#6e6e73] mt-3 line-clamp-2 leading-relaxed">{event.information}</p>
        )}

        <div className="border-t border-[#f0f0f3] mt-auto pt-4" />

        <div className="flex items-center gap-2">
          {!past && scheduleLive ? (
            <>
              <a href={`/events/${event.slug}/schedule`} className="flex-1 text-center px-3 py-2.5 rounded-full text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all whitespace-nowrap">View Schedule</a>
              <a href={`/events/${event.slug}`} className="flex-1 text-center px-3 py-2.5 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors whitespace-nowrap">More Info</a>
            </>
          ) : !past && (event.status === 'registration_open' || event.status === 'published') ? (
            <>
              <a href={`/register?event=${event.slug}&eventId=${event.id}`} className="flex-1 text-center px-3 py-2.5 rounded-full text-sm font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] active:scale-[0.98] transition-all whitespace-nowrap">Register</a>
              <a href={`/events/${event.slug}`} className="flex-1 text-center px-3 py-2.5 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors whitespace-nowrap">More Info</a>
            </>
          ) : (
            <a href={`/events/${event.slug}`} className="flex-1 text-center px-3 py-2.5 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors whitespace-nowrap">More Info</a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN EVENTS PAGE
   ══════════════════════════════════════ */
export default function EventsPage() {
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [cityFilter, setCityFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [search, setSearch] = useState('');

  // Read ?city= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cityParam = params.get('city');
    if (cityParam) setCityFilter(cityParam);
    const tabParam = params.get('tab');
    if (tabParam === 'past') setTab('past');
    const slug = params.get('register');
    if (slug) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Fetch ALL events once
  useEffect(() => {
    setLoading(true);
    fetch(`${API}/events?per_page=200`)
      .then(r => r.json())
      .then(json => {
        setAllEvents(json.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Split into upcoming / past by end_date
  // Only show past events from Oct 2026 onward (current season)
  const PAST_CUTOFF = '2026-10-01';
  const { upcoming, past } = useMemo(() => {
    const u: Event[] = [];
    const p: Event[] = [];
    for (const ev of allEvents) {
      if (isEventPast(ev)) {
        if (ev.start_date >= PAST_CUTOFF) p.push(ev);
      } else {
        u.push(ev);
      }
    }
    u.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    p.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    return { upcoming: u, past: p };
  }, [allEvents]);

  const baseEvents = tab === 'upcoming' ? upcoming : past;

  // Build dynamic city list from the current tab's events
  const cities = useMemo(() => {
    const cityMap = new Map<string, number>();
    for (const ev of baseEvents) {
      const c = ev.city;
      cityMap.set(c, (cityMap.get(c) || 0) + 1);
    }
    return Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1]) // most events first
      .map(([name, count]) => ({ name, count }));
  }, [baseEvents]);

  // Build dynamic month list from the current tab's events (after city filter)
  const afterCityFilter = useMemo(() => {
    if (!cityFilter) return baseEvents;
    return baseEvents.filter(e => e.city === cityFilter);
  }, [baseEvents, cityFilter]);

  const months = useMemo(() => {
    const monthMap = new Map<string, { label: string; count: number }>();
    for (const ev of afterCityFilter) {
      const d = new Date(ev.start_date + 'T12:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      const label = `${monthName(d.getMonth())} ${d.getFullYear()}`;
      const existing = monthMap.get(key);
      if (existing) existing.count++;
      else monthMap.set(key, { label, count: 1 });
    }
    const sorted = Array.from(monthMap.entries()).sort((a, b) =>
      tab === 'upcoming' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])
    );
    return sorted.map(([key, val]) => ({ key, ...val }));
  }, [afterCityFilter, tab]);

  // Build dynamic age group list
  const ageGroups = useMemo(() => {
    const ageSet = new Set<string>();
    for (const ev of baseEvents) {
      for (const ag of parseJsonArray(ev.age_groups)) {
        ageSet.add(ag);
      }
    }
    const order = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.', 'Midget', 'Adult'];
    return Array.from(ageSet).sort((a, b) => {
      const ia = order.findIndex(o => a.toLowerCase().includes(o.toLowerCase()));
      const ib = order.findIndex(o => b.toLowerCase().includes(o.toLowerCase()));
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [baseEvents]);

  // Apply all filters
  const filtered = useMemo(() => {
    let result = afterCityFilter;

    if (monthFilter) {
      result = result.filter(ev => {
        const d = new Date(ev.start_date + 'T12:00:00');
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        return key === monthFilter;
      });
    }

    if (ageFilter) {
      result = result.filter(e => {
        const ags = parseJsonArray(e.age_groups);
        return ags.some(ag => ag.toLowerCase().includes(ageFilter.toLowerCase()));
      });
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        (e.information || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [afterCityFilter, monthFilter, ageFilter, search]);

  const isNextUpFirst = tab === 'upcoming' && filtered.length > 0 && !search && !ageFilter && !monthFilter && !cityFilter;

  // Reset filters when switching tabs
  const handleTabChange = (newTab: 'upcoming' | 'past') => {
    setTab(newTab);
    setCityFilter('');
    setMonthFilter('');
    setAgeFilter('');
    setSearch('');
  };

  // Active filter count (for clear button)
  const activeFilters = [cityFilter, monthFilter, ageFilter, search].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#00ccff]/20 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 pt-16 pb-20">
          <div className="max-w-2xl">
            <p className="text-white/70 text-sm font-semibold uppercase tracking-widest mb-3">2026–27 Season</p>
            <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-[1.1] tracking-tight">
              Find Your Next Tournament
            </h1>
            <p className="text-white/70 mt-4 text-lg leading-relaxed max-w-lg">
              Elite youth hockey events across the Midwest. Browse, compare, and register your team.
            </p>
          </div>

          <div className="mt-10 flex gap-1 bg-white/15 backdrop-blur-sm rounded-full p-1 w-fit border border-white/10">
            <button
              onClick={() => handleTabChange('upcoming')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === 'upcoming' ? 'bg-white text-[#003e79] shadow-md' : 'text-white/70 hover:text-white'
              }`}
            >
              Upcoming Events
              <span className="ml-1.5 text-xs opacity-70">({upcoming.length})</span>
            </button>
            <button
              onClick={() => handleTabChange('past')}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === 'past' ? 'bg-white text-[#003e79] shadow-md' : 'text-white/70 hover:text-white'
              }`}
            >
              Past Events
              <span className="ml-1.5 text-xs opacity-70">({past.length})</span>
            </button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 60V0c240 40 480 60 720 60s480-20 720-60v60H0z" fill="#fafafa" />
          </svg>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[#e8e8ed]">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-3 space-y-2.5">
          {/* Row 1: City pills + search + view toggle */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* City pills — dynamic from data */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px-1">
              <button
                onClick={() => { setCityFilter(''); setMonthFilter(''); }}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  !cityFilter ? 'bg-[#003e79] text-white shadow-sm' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
                }`}
              >
                All Cities
              </button>
              {cities.map(c => (
                <button
                  key={c.name}
                  onClick={() => { setCityFilter(c.name); setMonthFilter(''); }}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    cityFilter === c.name ? 'bg-[#003e79] text-white shadow-sm' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
                  }`}
                >
                  {c.name} <span className="opacity-60 text-xs">({c.count})</span>
                </button>
              ))}
            </div>

            <div className="hidden sm:block w-px h-5 bg-[#e8e8ed]" />

            {/* Search */}
            <div className="flex-1 min-w-[140px] max-w-xs">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-full text-sm bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b] border-none focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                />
              </div>
            </div>

            <span className="text-xs text-[#86868b] tabular-nums">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>

            {/* View toggle */}
            <div className="flex gap-1 bg-[#f5f5f7] rounded-lg p-0.5 ml-auto">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white shadow-sm text-[#003e79]' : 'text-[#86868b] hover:text-[#6e6e73]'}`}
                title="List view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#003e79]' : 'text-[#86868b] hover:text-[#6e6e73]'}`}
                title="Grid view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
              </button>
            </div>
          </div>

          {/* Row 2: Month + Age + Clear */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Month pills */}
            {months.length > 1 && (
              <>
                <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Month:</span>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
                  <button
                    onClick={() => setMonthFilter('')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                      !monthFilter ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    All
                  </button>
                  {months.map(m => (
                    <button
                      key={m.key}
                      onClick={() => setMonthFilter(m.key)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                        monthFilter === m.key ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                      }`}
                    >
                      {m.label} <span className="opacity-60">({m.count})</span>
                    </button>
                  ))}
                </div>

                <div className="hidden sm:block w-px h-4 bg-[#e8e8ed]" />
              </>
            )}

            {/* Age dropdown */}
            {ageGroups.length > 0 && (
              <select
                value={ageFilter}
                onChange={e => setAgeFilter(e.target.value)}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[#f5f5f7] text-[#6e6e73] border-none focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 cursor-pointer"
              >
                <option value="">All Ages</option>
                {ageGroups.map(ag => (
                  <option key={ag} value={ag}>{ag}</option>
                ))}
              </select>
            )}

            {/* Clear all filters */}
            {activeFilters > 0 && (
              <button
                onClick={() => { setCityFilter(''); setMonthFilter(''); setAgeFilter(''); setSearch(''); }}
                className="px-3 py-1 rounded-full text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-10">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-[#e8e8ed] p-5 animate-pulse flex gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#f5f5f7] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-[#f5f5f7] rounded-lg w-1/3" />
                  <div className="h-4 bg-[#f5f5f7] rounded-lg w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[#f0f7ff] flex items-center justify-center">
              <span className="text-4xl">🏒</span>
            </div>
            <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">No events found</h3>
            <p className="text-[#6e6e73] max-w-md mx-auto">
              {tab === 'upcoming'
                ? 'New tournaments are being added — check back soon!'
                : 'Try adjusting your filters to find past events.'}
            </p>
            {activeFilters > 0 && (
              <button
                onClick={() => { setCityFilter(''); setMonthFilter(''); setAgeFilter(''); setSearch(''); }}
                className="mt-4 px-5 py-2 rounded-full text-sm font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* ── LIST VIEW ── */
          <div className="bg-white rounded-2xl shadow-[0_2px_20px_-6px_rgba(0,62,121,0.12)] border border-[#e8e8ed] overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-[60px_1fr_130px_150px_110px_150px_200px] items-center px-5 py-3 border-b border-[#e8e8ed] bg-[#fafafa]">
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest"></span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest">Event</span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest pl-4 border-l border-[#e8e8ed]">Location</span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest pl-4 border-l border-[#e8e8ed]">Dates</span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest text-center pl-4 border-l border-[#e8e8ed]">Status</span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest text-right pl-4 border-l border-[#e8e8ed]">Price</span>
              <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest text-right pl-4 border-l border-[#e8e8ed]"></span>
            </div>

            {filtered.map((event, idx) => {
              const ageGrps = parseJsonArray(event.age_groups);
              const past = isEventPast(event);
              const isUp = !past;
              const days = daysUntil(event.start_date);
              const scheduleLive = event.schedule_published === 1;
              const isFirst = isNextUpFirst && idx === 0;

              return (
                <div
                  key={event.id}
                  className={`block group border-b border-[#f0f0f3] last:border-b-0 hover:bg-[#f8fbff] transition-colors ${past ? 'opacity-70 hover:opacity-100' : ''}`}
                >
                  {/* Mobile layout */}
                  <div className="lg:hidden px-5 py-4">
                    <div className="flex gap-3.5 items-start">
                      <div className="shrink-0">
                        {event.logo_url ? (
                          <div className="w-14 h-14 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center overflow-hidden">
                            <img src={event.logo_url} alt="" className="w-11 h-11 object-contain" />
                          </div>
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center">
                            <span className="text-2xl">🏒</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={`/events/${event.slug}`} className="block">
                          <h3 className="text-sm font-bold text-[#1d1d1f] hover:text-[#003e79] transition-colors truncate">{event.name}</h3>
                        </a>
                        <p className="text-xs text-[#6e6e73] mt-0.5">{event.city}, {event.state} · {formatDateRange(event.start_date, event.end_date)}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {scheduleLive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700">
                              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />Schedule Live
                            </span>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${past ? statusBadge('completed') : statusBadge(event.status)}`}>
                              {past ? 'Completed' : statusLabel(event.status)}
                            </span>
                          )}
                          {isFirst && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f7ff] text-[#003e79] border border-[#003e79]/10">
                              <span className="w-1 h-1 bg-[#00ccff] rounded-full animate-pulse" />Next Up
                            </span>
                          )}
                          {(event.price_min_cents || event.price_cents) && isUp && (
                            <span className="text-xs font-bold text-[#003e79]">{formatPriceRange(event)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2.5">
                          {!past && scheduleLive ? (
                            <>
                              <a href={`/events/${event.slug}`} className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">Schedule</a>
                              <a href={`/events/${event.slug}`} className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                            </>
                          ) : !past && (event.status === 'registration_open' || event.status === 'published') ? (
                            <>
                              <a href={`/register?event=${event.slug}&eventId=${event.id}`} className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors">Register</a>
                              <a href={`/events/${event.slug}`} className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                            </>
                          ) : (
                            <a href={`/events/${event.slug}`} className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden lg:grid lg:grid-cols-[60px_1fr_130px_150px_110px_150px_200px] items-center px-5 py-3.5">
                    <div>
                      {event.logo_url ? (
                        <div className="w-12 h-12 rounded-lg bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center overflow-hidden group-hover:border-[#003e79]/20 transition-colors">
                          <img src={event.logo_url} alt="" className="w-9 h-9 object-contain" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[#f5f5f7] border border-[#e8e8ed] flex items-center justify-center">
                          <span className="text-xl">🏒</span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <a href={`/events/${event.slug}`} className="text-sm font-bold text-[#1d1d1f] hover:text-[#003e79] transition-colors truncate">{event.name}</a>
                        {isFirst && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f0f7ff] text-[#003e79] border border-[#003e79]/10 shrink-0">
                            <span className="w-1 h-1 bg-[#00ccff] rounded-full animate-pulse" />Next Up
                          </span>
                        )}
                      </div>
                      {ageGrps.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {ageGrps.slice(0, 4).map(ag => (
                            <span key={ag} className="inline-block px-1.5 py-0 bg-[#f5f5f7] text-[#86868b] text-[10px] font-medium rounded">{ag}</span>
                          ))}
                          {ageGrps.length > 4 && (
                            <span className="text-[10px] text-[#aeaeb2]">+{ageGrps.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-[#3d3d3d] pl-4 border-l border-[#e8e8ed]">{event.city}, {event.state}</div>

                    <div className="pl-4 border-l border-[#e8e8ed]">
                      <p className="text-sm text-[#3d3d3d]">{formatDateRange(event.start_date, event.end_date)}</p>
                      {isUp && days > 0 && days <= 90 && (
                        <p className="text-[11px] text-[#86868b] mt-0.5">{days} day{days !== 1 ? 's' : ''} away</p>
                      )}
                    </div>

                    <div className="text-center pl-4 border-l border-[#e8e8ed]">
                      {scheduleLive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />Live
                        </span>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${past ? statusBadge('completed') : statusBadge(event.status)}`}>
                          {past ? 'Completed' : statusLabel(event.status)}
                        </span>
                      )}
                    </div>

                    <div className="text-right pl-4 border-l border-[#e8e8ed]">
                      {(event.price_min_cents || event.price_cents) && isUp ? (
                        <span className="text-sm font-bold text-[#003e79] whitespace-nowrap">{formatPriceRange(event)}</span>
                      ) : (
                        <span className="text-sm text-[#c7c7cc]">—</span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 whitespace-nowrap pl-4 border-l border-[#e8e8ed]">
                      {!past && scheduleLive ? (
                        <>
                          <a href={`/events/${event.slug}`} className="inline-block px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">Schedule</a>
                          <a href={`/events/${event.slug}`} className="inline-block px-3 py-1.5 rounded-full text-xs font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                        </>
                      ) : !past && (event.status === 'registration_open' || event.status === 'published') ? (
                        <>
                          <a href={`/register?event=${event.slug}&eventId=${event.id}`} className="inline-block px-3.5 py-1.5 rounded-full text-xs font-semibold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors">Register</a>
                          <a href={`/events/${event.slug}`} className="inline-block px-3 py-1.5 rounded-full text-xs font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                        </>
                      ) : (
                        <a href={`/events/${event.slug}`} className="inline-block px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#003e79] bg-[#f0f7ff] hover:bg-[#e0efff] transition-colors">More Info</a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── GRID VIEW ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((event, idx) => (
              <EventCard key={event.id} event={event} isNextUp={isNextUpFirst && idx === 0} />
            ))}
          </div>
        )}
      </div>

      <div className="h-16" />
    </div>
  );
}
