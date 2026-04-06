'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/events';
const HOTEL_API = 'https://uht.chad-157.workers.dev/api/hotels';

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
  tournament_id: string | null;
  venue_id: string | null;
  registration_count: number;
  total_revenue_cents: number | null;
  age_groups: string | null;
  divisions: string | null;
  slots_count: number | null;
  is_sold_out: number;
  hide_availability: number;
  show_participants: number;
  information: string | null;
  description: string | null;
  season: string | null;
  timezone: string | null;
  rules_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  price_cents: number | null;
  deposit_cents: number | null;
  multi_event_discount_pct: number | null;
  registration_open_date: string | null;
  registration_deadline: string | null;
}

interface EventHotel {
  id: string;
  event_id: string;
  hotel_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  rate_description: string | null;
  booking_url: string | null;
  booking_code: string | null;
  room_block_count: number | null;
  sort_order: number;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  num_rinks: number;
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

// --- Standard age groups & divisions ---
const STANDARD_AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.'];
const STANDARD_DIVISIONS = ['AA', 'Gold', 'A1', 'A2', 'Silver', 'A3', 'B1', 'Bronze', 'B2', 'B3', 'House', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const TIMEZONES = ['Eastern (EST)', 'Central (CST)', 'Mountain (MST)', 'Pacific (PST)'];
const SEASONS = ['fall', 'winter', 'spring', 'summer'];

// --- Event Form Modal ---
function EventFormModal({ event, tournaments, venues, onClose, onSaved }: {
  event: EventItem | null; // null = create mode
  tournaments: { id: string; name: string }[];
  venues: Venue[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!event;
  const [activeTab, setActiveTab] = useState<'details' | 'hotels'>('details');
  const [form, setForm] = useState({
    name: event?.name || '',
    city: event?.city || '',
    state: event?.state || 'IL',
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
    tournament_id: event?.tournament_id || '',
    venue_id: event?.venue_id || '',
    status: event?.status || 'draft',
    information: event?.information || '',
    description: event?.description || '',
    price_cents: event?.price_cents ? String(event.price_cents / 100) : '',
    deposit_cents: event?.deposit_cents ? String(event.deposit_cents / 100) : '',
    multi_event_discount_pct: event?.multi_event_discount_pct ? String(event.multi_event_discount_pct) : '',
    slots_count: event?.slots_count ? String(event.slots_count) : '100',
    age_groups: event?.age_groups ? JSON.parse(event.age_groups) as string[] : [] as string[],
    divisions: event?.divisions ? JSON.parse(event.divisions) as string[] : [] as string[],
    registration_open_date: event?.registration_open_date || '',
    registration_deadline: event?.registration_deadline || '',
    season: event?.season || '',
    timezone: event?.timezone || 'Central (CST)',
    rules_url: event?.rules_url || '',
    logo_url: event?.logo_url || '',
    banner_url: event?.banner_url || '',
    hide_availability: event?.hide_availability || 0,
    show_participants: event?.show_participants ?? 1,
    is_sold_out: event?.is_sold_out || 0,
  });

  // Hotels state
  const [hotels, setHotels] = useState<EventHotel[]>([]);
  const [suggestedHotels, setSuggestedHotels] = useState<any[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showAddManual, setShowAddManual] = useState(false);
  const [newHotel, setNewHotel] = useState({ hotel_name: '', rate_description: '', booking_url: '', booking_code: '', address: '', city: '', state: '', phone: '' });
  const [addingHotel, setAddingHotel] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Load hotels + suggestions when in edit mode
  useEffect(() => {
    if (isEdit && event?.id) {
      setLoadingHotels(true);
      fetch(`${API_BASE}/admin/event-hotels/${event.id}`).then(r => r.json()).then(json => {
        if (json.success) setHotels(json.data);
        setLoadingHotels(false);
      }).catch(() => setLoadingHotels(false));
    }
  }, [isEdit, event?.id]);

  // Load suggestions when hotels tab opens
  useEffect(() => {
    if (activeTab === 'hotels' && isEdit && event?.id && suggestedHotels.length === 0) {
      setLoadingSuggestions(true);
      fetch(`${HOTEL_API}/suggest/${event.id}`).then(r => r.json()).then(json => {
        if (json.success) setSuggestedHotels(json.data);
        setLoadingSuggestions(false);
      }).catch(() => setLoadingSuggestions(false));
    }
  }, [activeTab, isEdit, event?.id]);

  const toggleArrayItem = (field: 'age_groups' | 'divisions', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter((i: string) => i !== item) : [...prev[field], item],
    }));
  };

  const handleLinkHotel = async (masterHotelId: string) => {
    if (!event?.id) return;
    setLinkingId(masterHotelId);
    try {
      const res = await fetch(`${HOTEL_API}/link/${event.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_hotel_id: masterHotelId }),
      });
      const json = await res.json();
      if (json.success) {
        setHotels(prev => [...prev, json.data]);
        setSuggestedHotels(prev => prev.map(h => h.id === masterHotelId ? { ...h, already_linked: true } : h));
      }
    } catch (e) { /* ignore */ }
    setLinkingId(null);
  };

  const handleAddHotel = async () => {
    if (!newHotel.hotel_name || !event?.id) return;
    setAddingHotel(true);
    try {
      const res = await fetch(`${API_BASE}/admin/event-hotels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, ...newHotel, sort_order: hotels.length }),
      });
      const json = await res.json();
      if (json.success) {
        setHotels(prev => [...prev, json.data]);
        setNewHotel({ hotel_name: '', rate_description: '', booking_url: '', booking_code: '', address: '', city: '', state: '', phone: '' });
        setShowAddManual(false);
      }
    } catch (e) { /* ignore */ }
    setAddingHotel(false);
  };

  const handleDeleteHotel = async (hotelId: string) => {
    try {
      await fetch(`${API_BASE}/admin/event-hotels/${hotelId}`, { method: 'DELETE' });
      setHotels(prev => prev.filter(h => h.id !== hotelId));
      // Un-mark from suggestions
      setSuggestedHotels(prev => prev.map(h => {
        const linked = hotels.find(eh => eh.id === hotelId);
        if (linked && (linked as any).master_hotel_id === h.id) return { ...h, already_linked: false };
        return h;
      }));
    } catch (e) { /* ignore */ }
  };

  const handleSave = async () => {
    if (!form.name || !form.city || !form.start_date || !form.end_date) return;
    setSaving(true);
    setResult('idle');
    try {
      const body: any = {
        name: form.name,
        city: form.city,
        state: form.state,
        start_date: form.start_date,
        end_date: form.end_date,
        tournament_id: form.tournament_id || null,
        venue_id: form.venue_id || null,
        status: form.status,
        information: form.information || null,
        description: form.description || null,
        price_cents: form.price_cents ? Math.round(parseFloat(form.price_cents) * 100) : null,
        deposit_cents: form.deposit_cents ? Math.round(parseFloat(form.deposit_cents) * 100) : null,
        multi_event_discount_pct: form.multi_event_discount_pct ? parseInt(form.multi_event_discount_pct) : 0,
        slots_count: form.slots_count ? parseInt(form.slots_count) : 100,
        age_groups: form.age_groups.length > 0 ? JSON.stringify(form.age_groups) : null,
        divisions: form.divisions.length > 0 ? JSON.stringify(form.divisions) : null,
        registration_open_date: form.registration_open_date || null,
        registration_deadline: form.registration_deadline || null,
        season: form.season || null,
        timezone: form.timezone || 'Central (CST)',
        rules_url: form.rules_url || null,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        hide_availability: form.hide_availability,
        show_participants: form.show_participants,
        is_sold_out: form.is_sold_out,
      };

      const url = isEdit ? `${API_BASE}/admin/update/${event!.id}` : `${API_BASE}/admin/create`;
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setResult('success');
        setTimeout(() => { onSaved(); onClose(); }, 600);
      } else {
        throw new Error(json.error || 'Save failed');
      }
    } catch (e: any) {
      setResult('error');
      setErrorMsg(e.message || 'Failed to save');
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  const currentYear = new Date().getFullYear();
  const seasonOptions = SEASONS.flatMap(s => [currentYear, currentYear + 1].map(y => `${s}-${y}`));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Event' : 'Create Event'}</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1">
            <button onClick={() => setActiveTab('details')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'details' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              Event Details
            </button>
            {isEdit && (
              <button onClick={() => setActiveTab('hotels')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === 'hotels' ? 'bg-cyan-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                Hotels ({hotels.length})
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {activeTab === 'details' && (
            <>
              {/* Event Name + Tournament */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Event Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Chi-Town Showdown 2026" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tournament Template</label>
                  <select value={form.tournament_id} onChange={e => setForm({ ...form, tournament_id: e.target.value })} className={inputCls}>
                    <option value="">None</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Location + Venue */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>City *</label>
                  <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                    placeholder="Chicago" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State *</label>
                  <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className={inputCls}>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Venue</label>
                  <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className={inputCls}>
                    <option value="">No venue selected</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Start Date *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>End Date *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Opens</label>
                  <input type="date" value={form.registration_open_date} onChange={e => setForm({ ...form, registration_open_date: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reg. Deadline</label>
                  <input type="date" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Status + Pricing */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="registration_open">Registration Open</option>
                    <option value="registration_closed">Registration Closed</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Price ($)</label>
                  <input type="number" step="0.01" value={form.price_cents} onChange={e => setForm({ ...form, price_cents: e.target.value })}
                    placeholder="1795.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Deposit ($)</label>
                  <input type="number" step="0.01" value={form.deposit_cents} onChange={e => setForm({ ...form, deposit_cents: e.target.value })}
                    placeholder="350.00" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Multi-Event Discount %</label>
                  <input type="number" min="0" max="100" value={form.multi_event_discount_pct} onChange={e => setForm({ ...form, multi_event_discount_pct: e.target.value })}
                    placeholder="10" className={inputCls} />
                  <p className="text-xs text-gray-400 mt-1">Discount when team registers for 2+ events</p>
                </div>
                <div>
                  <label className={labelCls}>Max Slots</label>
                  <input type="number" value={form.slots_count} onChange={e => setForm({ ...form, slots_count: e.target.value })}
                    placeholder="100" className={inputCls} />
                </div>
              </div>

              {/* Season + Timezone */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Season</label>
                  <select value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} className={inputCls}>
                    <option value="">Not set</option>
                    {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Timezone</label>
                  <select value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className={inputCls}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Rules URL</label>
                  <input type="url" value={form.rules_url} onChange={e => setForm({ ...form, rules_url: e.target.value })}
                    placeholder="https://..." className={inputCls} />
                </div>
              </div>

              {/* Logo + Banner URLs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Logo URL</label>
                  <input type="url" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Banner Image URL</label>
                  <input type="url" value={form.banner_url} onChange={e => setForm({ ...form, banner_url: e.target.value })}
                    placeholder="https://..." className={inputCls} />
                </div>
              </div>

              {/* Age Groups */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age Groups</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_AGE_GROUPS.map(ag => (
                    <button key={ag} type="button" onClick={() => toggleArrayItem('age_groups', ag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.age_groups.includes(ag) ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{ag}</button>
                  ))}
                </div>
              </div>

              {/* Divisions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Divisions</label>
                <div className="flex flex-wrap gap-2">
                  {STANDARD_DIVISIONS.map(d => (
                    <button key={d} type="button" onClick={() => toggleArrayItem('divisions', d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        form.divisions.includes(d) ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>

              {/* Toggle Options */}
              <div className="flex flex-wrap gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.show_participants === 1} onChange={e => setForm({ ...form, show_participants: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                  <span className="text-sm text-gray-700">Show Participants</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.hide_availability === 1} onChange={e => setForm({ ...form, hide_availability: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                  <span className="text-sm text-gray-700">Hide Availability</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_sold_out === 1} onChange={e => setForm({ ...form, is_sold_out: e.target.checked ? 1 : 0 })}
                    className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                  <span className="text-sm text-gray-700">Sold Out</span>
                </label>
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Description (marketing copy)</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="Longer description for event page..."
                  className={inputCls + ' resize-none'} />
              </div>

              {/* Information */}
              <div>
                <label className={labelCls}>Event Information (shown to registrants)</label>
                <textarea value={form.information} onChange={e => setForm({ ...form, information: e.target.value })}
                  rows={3} placeholder="e.g. Mite-Midget: AA, A, B, C, D, House. 4 game guarantee!"
                  className={inputCls + ' resize-none'} />
              </div>
            </>
          )}

          {activeTab === 'hotels' && (
            <>
              {/* Linked Hotels for this Event */}
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Event Hotels ({hotels.length})</p>
                {loadingHotels ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" /></div>
                ) : hotels.length > 0 ? (
                  <div className="space-y-2">
                    {hotels.map(h => (
                      <div key={h.id} className="flex items-start gap-3 bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{h.hotel_name}</p>
                          {h.rate_description && <p className="text-xs text-cyan-700 font-medium">{h.rate_description}</p>}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {(h.city || h.state) && <span className="text-xs text-gray-500">{[h.city, h.state].filter(Boolean).join(', ')}</span>}
                            {h.phone && <span className="text-xs text-gray-500">{h.phone}</span>}
                            {h.booking_code && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">Code: {h.booking_code}</span>}
                          </div>
                          {((h as any).contact_name || (h as any).contact_email) && (
                            <div className="flex flex-wrap gap-x-3 mt-1.5 pt-1.5 border-t border-gray-100">
                              <span className="text-xs text-gray-600 font-medium">Rep: {(h as any).contact_name || 'N/A'}</span>
                              {(h as any).contact_email && <span className="text-xs text-cyan-600">{(h as any).contact_email}</span>}
                              {(h as any).contact_phone && <span className="text-xs text-gray-500">{(h as any).contact_phone}</span>}
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDeleteHotel(h.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600 shrink-0" title="Remove from event">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 text-center text-sm border border-dashed border-gray-300">
                    <p className="text-gray-400 mb-1">No hotels assigned to this event yet</p>
                    <p className="text-gray-400 text-xs">Select from suggested hotels below or add manually</p>
                  </div>
                )}
              </div>

              {/* Suggested Hotels from Master Database */}
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  Suggested Hotels
                  <span className="text-xs font-normal text-gray-400 ml-2">
                    based on event location ({event?.city}, {event?.state})
                  </span>
                </p>
                {loadingSuggestions ? (
                  <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-600" /></div>
                ) : suggestedHotels.filter(h => !h.already_linked).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {suggestedHotels.filter(h => !h.already_linked).map(h => (
                      <div key={h.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5 border border-gray-200 hover:border-cyan-300 transition">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{h.hotel_name}</p>
                          <p className="text-[10px] text-gray-500">{h.city}, {h.state}</p>
                          {h.default_rate_description && <p className="text-[10px] text-cyan-700">{h.default_rate_description}</p>}
                        </div>
                        <button onClick={() => handleLinkHotel(h.id)} disabled={linkingId === h.id}
                          className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shrink-0">
                          {linkingId === h.id ? '...' : '+ Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : suggestedHotels.length > 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">All available hotels already added</p>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-2">No hotels in database for this area yet</p>
                )}
              </div>

              {/* Manual Add (collapsed by default) */}
              <div>
                {!showAddManual ? (
                  <button onClick={() => setShowAddManual(true)}
                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium transition">
                    + Add hotel manually
                  </button>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800">Add Hotel Manually</p>
                      <button onClick={() => setShowAddManual(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Hotel Name *</label>
                        <input type="text" value={newHotel.hotel_name} onChange={e => setNewHotel({ ...newHotel, hotel_name: e.target.value })}
                          placeholder="e.g. Hilton Rosemont" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Rate / Description</label>
                        <input type="text" value={newHotel.rate_description} onChange={e => setNewHotel({ ...newHotel, rate_description: e.target.value })}
                          placeholder="e.g. $129/night - Group Rate" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>City</label>
                        <input type="text" value={newHotel.city} onChange={e => setNewHotel({ ...newHotel, city: e.target.value })}
                          placeholder="Rosemont" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>State</label>
                        <input type="text" value={newHotel.state} onChange={e => setNewHotel({ ...newHotel, state: e.target.value })}
                          placeholder="IL" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input type="tel" value={newHotel.phone} onChange={e => setNewHotel({ ...newHotel, phone: e.target.value })}
                          placeholder="(847) 555-0123" className={inputCls} />
                      </div>
                    </div>
                    <button onClick={handleAddHotel} disabled={!newHotel.hotel_name || addingHotel}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
                      {addingHotel ? 'Adding...' : 'Add Hotel'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {result === 'error' && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{errorMsg}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || result === 'success' || !form.name || !form.city || !form.start_date || !form.end_date}
            className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm transition ${
              result === 'success' ? 'bg-green-500 text-white' : 'bg-cyan-600 hover:bg-cyan-700 text-white'
            } ${saving || !form.name || !form.city || !form.start_date || !form.end_date ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {result === 'success' ? 'Saved!' : saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Event Card ---
function EventCard({ event, onViewDetails, onEdit, onDuplicate, onDelete }: { event: EventItem; onViewDetails: (id: string) => void; onEdit: (e: EventItem) => void; onDuplicate: (id: string) => void; onDelete: (e: EventItem) => void }) {
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
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {event.logo_url ? (
              <img src={event.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-gray-50 border border-gray-100 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-50 to-blue-50 border border-gray-100 flex items-center justify-center shrink-0">
                <span className="text-base">{locationIcon(event.city)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate leading-tight">{event.tournament_name || event.name}</h3>
              <p className="text-xs text-gray-500 truncate">{event.name}</p>
            </div>
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
          <button onClick={() => onEdit(event)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition">
            Edit
          </button>
          <button onClick={() => onDuplicate(event.id)} className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg text-xs transition" title="Duplicate">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
          <button onClick={() => onDelete(event)} className="px-2 py-1.5 bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded-lg text-xs transition" title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Payment Status Helpers ---
const paymentStatusColor = (s: string) => {
  switch (s) {
    case 'paid': return 'bg-green-100 text-green-700';
    case 'partial': return 'bg-amber-100 text-amber-700';
    case 'refunded': return 'bg-red-100 text-red-700';
    case 'comp': return 'bg-purple-100 text-purple-700';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const paymentStatusLabel = (s: string) => {
  switch (s) {
    case 'paid': return 'Paid';
    case 'partial': return 'Partial';
    case 'unpaid': return 'Unpaid';
    case 'refunded': return 'Refunded';
    case 'comp': return 'Comp';
    default: return 'Unpaid';
  }
};

// --- Edit Registration Modal ---
function EditRegistrationModal({ reg, eventId, hotels, onClose, onSaved }: {
  reg: any;
  eventId: string;
  hotels: string[];
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState(reg.payment_status || 'unpaid');
  const [paymentAmount, setPaymentAmount] = useState(reg.payment_amount_cents ? (reg.payment_amount_cents / 100).toString() : '');
  const [paymentMethod, setPaymentMethod] = useState(reg.payment_method || '');
  const [hotelAssigned, setHotelAssigned] = useState(reg.hotel_assigned || '');
  const [notes, setNotes] = useState(reg.notes || '');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const prefs = [reg.hotel_pref_1, reg.hotel_pref_2, reg.hotel_pref_3].filter(Boolean);

  const handleSave = async () => {
    setSaving(true);
    setSaveResult('idle');
    setErrorMsg('');
    try {
      const body: any = {
        payment_status: paymentStatus,
        payment_amount_cents: paymentAmount ? Math.round(parseFloat(paymentAmount) * 100) : null,
        payment_method: paymentMethod || null,
        hotel_assigned: hotelAssigned || null,
        notes: notes || null,
      };
      const res = await fetch(`${API_BASE}/admin/registration/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server error ${res.status}: ${errText}`);
      }
      const json = await res.json();
      if (json.success) {
        setSaveResult('success');
        onSaved(json.data);
        setTimeout(() => onClose(), 800);
      } else {
        throw new Error(json.error || 'Save failed');
      }
    } catch (e: any) {
      console.error('Save error:', e);
      setSaveResult('error');
      setErrorMsg(e.message || 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{reg.team_name}</h3>
              <p className="text-sm text-gray-500">{reg.age_group} {reg.division ? `· ${reg.division}` : ''}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Manager Info (read-only) */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact Info</div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">{reg.manager_first_name} {reg.manager_last_name}</span>
              {reg.email1 && <span className="block text-gray-500">{reg.email1}</span>}
              {reg.phone && <span className="block text-gray-500">{reg.phone}</span>}
            </div>
          </div>

          {/* Payment Section */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Payment</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="refunded">Refunded</option>
                  <option value="comp">Comp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
              >
                <option value="">Not specified</option>
                <option value="credit_card">Credit Card</option>
                <option value="check">Check</option>
                <option value="cash">Cash</option>
                <option value="wire">Wire Transfer</option>
                <option value="comp">Comp / Free</option>
              </select>
            </div>
          </div>

          {/* Hotel Section */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hotel Assignment</div>

            {/* Show team preferences */}
            {prefs.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-3 mb-3">
                <div className="text-xs font-semibold text-blue-600 mb-1.5">Team Preferences</div>
                <div className="space-y-1">
                  {prefs.map((p: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-gray-700">{p}</span>
                      {!hotelAssigned && (
                        <button
                          onClick={() => setHotelAssigned(p)}
                          className="ml-auto text-[10px] px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full font-medium transition"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reg.hotel_choice === 'Local Team' && (
              <div className="bg-gray-50 rounded-xl p-3 mb-3 text-sm text-gray-600">
                <span className="font-medium">Local Team</span> — no hotel needed
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Hotel</label>
              <select
                value={hotelAssigned}
                onChange={(e) => setHotelAssigned(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
              >
                <option value="">Not assigned</option>
                {hotels.map((h) => (
                  <option key={h} value={h}>{h}{prefs.includes(h) ? ` (Choice #${prefs.indexOf(h) + 1})` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Admin Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes about this team..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Error message */}
        {saveResult === 'error' && (
          <div className="mx-6 mb-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saveResult === 'success'}
            className={`flex-1 px-4 py-2.5 font-semibold rounded-xl text-sm transition ${
              saveResult === 'success' ? 'bg-green-500 text-white' : 'bg-cyan-600 hover:bg-cyan-700 text-white'
            } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {saveResult === 'success' ? 'Saved! Closing...' : saving ? 'Saving...' : 'Save Changes'}
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
  const [tab, setTab] = useState<'overview' | 'participants' | 'hotels' | 'schedules'>('overview');
  const [editingReg, setEditingReg] = useState<any>(null);
  const [hotels, setHotels] = useState<string[]>([]);
  const [hotelReport, setHotelReport] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/admin/detail/${eventId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvent(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // Fetch available hotels for this event
    fetch(`${API_BASE}/admin/hotels/${eventId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setHotels(json.data);
      })
      .catch(() => {});
  }, [eventId]);

  // Load hotel report when tab opens
  useEffect(() => {
    if (tab === 'hotels' && !hotelReport && !loadingReport) {
      setLoadingReport(true);
      fetch(`${HOTEL_API}/report/${eventId}`)
        .then(r => r.json())
        .then(json => {
          if (json.success) setHotelReport(json.data);
          setLoadingReport(false);
        })
        .catch(() => setLoadingReport(false));
    }
  }, [tab, eventId]);

  const handleRegSaved = (updated: any) => {
    if (!event) return;
    const newRegs = event.registrations.map((r: any) => r.id === updated.id ? updated : r);
    setEvent({ ...event, registrations: newRegs });
  };

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
        {(['overview', 'participants', 'hotels', 'schedules'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t === 'overview' ? 'Overview' : t === 'participants' ? `Participants (${registrations.length})` : t === 'hotels' ? 'Hotel Report' : 'Schedules'}
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
          {editingReg && (
            <EditRegistrationModal
              reg={editingReg}
              eventId={eventId}
              hotels={hotels}
              onClose={() => setEditingReg(null)}
              onSaved={handleRegSaved}
            />
          )}
          {Object.keys(grouped).sort().map((ageGroup) => {
            const groupPaid = grouped[ageGroup].filter((r: any) => r.payment_status === 'paid').length;
            const groupHotel = grouped[ageGroup].filter((r: any) => r.hotel_assigned).length;
            const groupApproved = grouped[ageGroup].filter((r: any) => r.status === 'approved').length;
            const groupPending = grouped[ageGroup].filter((r: any) => !r.status || r.status === 'pending').length;
            const groupWaitlisted = grouped[ageGroup].filter((r: any) => r.status === 'waitlisted').length;
            return (
            <div key={ageGroup} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{ageGroup}</h3>
                <div className="flex items-center gap-3">
                  {groupPending > 0 && <span className="text-[11px] text-orange-600 font-medium">{groupPending} pending</span>}
                  <span className="text-[11px] text-green-600 font-medium">{groupApproved} approved</span>
                  {groupWaitlisted > 0 && <span className="text-[11px] text-amber-600 font-medium">{groupWaitlisted} waitlisted</span>}
                  <span className="text-[11px] text-blue-600 font-medium">{groupPaid}/{grouped[ageGroup].length} paid</span>
                  <span className="text-sm text-gray-500 font-medium">{grouped[ageGroup].length} team{grouped[ageGroup].length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50 text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Team</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Manager</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Contact</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Division</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Payment</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Hotel</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[ageGroup].map((reg: any) => (
                      <tr key={reg.id} className={"border-b border-gray-50 hover:bg-gray-50 transition" + (reg.status === 'denied' ? ' opacity-50' : '')}>
                        <td className="px-4 py-3 font-medium text-gray-900">{reg.team_name}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {reg.manager_first_name ? `${reg.manager_first_name} ${reg.manager_last_name || ''}`.trim() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-600 text-xs">{reg.email1}</div>
                          {reg.phone && <div className="text-gray-400 text-[11px]">{reg.phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {reg.division ? (
                            <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-700 rounded">{reg.division}</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={reg.status || 'pending'}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              try {
                                const res = await fetch(`${API_BASE}/admin/registration/${reg.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: newStatus }),
                                });
                                const json = await res.json() as any;
                                if (json.success) {
                                  handleRegSaved(json.data);
                                }
                              } catch {}
                            }}
                            className={`text-xs font-semibold rounded-lg px-2 py-1.5 border-0 cursor-pointer focus:ring-2 focus:ring-cyan-500 outline-none transition ${
                              reg.status === 'approved' ? 'bg-green-100 text-green-700' :
                              reg.status === 'denied' ? 'bg-red-100 text-red-700' :
                              reg.status === 'waitlisted' ? 'bg-amber-100 text-amber-700' :
                              'bg-orange-100 text-orange-700'
                            }`}
                          >
                            <option value="pending">⏳ Pending</option>
                            <option value="approved">✅ Approved</option>
                            <option value="denied">❌ Denied</option>
                            <option value="waitlisted">📋 Waitlisted</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${paymentStatusColor(reg.payment_status || 'unpaid')}`}>
                              {paymentStatusLabel(reg.payment_status || 'unpaid')}
                            </span>
                            {reg.payment_amount_cents ? (
                              <span className="text-xs font-medium text-gray-700">${(reg.payment_amount_cents / 100).toLocaleString()}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {reg.hotel_assigned ? (
                            <div>
                              <span className="text-xs font-medium text-blue-700">{reg.hotel_assigned}</span>
                              <span className="block text-[10px] text-green-600 font-medium">Assigned</span>
                            </div>
                          ) : reg.hotel_choice === 'Local Team' ? (
                            <span className="text-xs text-gray-500">Local Team</span>
                          ) : reg.hotel_pref_1 ? (
                            <div>
                              <span className="text-xs text-gray-500 truncate block max-w-[120px]">{reg.hotel_pref_1}</span>
                              <span className="text-[10px] text-amber-500 font-medium">Needs assignment</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setEditingReg(reg)}
                            className="p-1.5 hover:bg-cyan-50 text-gray-400 hover:text-cyan-600 rounded-lg transition"
                            title="Edit registration"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {tab === 'hotels' && (
        <div className="space-y-6">
          {loadingReport ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
            </div>
          ) : !hotelReport ? (
            <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-500">
              <p>Unable to load hotel report.</p>
            </div>
          ) : (
            <>
              {/* Report Header Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-gray-900">{hotelReport.total_teams}</div>
                  <div className="text-[11px] text-gray-500 mt-1">Total Teams</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-green-600">{hotelReport.total_assigned}</div>
                  <div className="text-[11px] text-gray-500 mt-1">Hotel Assigned</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-amber-600">{hotelReport.total_unassigned}</div>
                  <div className="text-[11px] text-gray-500 mt-1">Unassigned</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-blue-600">{hotelReport.total_local}</div>
                  <div className="text-[11px] text-gray-500 mt-1">Local Teams</div>
                </div>
                <div className="bg-white rounded-xl shadow-sm p-4 text-center">
                  <div className="text-xl font-bold text-cyan-600">{hotelReport.event_nights}</div>
                  <div className="text-[11px] text-gray-500 mt-1">Event Nights</div>
                </div>
              </div>

              {/* Hotel Breakdown */}
              {hotelReport.hotels?.map((h: any) => (
                <div key={h.hotel_id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-5 py-4 border-b border-blue-100">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{h.hotel_name}</h3>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          {h.contact_name && (
                            <span className="text-xs text-blue-600 font-medium">Rep: {h.contact_name} {h.contact_email ? `(${h.contact_email})` : ''}</span>
                          )}
                          {h.rate_description && (
                            <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{h.rate_description}</span>
                          )}
                          {h.booking_code && (
                            <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">Code: {h.booking_code}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">{h.teams_assigned}</div>
                        <div className="text-[10px] text-gray-500">teams</div>
                      </div>
                    </div>
                    {/* Key metrics */}
                    <div className="grid grid-cols-4 gap-3 mt-3">
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-gray-900">{h.total_players}</div>
                        <div className="text-[10px] text-gray-500">Players</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-gray-900">{h.estimated_rooms}</div>
                        <div className="text-[10px] text-gray-500">Est. Rooms</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-gray-900">{h.estimated_nights}</div>
                        <div className="text-[10px] text-gray-500">Room Nights</div>
                      </div>
                      <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
                        <div className="text-sm font-bold text-gray-900">{h.room_block_count || '—'}</div>
                        <div className="text-[10px] text-gray-500">Block Size</div>
                      </div>
                    </div>
                  </div>

                  {/* Teams list */}
                  {h.teams?.length > 0 && (
                    <div className="divide-y divide-gray-50">
                      {h.teams.map((t: any, i: number) => (
                        <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900 truncate">{t.team_name}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.age_group}</span>
                              {t.division && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{t.division}</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {t.manager_name && <span>{t.manager_name}</span>}
                              {t.manager_email && <span className="ml-2 text-gray-400">{t.manager_email}</span>}
                              {t.manager_phone && <span className="ml-2 text-gray-400">{t.manager_phone}</span>}
                            </div>
                          </div>
                          <div className="text-right ml-3">
                            <div className="text-sm font-bold text-gray-900">{t.roster_count}</div>
                            <div className="text-[10px] text-gray-400">players</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {h.teams?.length === 0 && (
                    <div className="px-5 py-4 text-center text-sm text-gray-400">No teams assigned yet</div>
                  )}
                </div>
              ))}

              {/* Unassigned Teams */}
              {hotelReport.unassigned_teams?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
                  <div className="bg-amber-50 px-5 py-4 border-b border-amber-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-amber-800">Unassigned Teams</h3>
                        <p className="text-xs text-amber-600 mt-0.5">These teams have not been assigned a hotel yet</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-amber-600">{hotelReport.unassigned_teams.length}</div>
                        <div className="text-[10px] text-gray-500">teams</div>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {hotelReport.unassigned_teams.map((t: any, i: number) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-gray-900">{t.team_name}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.age_group}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {t.manager_name && <span>{t.manager_name}</span>}
                            {t.manager_email && <span className="ml-2 text-gray-400">{t.manager_email}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
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
  const [editingEvent, setEditingEvent] = useState<EventItem | null | 'create'>(null);
  const [tournaments, setTournaments] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<EventItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reloadEvents = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/admin/list?filter=${filter}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvents(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter, refreshKey]);

  // Fetch tournaments + venues for form dropdowns
  useEffect(() => {
    fetch(`${API_BASE}/admin/tournaments`)
      .then(r => r.json())
      .then(json => { if (json.success) setTournaments(json.data.map((t: any) => ({ id: t.id, name: t.name }))); })
      .catch(() => {});
    fetch(`${API_BASE}/admin/venues`)
      .then(r => r.json())
      .then(json => { if (json.success) setVenues(json.data); })
      .catch(() => {});
  }, []);

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/duplicate/${id}`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        reloadEvents();
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/delete/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirm(null);
        reloadEvents();
      }
    } catch (e) { console.error(e); }
  };

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
      <div className="bg-gray-100 min-h-full">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <EventDetail eventId={selectedEventId} onBack={() => setSelectedEventId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-full">
      {/* Create/Edit Form Modal */}
      {editingEvent && (
        <EventFormModal
          event={editingEvent === 'create' ? null : editingEvent}
          tournaments={tournaments}
          venues={venues}
          onClose={() => setEditingEvent(null)}
          onSaved={reloadEvents}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Delete Event</h3>
              <p className="text-sm text-gray-500 mb-1">Are you sure you want to delete</p>
              <p className="text-sm font-semibold text-gray-900 mb-4">{deleteConfirm.name}?</p>
              <p className="text-xs text-red-500 mb-5">This will also delete all {deleteConfirm.registration_count} registration(s). This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm.id)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Event Management</h1>
        </div>
        <button onClick={() => setEditingEvent('create')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
          + Create Event
        </button>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-2">
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
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-3">
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
      <div className="max-w-7xl mx-auto px-6 py-6">
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
              <EventCard key={event.id} event={event} onViewDetails={setSelectedEventId} onEdit={setEditingEvent} onDuplicate={handleDuplicate} onDelete={setDeleteConfirm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
