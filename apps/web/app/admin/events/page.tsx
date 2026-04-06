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

// --- Standard age groups & divisions ---
const STANDARD_AGE_GROUPS = ['Mite', 'Squirt', 'Pee Wee', 'Bantam', '16u/JV', '18u/Var.'];
const STANDARD_DIVISIONS = ['AA', 'A', 'BB', 'B', 'CC', 'C', 'D1', 'D2', 'D3', 'House'];
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// --- Event Form Modal ---
function EventFormModal({ event, tournaments, onClose, onSaved }: {
  event: EventItem | null; // null = create mode
  tournaments: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!event;
  const [form, setForm] = useState({
    name: event?.name || '',
    city: event?.city || '',
    state: event?.state || 'IL',
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
    tournament_id: (event as any)?.tournament_id || '',
    status: event?.status || 'draft',
    information: event?.information || '',
    price_cents: event ? ((event as any).price_cents ? String((event as any).price_cents / 100) : '') : '',
    deposit_cents: event ? ((event as any).deposit_cents ? String((event as any).deposit_cents / 100) : '') : '',
    slots_count: event?.slots_count ? String(event.slots_count) : '100',
    age_groups: event?.age_groups ? JSON.parse(event.age_groups) as string[] : [] as string[],
    divisions: event?.divisions ? JSON.parse(event.divisions) as string[] : [] as string[],
    registration_open_date: (event as any)?.registration_open_date || '',
    registration_deadline: (event as any)?.registration_deadline || '',
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const toggleArrayItem = (field: 'age_groups' | 'divisions', item: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item) ? prev[field].filter((i: string) => i !== item) : [...prev[field], item],
    }));
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
        status: form.status,
        information: form.information || null,
        price_cents: form.price_cents ? Math.round(parseFloat(form.price_cents) * 100) : null,
        deposit_cents: form.deposit_cents ? Math.round(parseFloat(form.deposit_cents) * 100) : null,
        slots_count: form.slots_count ? parseInt(form.slots_count) : 100,
        age_groups: form.age_groups.length > 0 ? JSON.stringify(form.age_groups) : null,
        divisions: form.divisions.length > 0 ? JSON.stringify(form.divisions) : null,
        registration_open_date: form.registration_open_date || null,
        registration_deadline: form.registration_deadline || null,
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Event' : 'Create Event'}</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Event Name + Tournament */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Chi-Town Showdown 2026" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Template</label>
              <select value={form.tournament_id} onChange={e => setForm({ ...form, tournament_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none">
                <option value="">None</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder="Chicago" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
              <select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none">
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reg. Opens</label>
              <input type="date" value={form.registration_open_date} onChange={e => setForm({ ...form, registration_open_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reg. Deadline</label>
              <input type="date" value={form.registration_deadline} onChange={e => setForm({ ...form, registration_deadline: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
          </div>

          {/* Status + Pricing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
              <input type="number" step="0.01" value={form.price_cents} onChange={e => setForm({ ...form, price_cents: e.target.value })}
                placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit ($)</label>
              <input type="number" step="0.01" value={form.deposit_cents} onChange={e => setForm({ ...form, deposit_cents: e.target.value })}
                placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Slots</label>
              <input type="number" value={form.slots_count} onChange={e => setForm({ ...form, slots_count: e.target.value })}
                placeholder="100" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
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

          {/* Information */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Information</label>
            <textarea value={form.information} onChange={e => setForm({ ...form, information: e.target.value })}
              rows={3} placeholder="Additional event details shown publicly..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none resize-none" />
          </div>

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
  const [tab, setTab] = useState<'overview' | 'participants' | 'schedules'>('overview');
  const [editingReg, setEditingReg] = useState<any>(null);
  const [hotels, setHotels] = useState<string[]>([]);

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
            return (
            <div key={ageGroup} className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{ageGroup}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-green-600 font-medium">{groupPaid}/{grouped[ageGroup].length} paid</span>
                  <span className="text-[11px] text-blue-600 font-medium">{groupHotel}/{grouped[ageGroup].length} hotels</span>
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
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Payment</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600">Hotel</th>
                      <th className="px-4 py-2.5 font-semibold text-gray-600 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[ageGroup].map((reg: any) => (
                      <tr key={reg.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
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

  // Fetch tournaments for form dropdown
  useEffect(() => {
    fetch(`${API_BASE}/admin/tournaments`)
      .then(r => r.json())
      .then(json => { if (json.success) setTournaments(json.data.map((t: any) => ({ id: t.id, name: t.name }))); })
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
      {/* Create/Edit Form Modal */}
      {editingEvent && (
        <EventFormModal
          event={editingEvent === 'create' ? null : editingEvent}
          tournaments={tournaments}
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
      <div className="bg-gray-900 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Event Management</h1>
            <p className="text-sm text-gray-400 mt-1">Ultimate Tournaments</p>
          </div>
          <button onClick={() => setEditingEvent('create')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
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
              <EventCard key={event.id} event={event} onViewDetails={setSelectedEventId} onEdit={setEditingEvent} onDuplicate={handleDuplicate} onDelete={setDeleteConfirm} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
