'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

interface Event {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  season: string | null;
  status: string;
  registration_count?: number;
}

interface Division {
  id: string;
  event_id: string;
  age_group: string;
  division_level: string;
  max_teams: number;
  current_team_count: number;
  price_cents: number;
}

interface Registration {
  id: string;
  event_id: string;
  event_division_id: string;
  team_id: string;
  team_name: string;
  team_city: string | null;
  team_state: string | null;
  team_logo_url: string | null;
  age_group: string;
  division_level: string;
  status: string;
  payment_status: string;
  amount_cents: number | null;
  paid_cents: number | null;
  registered_by_first: string | null;
  registered_by_last: string | null;
  registered_by_email: string | null;
  registered_by_phone: string | null;
  registered_by_name: string | null;
  roster_count: number;
  approved_by: string | null;
  approved_at: string | null;
  hotel_assigned: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string | null;
  notes: string | null;
  hotel_choice_1: string | null;
  hotel_choice_2: string | null;
  hotel_choice_3: string | null;
  hotel_choice_1_name: string | null;
  hotel_choice_1_id: string | null;
  hotel_choice_2_name: string | null;
  hotel_choice_2_id: string | null;
  hotel_choice_3_name: string | null;
  hotel_choice_3_id: string | null;
}

interface TeamSearchResult {
  id: string;
  name: string;
  age_group: string;
  division_level: string | null;
  city: string | null;
  state: string | null;
}

/* ── Helpers ── */
const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  waitlisted: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  withdrawn: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] || statusColors.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ══════════════════════════════════════════
   EVENT CARDS GRID — landing view
   ══════════════════════════════════════════ */
function EventCardsGrid({ onSelect }: { onSelect: (event: Event) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    authFetch(`${API_BASE}/events/admin/list?filter=${filter}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) setEvents(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  // Build year options from events
  const yearKeys = Array.from(new Set(events.map(ev => {
    return new Date(ev.start_date + 'T12:00:00').getFullYear().toString();
  }))).sort((a, b) => filter === 'past' ? b.localeCompare(a) : a.localeCompare(b));

  const activeYear = yearFilter !== 'all' && !yearKeys.includes(yearFilter) ? 'all' : yearFilter;

  // Build month options only within the selected year
  const eventsInYear = activeYear === 'all' ? events : events.filter(ev => {
    return new Date(ev.start_date + 'T12:00:00').getFullYear().toString() === activeYear;
  });

  const monthKeys = Array.from(new Set(eventsInYear.map(ev => {
    const d = new Date(ev.start_date + 'T12:00:00');
    return String(d.getMonth() + 1).padStart(2, '0');
  }))).sort((a, b) => filter === 'past' ? b.localeCompare(a) : a.localeCompare(b));

  const monthName = (m: string) => {
    return new Date(2026, parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  };

  const activeMonth = monthFilter !== 'all' && !monthKeys.includes(monthFilter) ? 'all' : monthFilter;

  const filtered = events.filter(ev => {
    const d = new Date(ev.start_date + 'T12:00:00');
    const matchesSearch = !search || (() => {
      const q = search.toLowerCase();
      return ev.name.toLowerCase().includes(q) || ev.city.toLowerCase().includes(q) || ev.state.toLowerCase().includes(q);
    })();
    const matchesYear = activeYear === 'all' || d.getFullYear().toString() === activeYear;
    const matchesMonth = activeMonth === 'all' || String(d.getMonth() + 1).padStart(2, '0') === activeMonth;
    return matchesSearch && matchesYear && matchesMonth;
  });

  // Sort: upcoming by start_date ASC, past by start_date DESC
  const sorted = [...filtered].sort((a, b) => {
    if (filter === 'past') return b.start_date.localeCompare(a.start_date);
    return a.start_date.localeCompare(b.start_date);
  });

  const totalTeams = events.reduce((sum, e) => sum + (e.registration_count || 0), 0);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
          <div className="text-2xl font-bold text-[#003e79]">{events.length}</div>
          <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">
            {filter === 'upcoming' ? 'Upcoming' : filter === 'past' ? 'Past' : 'All'} Events
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
          <div className="text-2xl font-bold text-emerald-600">{totalTeams}</div>
          <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Teams Registered</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1">
          {(['upcoming', 'past', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setYearFilter('all'); setMonthFilter('all'); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                filter === f ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 max-w-xs">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-10 pr-4 py-2 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Year filter pills */}
      {yearKeys.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-widest mr-0.5">Year:</span>
          <button
            onClick={() => { setYearFilter('all'); setMonthFilter('all'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeYear === 'all' ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#f5f5f7] shadow-sm border border-[#e8e8ed]'
            }`}
          >
            All
          </button>
          {yearKeys.map(yk => {
            const count = events.filter(ev => new Date(ev.start_date + 'T12:00:00').getFullYear().toString() === yk).length;
            return (
              <button
                key={yk}
                onClick={() => { setYearFilter(yk); setMonthFilter('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeYear === yk ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#f5f5f7] shadow-sm border border-[#e8e8ed]'
                }`}
              >
                {yk} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Month filter pills — shown when a year is selected or only 1 year exists */}
      {monthKeys.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-widest mr-0.5">Month:</span>
          <button
            onClick={() => setMonthFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeMonth === 'all' ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#f5f5f7] shadow-sm border border-[#e8e8ed]'
            }`}
          >
            All
          </button>
          {monthKeys.map(mk => {
            const count = eventsInYear.filter(ev => {
              const d = new Date(ev.start_date + 'T12:00:00');
              return String(d.getMonth() + 1).padStart(2, '0') === mk;
            }).length;
            return (
              <button
                key={mk}
                onClick={() => setMonthFilter(mk)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeMonth === mk ? 'bg-[#003e79] text-white shadow' : 'bg-white text-[#6e6e73] hover:bg-[#f5f5f7] shadow-sm border border-[#e8e8ed]'
                }`}
              >
                {monthName(mk)} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-[#c7c7cc] mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <p className="text-[#86868b] font-medium">No events found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(ev => {
            const dt = new Date(ev.start_date + 'T12:00:00');
            const endDt = new Date(ev.end_date + 'T12:00:00');
            const dateRange = `${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            const isPast = dt < new Date();
            const teamCount = ev.registration_count || 0;

            return (
              <button
                key={ev.id}
                onClick={() => onSelect(ev)}
                className={`text-left w-full flex items-center gap-3.5 bg-white rounded-xl border border-[#e8e8ed] px-4 py-3.5 hover:shadow-md hover:border-[#003e79]/20 transition-all group ${isPast ? 'opacity-70' : ''}`}
              >
                {/* Team count circle */}
                <div className="w-10 h-10 rounded-full bg-[#f0f7ff] flex items-center justify-center shrink-0 border border-[#d6e8f7]">
                  <span className="text-sm font-extrabold text-[#003e79]">{teamCount}</span>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] truncate group-hover:text-[#003e79] transition-colors">{ev.name}</h3>
                  <p className="text-xs text-[#86868b] mt-0.5">{ev.city}, {ev.state} · {dateRange}</p>
                </div>
                {/* Arrow */}
                <svg className="w-4 h-4 text-[#c7c7cc] group-hover:text-[#003e79] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}


/* ══════════════════════════════════════════
   ADD TEAM MODAL
   ══════════════════════════════════════════ */
function AddTeamModal({
  event,
  divisions,
  onComplete,
  onClose,
}: {
  event: Event;
  divisions: Division[];
  onComplete: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [divisionId, setDivisionId] = useState(divisions.length === 1 ? divisions[0].id : '');
  const [autoApprove, setAutoApprove] = useState(true);

  // Search mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TeamSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamSearchResult | null>(null);

  // Create mode
  const [newName, setNewName] = useState('');
  const [newAgeGroup, setNewAgeGroup] = useState('');
  const [newDivLevel, setNewDivLevel] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newCoachName, setNewCoachName] = useState('');
  const [newCoachEmail, setNewCoachEmail] = useState('');
  const [newCoachPhone, setNewCoachPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(`${API_BASE}/teams/admin/list?search=${encodeURIComponent(searchQuery)}&per_page=20`);
        const json = await res.json();
        setSearchResults(json.data || []);
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-set age group from selected division
  useEffect(() => {
    if (divisionId) {
      const div = divisions.find(d => d.id === divisionId);
      if (div) {
        setNewAgeGroup(div.age_group);
        setNewDivLevel(div.division_level);
      }
    }
  }, [divisionId, divisions]);

  const handleAdd = async () => {
    if (!divisionId) { setError('Select a division'); return; }
    setSaving(true);
    setError(null);

    try {
      const body: any = {
        eventDivisionId: divisionId,
        autoApprove,
      };

      if (mode === 'search') {
        if (!selectedTeam) { setError('Select a team'); setSaving(false); return; }
        body.teamId = selectedTeam.id;
      } else {
        if (!newName.trim()) { setError('Team name is required'); setSaving(false); return; }
        if (!newAgeGroup.trim()) { setError('Age group is required'); setSaving(false); return; }
        body.newTeam = {
          name: newName.trim(),
          ageGroup: newAgeGroup,
          divisionLevel: newDivLevel || undefined,
          city: newCity || undefined,
          state: newState || undefined,
          headCoachName: newCoachName || undefined,
          headCoachEmail: newCoachEmail || undefined,
          headCoachPhone: newCoachPhone || undefined,
        };
      }

      const res = await authFetch(`${API_BASE}/registrations/admin/add-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data.message);
        setTimeout(() => onComplete(), 1200);
      } else {
        setError(json.error || 'Failed to add team');
      }
    } catch (err) {
      setError('Error: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  const selectedDiv = divisions.find(d => d.id === divisionId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-bold text-lg">Add Team</h3>
            <p className="text-white/70 text-xs mt-0.5">{event.name}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Division selector */}
          <div>
            <label className="block text-sm font-bold text-[#1d1d1f] mb-2">Division</label>
            <select
              value={divisionId}
              onChange={e => setDivisionId(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            >
              <option value="">Select a division...</option>
              {divisions.map(d => (
                <option key={d.id} value={d.id}>
                  {d.age_group} {d.division_level} — {d.current_team_count}/{d.max_teams} teams
                </option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-1">
            <button
              onClick={() => { setMode('search'); setSelectedTeam(null); setError(null); setResult(null); }}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                mode === 'search' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Search Existing Team
            </button>
            <button
              onClick={() => { setMode('create'); setSelectedTeam(null); setError(null); setResult(null); }}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                mode === 'create' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
              }`}
            >
              Create New Team
            </button>
          </div>

          {/* SEARCH MODE */}
          {mode === 'search' && (
            <div>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setSelectedTeam(null); }}
                  placeholder="Search by team name, city, or state..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#e8e8ed] text-sm text-[#1d1d1f] placeholder:text-[#86868b] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#003e79] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Search results */}
              {searchResults.length > 0 && !selectedTeam && (
                <div className="mt-2 border border-[#e8e8ed] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map(team => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(team)}
                      className="w-full text-left px-4 py-3 hover:bg-[#f0f7ff] transition-colors border-b border-[#f0f0f3] last:border-b-0"
                    >
                      <p className="text-sm font-semibold text-[#1d1d1f]">{team.name}</p>
                      <p className="text-xs text-[#86868b] mt-0.5">
                        {team.age_group}{team.division_level ? ` ${team.division_level}` : ''}
                        {team.city ? ` · ${team.city}` : ''}{team.state ? `, ${team.state}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
                <p className="mt-2 text-sm text-[#86868b] text-center py-3">
                  No teams found. <button onClick={() => setMode('create')} className="text-[#003e79] font-semibold hover:underline">Create a new team</button>
                </p>
              )}

              {/* Selected team card */}
              {selectedTeam && (
                <div className="mt-3 p-4 rounded-xl bg-[#f0f7ff] border border-[#003e79]/15 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#003e79]/10 flex items-center justify-center shrink-0">
                    <span className="text-[#003e79] font-bold text-xs">{selectedTeam.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1d1d1f]">{selectedTeam.name}</p>
                    <p className="text-xs text-[#6e6e73]">
                      {selectedTeam.age_group}{selectedTeam.division_level ? ` ${selectedTeam.division_level}` : ''}
                      {selectedTeam.city ? ` · ${selectedTeam.city}` : ''}{selectedTeam.state ? `, ${selectedTeam.state}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedTeam(null)}
                    className="text-[#86868b] hover:text-red-500 text-lg font-bold"
                  >&times;</button>
                </div>
              )}
            </div>
          )}

          {/* CREATE MODE */}
          {mode === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">Team Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Chicago Steel Mite A"
                  className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">Age Group *</label>
                  <select
                    value={newAgeGroup}
                    onChange={e => setNewAgeGroup(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  >
                    <option value="">Select...</option>
                    {['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.', 'Girls 8u', 'Girls 10u', 'Girls 12u', 'Girls 14u', 'Adult'].map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">Division Level</label>
                  <select
                    value={newDivLevel}
                    onChange={e => setNewDivLevel(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  >
                    <option value="">Select...</option>
                    {['AA', 'A', 'B', 'C', 'D', 'House'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">City</label>
                  <input
                    type="text"
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="City"
                    className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">State</label>
                  <input
                    type="text"
                    value={newState}
                    onChange={e => setNewState(e.target.value)}
                    placeholder="IL"
                    maxLength={2}
                    className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none uppercase"
                  />
                </div>
              </div>

              {/* Coach info - collapsible */}
              <details className="group">
                <summary className="text-xs font-semibold text-[#003e79] cursor-pointer hover:underline">+ Add Coach Info (optional)</summary>
                <div className="mt-3 space-y-3 pl-3 border-l-2 border-[#003e79]/10">
                  <input
                    type="text"
                    value={newCoachName}
                    onChange={e => setNewCoachName(e.target.value)}
                    placeholder="Head Coach Name"
                    className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="email"
                      value={newCoachEmail}
                      onChange={e => setNewCoachEmail(e.target.value)}
                      placeholder="Coach Email"
                      className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                    />
                    <input
                      type="tel"
                      value={newCoachPhone}
                      onChange={e => setNewCoachPhone(e.target.value)}
                      placeholder="Coach Phone"
                      className="w-full border border-[#e8e8ed] rounded-xl p-3 text-sm text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                    />
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Auto-approve toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#fafafa] border border-[#e8e8ed]">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={e => setAutoApprove(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#e8e8ed] peer-focus:ring-2 peer-focus:ring-[#003e79]/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
            <div>
              <p className="text-sm font-semibold text-[#1d1d1f]">Auto-approve</p>
              <p className="text-xs text-[#86868b]">Skip pending review and approve immediately</p>
            </div>
          </div>

          {/* Capacity warning */}
          {selectedDiv && selectedDiv.current_team_count >= selectedDiv.max_teams && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800">This division is full ({selectedDiv.current_team_count}/{selectedDiv.max_teams}). The team will be waitlisted unless capacity is adjusted.</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-emerald-800">{result}</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700 font-semibold">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#6e6e73] bg-[#f5f5f7] hover:bg-[#e8e8ed] transition">
              {result ? 'Done' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleAdd}
                disabled={saving || !divisionId || (mode === 'search' && !selectedTeam) || (mode === 'create' && !newName.trim())}
                className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-[#003e79] hover:bg-[#002d5a] disabled:bg-[#86868b] transition"
              >
                {saving ? 'Adding...' : 'Add Team'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════ */
/* ══════════════════════════════════════════
   REGISTRATION DETAIL / EDIT PANEL
   ══════════════════════════════════════════ */
function RegistrationDetailPanel({ reg, divisions, eventHotels, onClose, onSaved }: {
  reg: Registration;
  divisions: Division[];
  eventHotels: EventHotel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(reg.status);
  const [paymentStatus, setPaymentStatus] = useState(reg.payment_status || 'unpaid');
  const [amountCents, setAmountCents] = useState(reg.amount_cents ? (reg.amount_cents / 100).toString() : '');
  const [divisionId, setDivisionId] = useState(reg.event_division_id);
  const [hotelAssigned, setHotelAssigned] = useState(reg.hotel_assigned || '');
  const [notes, setNotes] = useState(reg.notes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        status,
        payment_status: paymentStatus,
        payment_amount_cents: amountCents ? Math.round(parseFloat(amountCents) * 100) : null,
        hotel_assigned: hotelAssigned || null,
        notes: notes || null,
      };
      if (divisionId !== reg.event_division_id) {
        body.event_division_id = divisionId;
      }

      const res = await fetch(`https://uht.chad-157.workers.dev/api/admin/registration/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Bypass': 'true' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as any;
      if (json.success) {
        setSaved(true);
        setTimeout(() => { onSaved(); onClose(); }, 600);
      } else {
        alert(json.error || 'Failed to save');
      }
    } catch (err) {
      alert('Failed to save changes.');
    }
    setSaving(false);
  };

  const regByName = [reg.registered_by_first, reg.registered_by_last].filter(Boolean).join(' ');
  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return d; }
  };

  // Hotel choices from team
  const hotelChoices = [
    reg.hotel_choice_1_id ? { id: reg.hotel_choice_1_id, name: reg.hotel_choice_1_name, rank: 1 } : null,
    reg.hotel_choice_2_id ? { id: reg.hotel_choice_2_id, name: reg.hotel_choice_2_name, rank: 2 } : null,
    reg.hotel_choice_3_id ? { id: reg.hotel_choice_3_id, name: reg.hotel_choice_3_name, rank: 3 } : null,
  ].filter(Boolean) as { id: string; name: string | null; rank: number }[];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto animate-[slideIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#e8e8ed] px-6 py-5 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#1d1d1f]">{reg.team_name}</h3>
              <p className="text-sm text-[#86868b]">
                {reg.team_city}{reg.team_state ? `, ${reg.team_state}` : ''} · {reg.age_group} {reg.division_level}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[#f5f5f7] rounded-xl transition">
              <svg className="w-5 h-5 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* ── Registration Status ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Registration Status</label>
            <div className="flex gap-2 flex-wrap">
              {['pending', 'approved', 'waitlisted', 'rejected', 'withdrawn'].map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={"px-4 py-2 rounded-xl text-sm font-semibold transition border-2 " +
                    (status === s
                      ? s === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : s === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : s === 'waitlisted' ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : s === 'rejected' ? 'border-red-400 bg-red-50 text-red-700'
                        : 'border-gray-400 bg-gray-50 text-gray-700'
                      : 'border-[#e8e8ed] bg-white text-[#86868b] hover:border-[#c8c8cd]')}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Division ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Division</label>
            <select value={divisionId} onChange={e => setDivisionId(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.age_group} {d.division_level} ({d.current_team_count}/{d.max_teams})</option>
              ))}
            </select>
          </div>

          {/* ── Contact Info (read-only) ── */}
          <div className="bg-[#f5f5f7] rounded-xl p-4">
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Registered By</div>
            <div className="space-y-1 text-sm">
              {regByName && <p className="font-semibold text-[#1d1d1f]">{regByName}</p>}
              {reg.registered_by_email && (
                <p className="text-[#6e6e73]">
                  <a href={`mailto:${reg.registered_by_email}`} className="hover:text-[#003e79] transition">{reg.registered_by_email}</a>
                </p>
              )}
              {reg.registered_by_phone && <p className="text-[#6e6e73]">{reg.registered_by_phone}</p>}
            </div>
          </div>

          {/* ── Payment ── */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Payment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Status</label>
                <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="refunded">Refunded</option>
                  <option value="comp">Comp</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Amount ($)</label>
                <input type="number" step="0.01" value={amountCents} onChange={e => setAmountCents(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
              </div>
            </div>
            {reg.stripe_payment_intent_id && (
              <p className="text-[10px] text-[#86868b] mt-2">Stripe: {reg.stripe_payment_intent_id}</p>
            )}
          </div>

          {/* ── Hotel Assignment ── */}
          <div>
            <div className="text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Hotel</div>

            {/* Team's choices */}
            {hotelChoices.length > 0 && (
              <div className="bg-[#f0f7ff] rounded-xl p-3 mb-3">
                <div className="text-[10px] font-semibold text-[#003e79] uppercase tracking-widest mb-1.5">Team Preferences</div>
                <div className="space-y-1.5">
                  {hotelChoices.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className={"w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 " +
                        (c.rank === 1 ? "bg-emerald-100 text-emerald-700" : c.rank === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                        {c.rank}
                      </span>
                      <span className="text-[#3d3d3d] flex-1">{c.name}</span>
                      {hotelAssigned !== c.id && (
                        <button onClick={() => setHotelAssigned(c.id)}
                          className="text-[10px] px-2 py-0.5 bg-[#f0f7ff] hover:bg-[#e0ecf7] text-[#003e79] rounded-full font-semibold transition">
                          Assign
                        </button>
                      )}
                      {hotelAssigned === c.id && (
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-semibold">Assigned</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <select value={hotelAssigned} onChange={e => setHotelAssigned(e.target.value)}
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none">
              <option value="">Not assigned</option>
              {eventHotels.map(h => (
                <option key={h.id} value={h.id}>{h.hotel_name}{h.price_per_night ? ` ($${h.price_per_night}/night)` : ''}</option>
              ))}
            </select>
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-widest mb-2">Admin Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Internal notes about this registration..."
              className="w-full px-3 py-2.5 border border-[#e8e8ed] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79]/20 outline-none resize-none" />
          </div>

          {/* ── Meta Info ── */}
          <div className="bg-[#f5f5f7] rounded-xl p-4 text-xs text-[#86868b] space-y-1">
            <p>Registered: {fmtDate(reg.created_at)}</p>
            {reg.approved_at && <p>Approved: {fmtDate(reg.approved_at)}</p>}
            {reg.updated_at && <p>Last updated: {fmtDate(reg.updated_at)}</p>}
            <p>Roster: {reg.roster_count} player{reg.roster_count !== 1 ? 's' : ''}</p>
            <p className="font-mono text-[10px] text-[#aeaeb2]">ID: {reg.id}</p>
          </div>
        </div>

        {/* Footer — Save */}
        <div className="sticky bottom-0 bg-white border-t border-[#e8e8ed] px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#3d3d3d] font-semibold rounded-xl text-sm transition">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || saved}
            className={"flex-1 px-4 py-2.5 font-bold rounded-xl text-sm transition " +
              (saved ? "bg-emerald-500 text-white" : "bg-[#003e79] hover:bg-[#002d5a] text-white") +
              (saving ? " opacity-50" : "")}>
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EventHotel {
  id: string;
  hotel_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  price_per_night: number | null;
  rate_description: string | null;
  booking_code: string | null;
}

export default function AdminRegistrationsPage() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [divFilter, setDivFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAddTeam, setShowAddTeam] = useState(false);

  // Detail/Edit panel
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);

  // Hotel selection for non-local approval
  const [eventHotels, setEventHotels] = useState<EventHotel[]>([]);
  const [hotelModalReg, setHotelModalReg] = useState<Registration | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [approving, setApproving] = useState(false);

  // Load registrations + divisions + hotels when event changes
  const loadEventData = useCallback(async () => {
    if (!selectedEvent) {
      setRegistrations([]);
      setDivisions([]);
      setEventHotels([]);
      return;
    }
    setRegLoading(true);
    try {
      const [regRes, eventRes, hotelsRes] = await Promise.all([
        authFetch(`${API_BASE}/registrations/event/${selectedEvent.id}`),
        authFetch(`${API_BASE}/events/${selectedEvent.slug}`),
        authFetch(`${API_BASE}/events/admin/event-hotels/${selectedEvent.id}`),
      ]);
      const regJson = await regRes.json();
      if (regJson.success) setRegistrations(regJson.data || []);
      const hotelsJson = await hotelsRes.json() as any;
      if (hotelsJson.success) setEventHotels(hotelsJson.data || []);

      const eventJson = await eventRes.json();
      if (eventJson.success && eventJson.data?.divisions) {
        setDivisions(eventJson.data.divisions);
      }
    } catch {}
    setRegLoading(false);
  }, [selectedEvent]);

  useEffect(() => { loadEventData(); }, [loadEventData]);

  const handleSelectEvent = (ev: Event | null) => {
    setSelectedEvent(ev);
    setDivFilter('');
    setStatusFilter('');
    setSearch('');
  };

  const handleApprove = async (regId: string, hotelId?: string) => {
    // Find the registration
    const reg = registrations.find(r => r.id === regId);
    const isLocal = reg && selectedEvent && reg.team_state && selectedEvent.state &&
      reg.team_state.toUpperCase() === selectedEvent.state.toUpperCase();

    // Non-local team without hotel → show hotel modal
    if (!isLocal && !hotelId && eventHotels.length > 0) {
      setHotelModalReg(reg || null);
      setSelectedHotelId('');
      return;
    }

    setApproving(true);
    try {
      const res = await authFetch(`${API_BASE}/registrations/${regId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotelId: hotelId || undefined }),
      });
      const json = await res.json() as any;
      if (!json.success && json.requiresHotel) {
        // API says hotel is required but we have no hotels — warn admin
        alert('This team is non-local and requires a hotel assignment. Please add hotels to this event first (Events → Hotels tab).');
        setApproving(false);
        return;
      }
      setHotelModalReg(null);
      loadEventData();
    } catch (err) {
      alert('Failed to approve registration.');
    }
    setApproving(false);
  };

  const handleReject = async (regId: string) => {
    if (!confirm('Reject this registration?')) return;
    await authFetch(`${API_BASE}/registrations/${regId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Rejected by admin' }),
    });
    loadEventData();
  };

  // Filters
  let filtered = registrations;
  if (divFilter) filtered = filtered.filter(r => r.event_division_id === divFilter);
  if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      r.team_name.toLowerCase().includes(q) ||
      (r.team_city || '').toLowerCase().includes(q)
    );
  }

  // Stats
  const approved = registrations.filter(r => r.status === 'approved').length;
  const pending = registrations.filter(r => r.status === 'pending').length;
  const waitlisted = registrations.filter(r => r.status === 'waitlisted').length;
  const total = registrations.length;

  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Registrations</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {!selectedEvent ? (
          <EventCardsGrid onSelect={handleSelectEvent} />
        ) : (
          <>
            {/* Back + Event Name */}
            <button
              onClick={() => handleSelectEvent(null)}
              className="flex items-center gap-1.5 text-[#003e79] hover:text-[#002d5a] font-medium text-sm transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              All Events
            </button>
            <div className="flex items-center gap-3 -mt-2">
              <h2 className="text-xl font-extrabold text-[#1d1d1f]">{selectedEvent.name}</h2>
              <span className="text-sm text-[#86868b]">{selectedEvent.city}, {selectedEvent.state} · {formatDateShort(selectedEvent.start_date)}–{formatDateShort(selectedEvent.end_date)}</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total', value: total, color: 'text-[#003e79]' },
                { label: 'Approved', value: approved, color: 'text-emerald-600' },
                { label: 'Pending', value: pending, color: 'text-amber-600' },
                { label: 'Waitlisted', value: waitlisted, color: 'text-blue-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-[#e8e8ed] p-5 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold text-[#1d1d1f]">Teams</h2>
                <button
                  onClick={() => setShowAddTeam(true)}
                  className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-[#003e79] hover:bg-[#002d5a] transition-colors"
                >
                  + Add Team
                </button>
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap gap-2 items-center">
                {/* Division pills */}
                <button
                  onClick={() => setDivFilter('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    !divFilter ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                  }`}
                >
                  All
                </button>
                {divisions.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setDivFilter(divFilter === d.id ? '' : d.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      divFilter === d.id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'
                    }`}
                  >
                    {d.age_group} {d.division_level} ({registrations.filter(r => r.event_division_id === d.id && r.status === 'approved').length}/{d.max_teams})
                  </button>
                ))}

                <div className="hidden sm:block w-px h-5 bg-[#e8e8ed]" />

                {/* Status filter */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#f5f5f7] text-[#6e6e73] border-none focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                >
                  <option value="">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="waitlisted">Waitlisted</option>
                  <option value="rejected">Rejected</option>
                </select>

                {/* Search */}
                <div className="flex-1 min-w-[140px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="search"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search teams..."
                      className="w-full pl-9 pr-3 py-1.5 rounded-full text-xs bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b] border-none focus:outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    />
                  </div>
                </div>

                <span className="text-xs text-[#86868b] tabular-nums">{filtered.length} team{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Registration table */}
              {regLoading ? (
                <div className="py-12 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-[#003e79] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[#86868b] text-sm">
                    {registrations.length === 0
                      ? 'No teams registered yet. Click "+ Add Team" to get started.'
                      : 'No teams match your filters.'}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-[#e8e8ed] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase tracking-wider">Team</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase tracking-wider hidden sm:table-cell">Division</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase tracking-wider">Status</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase tracking-wider hidden md:table-cell">Registered</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-[#86868b] uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((reg, idx) => (
                        <tr key={reg.id} onClick={() => setSelectedReg(reg)} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-[#f0f7ff] transition-colors cursor-pointer`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-[#1d1d1f]">{reg.team_name}</p>
                            <p className="text-xs text-[#86868b] mt-0.5">
                              {reg.team_city}{reg.team_state ? `, ${reg.team_state}` : ''}
                              {reg.team_state && selectedEvent && reg.team_state.toUpperCase() !== selectedEvent.state.toUpperCase() && (
                                <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">TRAVEL</span>
                              )}
                              {reg.roster_count > 0 && ` · ${reg.roster_count} players`}
                            </p>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <span className="text-xs font-medium text-[#6e6e73]">{reg.age_group} {reg.division_level}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={reg.status} />
                          </td>
                          <td className="px-4 py-3 text-center hidden md:table-cell">
                            <span className="text-xs text-[#86868b]">{formatDate(reg.created_at)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {reg.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(reg.id)}
                                    className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleReject(reg.id)}
                                    className="px-3 py-1 rounded-full text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {reg.status === 'waitlisted' && (
                                <button
                                  onClick={() => handleApprove(reg.id)}
                                  className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition"
                                >
                                  Approve
                                </button>
                              )}
                              {reg.status === 'approved' && (
                                <span className="text-xs text-emerald-600 font-medium">✓ Active</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Team Modal */}
      {showAddTeam && selectedEvent && (
        <AddTeamModal
          event={selectedEvent}
          divisions={divisions}
          onComplete={() => { setShowAddTeam(false); loadEventData(); }}
          onClose={() => setShowAddTeam(false)}
        />
      )}

      {/* Registration Detail/Edit Panel */}
      {selectedReg && (
        <RegistrationDetailPanel
          reg={selectedReg}
          divisions={divisions}
          eventHotels={eventHotels}
          onClose={() => setSelectedReg(null)}
          onSaved={() => loadEventData()}
        />
      )}

      {/* Hotel Selection Modal for Non-Local Teams */}
      {hotelModalReg && (() => {
        // Build the team's priority hotel list (their 3 choices)
        const teamChoices: { id: string; name: string; rank: number }[] = [];
        if (hotelModalReg.hotel_choice_1_id) teamChoices.push({ id: hotelModalReg.hotel_choice_1_id, name: hotelModalReg.hotel_choice_1_name || '', rank: 1 });
        if (hotelModalReg.hotel_choice_2_id) teamChoices.push({ id: hotelModalReg.hotel_choice_2_id, name: hotelModalReg.hotel_choice_2_name || '', rank: 2 });
        if (hotelModalReg.hotel_choice_3_id) teamChoices.push({ id: hotelModalReg.hotel_choice_3_id, name: hotelModalReg.hotel_choice_3_name || '', rank: 3 });
        // Hotels to display: team's choices if they have any, otherwise fall back to all event hotels
        const displayHotels = teamChoices.length > 0
          ? teamChoices.map(c => ({ ...eventHotels.find(h => h.id === c.id)!, rank: c.rank })).filter(h => h && h.id)
          : eventHotels.map(h => ({ ...h, rank: 0 }));

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setHotelModalReg(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-[#e8e8ed]">
                <h3 className="text-lg font-bold text-[#1d1d1f]">Assign Hotel Before Approval</h3>
                <p className="text-sm text-[#86868b] mt-1">
                  <span className="font-semibold text-[#1d1d1f]">{hotelModalReg.team_name}</span>
                  {hotelModalReg.team_city && ` from ${hotelModalReg.team_city}, ${hotelModalReg.team_state}`}
                  {' '}is a non-local team.
                  {teamChoices.length > 0 ? ' Showing their hotel preferences below.' : ' No hotel preferences submitted — showing all event hotels.'}
                </p>
              </div>
              <div className="px-6 py-5 space-y-3">
                {displayHotels.length === 0 ? (
                  <p className="text-sm text-red-600">No hotels configured for this event. Add hotels in Events → Hotels tab first.</p>
                ) : (
                  displayHotels.map((h: any) => (
                    <label key={h.id} className={"flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition " +
                      (selectedHotelId === h.id ? "border-[#00ccff] bg-[#f0f9ff]" : "border-[#e8e8ed] hover:border-[#c8c8cd]")}>
                      <input
                        type="radio"
                        name="hotel"
                        value={h.id}
                        checked={selectedHotelId === h.id}
                        onChange={() => setSelectedHotelId(h.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {h.rank > 0 && (
                            <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " +
                              (h.rank === 1 ? "bg-emerald-50 text-emerald-700" : h.rank === 2 ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600")}>
                              #{h.rank} Choice
                            </span>
                          )}
                          <p className="text-sm font-semibold text-[#1d1d1f]">{h.hotel_name}</p>
                        </div>
                        {h.address && <p className="text-xs text-[#86868b] mt-0.5">{h.address}{h.city ? `, ${h.city}` : ''}{h.state ? `, ${h.state}` : ''}</p>}
                        <div className="flex gap-3 mt-1">
                          {h.price_per_night && <span className="text-xs font-semibold text-[#003e79]">${h.price_per_night}/night</span>}
                          {h.booking_code && <span className="text-xs text-[#86868b]">Code: {h.booking_code}</span>}
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="px-6 py-4 border-t border-[#e8e8ed] flex justify-end gap-3">
                <button
                  onClick={() => setHotelModalReg(null)}
                  className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#6e6e73] bg-[#f5f5f7] hover:bg-[#e8e8ed] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => hotelModalReg && handleApprove(hotelModalReg.id, selectedHotelId)}
                  disabled={!selectedHotelId || approving}
                  className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-[#86868b] transition"
                >
                  {approving ? 'Approving...' : 'Approve with Hotel'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
