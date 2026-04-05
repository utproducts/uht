'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/events';

interface EventItem {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  tournament_name: string | null;
  tournament_location: string | null;
  registration_count: number;
  total_revenue_cents: number | null;
  age_groups: string | null;
  divisions: string | null;
  slots_count: number | null;
  is_sold_out: number;
  information: string | null;
}

// --- Helpers ---
const fmtDate = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtDateFull = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

const daysUntil = (d: string) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const statusColor = (status: string) => {
  switch (status) {
    case 'registration_open': return 'bg-green-100 text-green-700';
    case 'published': return 'bg-blue-100 text-blue-700';
    case 'active': return 'bg-cyan-100 text-cyan-700';
    case 'completed': return 'bg-gray-100 text-gray-600';
    case 'cancelled': return 'bg-red-100 text-red-700';
    case 'draft': return 'bg-amber-100 text-amber-700';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'registration_open': return 'Reg. Open';
    case 'registration_closed': return 'Reg. Closed';
    default: return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
};

const locationIcon = (city: string) => {
  if (city.includes('Chicago') || city.includes('Rosemont')) return '🌆';
  if (city.includes('St. Louis') || city.includes('St Louis')) return '🏛️';
  if (city.includes('South Bend') || city.includes('Notre Dame')) return '☘️';
  if (city.includes('Ann Arbor')) return '〽️';
  if (city.includes('Madison')) return '🦡';
  if (city.includes('Dells')) return '🌊';
  if (city.includes('Holland')) return '🌷';
  return '📍';
};

// --- Event Card ---
function EventCard({ event, onViewDetails }: { event: EventItem; onViewDetails: (id: string) => void }) {
  const days = daysUntil(event.start_date);
  const isPast = days < 0;
  const ageGroups = event.age_groups ? JSON.parse(event.age_groups) : [];
  const revenue = event.total_revenue_cents ? (event.total_revenue_cents / 100) : 0;

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition group ${isPast ? 'opacity-75' : ''}`}>
      {/* Top bar with status */}
      <div className="h-1.5 bg-gradient-to-r from-cyan-500 to-blue-600" />

      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-base">{locationIcon(event.city)}</span>
              <h3 className="text-sm font-bold text-gray-900 truncate leading-tight">{event.tournament_name || event.name}</h3>
            </div>
            <p className="text-xs text-gray-500 truncate">{event.name}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ml-2 ${statusColor(event.status)}`}>
            {statusLabel(event.status)}
          </span>
        </div>

        {/* Date + Location */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <span className="font-medium">{fmtDate(event.start_date)} - {fmtDate(event.end_date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span>{event.city}, {event.state}</span>
          </div>
          {!isPast && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${days <= 7 ? 'bg-red-50 text-red-600' : days <= 30 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
              {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`}
            </span>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-blue-600">{event.registration_count}</div>
            <div className="text-[10px] text-gray-500 font-medium">Teams</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-green-600">${revenue > 0 ? revenue.toLocaleString() : '0'}</div>
            <div className="text-[10px] text-gray-500 font-medium">Revenue</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-gray-900">{event.slots_count || 100}</div>
            <div className="text-[10px] text-gray-500 font-medium">Slots</div>
          </div>
        </div>

        {/* Age Groups Tags */}
        {ageGroups.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {ageGroups.map((ag: string) => (
              <span key={ag} className="text-[10px] px-1.5 py-0.5 bg-cyan-50 text-cyan-700 rounded-full font-medium">{ag}</span>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-1.5 pt-3 border-t border-gray-100">
          <button
            onClick={() => onViewDetails(event.id)}
            className="flex-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg text-xs transition"
          >
            View Details
          </button>
          <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition">
            Edit
          </button>
          <button className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-xs transition" title="Duplicate">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Event Detail Overlay ---
function EventDetail({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'participants' | 'schedules'>('overview');

  useEffect(() => {
    fetch(`${API_BASE}/admin/detail/${eventId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvent(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
      </div>
    );
  }

  if (!event) {
    return <div className="text-center py-20 text-gray-500">Event not found.</div>;
  }

  const ageGroups = event.age_groups ? JSON.parse(event.age_groups) : [];
  const divisions = event.divisions ? JSON.parse(event.divisions) : [];
  const registrations = event.registrations || [];
  const summary = event.registration_summary || [];
  const totalRevenue = registrations.reduce((sum: number, r: any) => sum + (r.payment_amount_cents || 0), 0);

  // Group registrations by age_group
  const grouped: Record<string, any[]> = {};
  registrations.forEach((r: any) => {
    if (!grouped[r.age_group]) grouped[r.age_group] = [];
    grouped[r.age_group].push(r);
  });

  return (
    <div>
      {/* Back button + Header */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-cyan-600 hover:text-cyan-800 font-medium text-sm mb-4 transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back to Events
      </button>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6">
        <div className="h-2 bg-gradient-to-r from-cyan-500 to-blue-600" />
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{locationIcon(event.city)}</span>
                <h1 className="text-2xl font-extrabold text-gray-900">{event.name}</h1>
              </div>
              <p className="text-gray-500">
                {fmtDateFull(event.start_date)} - {fmtDateFull(event.end_date)} &middot; {event.city}, {event.state}
              </p>
            </div>
            <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${statusColor(event.status)}`}>
              {statusLabel(event.status)}
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{registrations.length}</div>
              <div className="text-xs text-blue-500 font-medium mt-1">Teams Registered</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toLocaleString()}</div>
              <div className="text-xs text-green-500 font-medium mt-1">Revenue</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{event.slots_count || 100}</div>
              <div className="text-xs text-gray-500 font-medium mt-1">Max Slots</div>
            </div>
            <div className="bg-cyan-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-600">{ageGroups.length}</div>
              <div className="text-xs text-cyan-500 font-medium mt-1">Age Groups</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-200 rounded-xl p-1 w-fit mb-6">
        {(['overview', 'participants', 'schedules'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'participants' ? `Participants (${registrations.length})` : 'Schedules'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Info */}
          {event.information && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Event Information</h3>
              <p className="text-gray-700 leading-relaxed">{event.information}</p>
            </div>
          )}

          {/* Age Groups + Divisions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Age Groups</h3>
              <div className="flex flex-wrap gap-2">
                {ageGroups.map((ag: string) => {
                  const count = grouped[ag]?.length || 0;
                  return (
                    <span key={ag} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-full text-sm font-medium">
                      {ag}
                      {count > 0 && <span className="bg-cyan-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{count}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Divisions</h3>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d: string) => (
                  <span key={d} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">{d}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Registration Summary by Age Group */}
          {summary.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3">Registration Breakdown</h3>
              <div className="space-y-2">
                {summary.map((s: any) => {
                  const pct = Math.min(100, (s.team_count / (event.slots_count || 100)) * 100 * (ageGroups.length || 1));
                  return (
                    <div key={s.age_group} className="flex items-center gap-3">
                      <span className="w-20 text-sm font-medium text-gray-700">{s.age_group}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-16 text-right">{s.team_count} teams</span>
                      <span className="text-sm text-green-600 font-medium w-20 text-right">${(s.revenue_cents / 100).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'participants' && (
        <div className="space-y-4">
          {Object.keys(grouped).sort().map((ageGroup) => (
            <div key={ageGroup} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{ageGroup}</h3>
                <span className="text-sm text-gray-500 font-medium">{grouped[ageGroup].length} team{grouped[ageGroup].length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50 text-left">
                    <tr>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Team</th>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Manager</th>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Contact</th>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Division</th>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Payment</th>
                      <th className="px-5 py-2.5 font-semibold text-gray-600">Hotel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[ageGroup].map((reg: any) => (
                      <tr key={reg.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-5 py-3 font-medium text-gray-900">{reg.team_name}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {reg.manager_first_name ? `${reg.manager_first_name} ${reg.manager_last_name || ''}`.trim() : '-'}
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-gray-600 text-xs">{reg.email1}</div>
                          {reg.phone && <div className="text-gray-400 text-xs">{reg.phone}</div>}
                        </td>
                        <td className="px-5 py-3">
                          {reg.division ? (
                            <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-700 rounded">{reg.division}</span>
                          ) : '-'}
                        </td>
                        <td className="px-5 py-3">
                          {reg.payment_amount_cents ? (
                            <span className="font-semibold text-green-600">${(reg.payment_amount_cents / 100).toLocaleString()}</span>
                          ) : (
                            <span className="text-amber-500 text-xs font-medium">Pending</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs max-w-[140px] truncate">{reg.hotel_choice || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'schedules' && (
        <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
          <p className="font-medium text-gray-600">Schedules coming soon</p>
          <p className="text-sm mt-1">Game schedules and bracket management will be available here.</p>
        </div>
      )}
    </div>
  );
}

// --- Month helpers ---
const getMonthKey = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const dt = new Date(parseInt(y), parseInt(m) - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// --- Main Admin Events Page ---
export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/admin/list?filter=${filter}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvents(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  // Get unique months from events for month filter
  const months = Array.from(new Set(events.map(e => getMonthKey(e.start_date)))).sort();

  // Reset month filter when switching tabs if that month doesn't exist
  const activeMonth = monthFilter !== 'all' && !months.includes(monthFilter) ? 'all' : monthFilter;

  const filtered = events.filter((e) => {
    const matchesSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.tournament_name && e.tournament_name.toLowerCase().includes(search.toLowerCase())) ||
      e.city.toLowerCase().includes(search.toLowerCase());
    const matchesMonth = activeMonth === 'all' || getMonthKey(e.start_date) === activeMonth;
    return matchesSearch && matchesMonth;
  });

  // Stats
  const totalTeams = events.reduce((sum, e) => sum + e.registration_count, 0);
  const totalRevenue = events.reduce((sum, e) => sum + (e.total_revenue_cents || 0), 0);

  if (selectedEventId) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="bg-gray-900 text-white py-6">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="text-2xl font-extrabold">Event Management</h1>
            <p className="text-sm text-gray-400 mt-1">Ultimate Tournaments</p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gray-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Event Management</h1>
            <p className="text-sm text-gray-400 mt-1">Ultimate Tournaments</p>
          </div>
          <button className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
            + Create Event
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{events.length}</div>
            <div className="text-xs text-gray-500 mt-1">{filter === 'upcoming' ? 'Upcoming' : filter === 'past' ? 'Past' : 'Total'} Events</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalTeams}</div>
            <div className="text-xs text-gray-500 mt-1">Teams Registered</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${(totalRevenue / 100).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Total Revenue</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 mt-6 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Filter Toggle */}
          <div className="flex gap-1 bg-gray-200 rounded-xl p-1">
            {(['upcoming', 'past', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setMonthFilter('all'); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  filter === f ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
            />
          </div>
        </div>

        {/* Month Filter */}
        {months.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Month:</span>
            <button
              onClick={() => setMonthFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeMonth === 'all' ? 'bg-cyan-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
              }`}
            >
              All
            </button>
            {months.map((m) => {
              const count = events.filter(e => getMonthKey(e.start_date) === m).length;
              return (
                <button
                  key={m}
                  onClick={() => setMonthFilter(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeMonth === m ? 'bg-cyan-600 text-white shadow' : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
                  }`}
                >
                  {getMonthLabel(m)} <span className="opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Events Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            <p className="text-gray-500 font-medium">No {filter} events found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} onViewDetails={setSelectedEventId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
