'use client';

import { useState, useEffect } from 'react';

const HOTEL_API = 'https://uht.chad-157.workers.dev/api/hotels';

interface MasterHotel {
  id: string;
  hotel_name: string;
  address: string | null;
  city: string;
  state: string;
  zip: string | null;
  phone: string | null;
  website: string | null;
  default_rate_description: string | null;
  default_booking_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_title: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface CityGroup {
  city: string;
  state: string;
  hotel_count: number;
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

// ==================
// Hotel Form Modal
// ==================
function HotelFormModal({ hotel, onClose, onSaved }: {
  hotel: MasterHotel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!hotel;
  const [form, setForm] = useState({
    hotel_name: hotel?.hotel_name || '',
    city: hotel?.city || '',
    state: hotel?.state || 'IL',
    address: hotel?.address || '',
    zip: hotel?.zip || '',
    phone: hotel?.phone || '',
    website: hotel?.website || '',
    default_rate_description: hotel?.default_rate_description || '',
    default_booking_url: hotel?.default_booking_url || '',
    contact_name: hotel?.contact_name || '',
    contact_email: hotel?.contact_email || '',
    contact_phone: hotel?.contact_phone || '',
    contact_title: hotel?.contact_title || '',
    notes: hotel?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.hotel_name.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Hotel name, city, and state are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${HOTEL_API}/master/${hotel!.id}` : `${HOTEL_API}/master`;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel_name: form.hotel_name,
          city: form.city,
          state: form.state,
          address: form.address || null,
          zip: form.zip || null,
          phone: form.phone || null,
          website: form.website || null,
          default_rate_description: form.default_rate_description || null,
          default_booking_url: form.default_booking_url || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          contact_title: form.contact_title || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onSaved();
        onClose();
      } else {
        setError(json.error || 'Failed to save');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none";
  const labelClass = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Hotel' : 'Add New Hotel'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

          {/* Hotel Info */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Hotel Information</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={labelClass}>Hotel Name *</label>
                <input className={fieldClass} value={form.hotel_name} onChange={e => setForm({ ...form, hotel_name: e.target.value })} placeholder="e.g. Hilton Garden Inn" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={labelClass}>City *</label>
                  <input className={fieldClass} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="e.g. Rosemont" />
                </div>
                <div>
                  <label className={labelClass}>State *</label>
                  <select className={fieldClass} value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>ZIP</label>
                  <input className={fieldClass} value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="60018" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input className={fieldClass} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input className={fieldClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className={labelClass}>Website</label>
                  <input className={fieldClass} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
                </div>
              </div>
            </div>
          </div>

          {/* Default Booking Info */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Default Booking Details</h3>
            <p className="text-xs text-gray-500 mb-3">These are used as defaults when linking this hotel to events. They can be overridden per-event.</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className={labelClass}>Default Rate Description</label>
                <input className={fieldClass} value={form.default_rate_description} onChange={e => setForm({ ...form, default_rate_description: e.target.value })} placeholder="e.g. $129/night for UHT families" />
              </div>
              <div>
                <label className={labelClass}>Default Booking URL</label>
                <input className={fieldClass} value={form.default_booking_url} onChange={e => setForm({ ...form, default_booking_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* Hotel Rep Contact */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Hotel Representative</h3>
            <p className="text-xs text-gray-500 mb-3">This contact will be used for coach/manager introductions when teams are assigned to this hotel.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Contact Name</label>
                <input className={fieldClass} value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input className={fieldClass} value={form.contact_title} onChange={e => setForm({ ...form, contact_title: e.target.value })} placeholder="Sales Manager" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input className={fieldClass} value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} placeholder="jane@hotel.com" />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input className={fieldClass} value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} placeholder="(555) 987-6543" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Internal Notes</label>
            <textarea className={fieldClass + ' h-20 resize-none'} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any internal notes about this hotel..." />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Hotel' : 'Add Hotel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================
// Hotel Card
// ==================
function HotelCard({ hotel, onEdit, onDelete }: {
  hotel: MasterHotel;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm truncate">{hotel.hotel_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {hotel.address ? `${hotel.address}, ` : ''}{hotel.city}, {hotel.state} {hotel.zip || ''}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={onEdit} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition" title="Edit">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            </button>
            <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition" title="Remove">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
            <button onClick={() => setExpanded(!expanded)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition" title="Details">
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
          </div>
        </div>

        {/* Quick info row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {hotel.phone && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              {hotel.phone}
            </span>
          )}
          {hotel.contact_name && (
            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
              Rep: {hotel.contact_name}
            </span>
          )}
          {hotel.default_rate_description && (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {hotel.default_rate_description}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 space-y-3">
          {/* Booking Details */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Booking Details</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">Rate:</span>{' '}
                <span className="text-gray-700">{hotel.default_rate_description || '—'}</span>
              </div>
              <div>
                <span className="text-gray-400">Booking URL:</span>{' '}
                {hotel.default_booking_url ? (
                  <a href={hotel.default_booking_url} target="_blank" rel="noopener" className="text-cyan-600 hover:underline">Link</a>
                ) : <span className="text-gray-700">—</span>}
              </div>
              <div>
                <span className="text-gray-400">Website:</span>{' '}
                {hotel.website ? (
                  <a href={hotel.website} target="_blank" rel="noopener" className="text-cyan-600 hover:underline">Link</a>
                ) : <span className="text-gray-700">—</span>}
              </div>
            </div>
          </div>

          {/* Hotel Rep */}
          {(hotel.contact_name || hotel.contact_email || hotel.contact_phone) && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Hotel Representative</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-400">Name:</span> <span className="text-gray-700">{hotel.contact_name || '—'}</span></div>
                <div><span className="text-gray-400">Title:</span> <span className="text-gray-700">{hotel.contact_title || '—'}</span></div>
                <div><span className="text-gray-400">Email:</span> <span className="text-gray-700">{hotel.contact_email || '—'}</span></div>
                <div><span className="text-gray-400">Phone:</span> <span className="text-gray-700">{hotel.contact_phone || '—'}</span></div>
              </div>
            </div>
          )}

          {/* Notes */}
          {hotel.notes && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Notes</h4>
              <p className="text-xs text-gray-600">{hotel.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================
// Main Hotels Page
// ==================
export default function AdminHotelsPage() {
  const [hotels, setHotels] = useState<MasterHotel[]>([]);
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCity, setFilterCity] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [editingHotel, setEditingHotel] = useState<MasterHotel | 'create' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MasterHotel | null>(null);
  const [view, setView] = useState<'cards' | 'cities'>('cards');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${HOTEL_API}/master`).then(r => r.json()),
      fetch(`${HOTEL_API}/master/by-city`).then(r => r.json()),
    ]).then(([hotelsJson, citiesJson]) => {
      if (hotelsJson.success) setHotels(hotelsJson.data);
      if (citiesJson.success) setCityGroups(citiesJson.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = async (hotel: MasterHotel) => {
    try {
      const res = await fetch(`${HOTEL_API}/master/${hotel.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirm(null);
        loadData();
      }
    } catch (e) { console.error(e); }
  };

  // Get unique states and cities for filters
  const states = Array.from(new Set(hotels.map(h => h.state))).sort();
  const cities = Array.from(new Set(
    hotels.filter(h => filterState === 'all' || h.state === filterState).map(h => `${h.city}, ${h.state}`)
  )).sort();

  // Apply filters
  const filtered = hotels.filter(h => {
    const matchesSearch = !search ||
      h.hotel_name.toLowerCase().includes(search.toLowerCase()) ||
      h.city.toLowerCase().includes(search.toLowerCase()) ||
      (h.contact_name && h.contact_name.toLowerCase().includes(search.toLowerCase()));
    const matchesState = filterState === 'all' || h.state === filterState;
    const matchesCity = filterCity === 'all' || `${h.city}, ${h.state}` === filterCity;
    return matchesSearch && matchesState && matchesCity;
  });

  // Group filtered hotels by city
  const groupedByCity: Record<string, MasterHotel[]> = {};
  filtered.forEach(h => {
    const key = `${h.city}, ${h.state}`;
    if (!groupedByCity[key]) groupedByCity[key] = [];
    groupedByCity[key].push(h);
  });
  const sortedCityKeys = Object.keys(groupedByCity).sort();

  return (
    <div className="bg-gray-100 min-h-full">
      {/* Form Modal */}
      {editingHotel && (
        <HotelFormModal
          hotel={editingHotel === 'create' ? null : editingHotel}
          onClose={() => setEditingHotel(null)}
          onSaved={loadData}
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
              <h3 className="text-lg font-bold text-gray-900 mb-1">Remove Hotel</h3>
              <p className="text-sm text-gray-500 mb-1">Are you sure you want to remove</p>
              <p className="text-sm font-semibold text-gray-900 mb-4">{deleteConfirm.hotel_name}?</p>
              <p className="text-xs text-gray-400 mb-5">This is a soft delete — the hotel can be restored later.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition">Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Hotel Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Master hotel database for all tournament cities</p>
        </div>
        <button onClick={() => setEditingHotel('create')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-sm transition">
          + Add Hotel
        </button>
      </div>

      {/* Stats Bar */}
      <div className="max-w-7xl mx-auto px-6 mt-2">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{hotels.length}</div>
            <div className="text-xs text-gray-500 mt-1">Total Hotels</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{cityGroups.length}</div>
            <div className="text-xs text-gray-500 mt-1">Cities Covered</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{hotels.filter(h => h.contact_name).length}</div>
            <div className="text-xs text-gray-500 mt-1">With Hotel Rep</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-6 mt-6 space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* View Toggle */}
          <div className="flex gap-1 bg-gray-200 rounded-xl p-1">
            <button
              onClick={() => setView('cards')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                view === 'cards' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Hotels
            </button>
            <button
              onClick={() => setView('cities')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                view === 'cities' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              By City
            </button>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search hotels, cities, contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
            />
          </div>

          {/* State Filter */}
          <select
            value={filterState}
            onChange={(e) => { setFilterState(e.target.value); setFilterCity('all'); }}
            className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
          >
            <option value="all">All States</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* City Filter */}
          {cities.length > 1 && (
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-cyan-500 outline-none"
            >
              <option value="all">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 7.5h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" /></svg>
            <p className="text-gray-500 font-medium">No hotels found</p>
            <p className="text-sm text-gray-400 mt-1">Add your first hotel to get started</p>
          </div>
        ) : view === 'cities' ? (
          /* By-City View */
          <div className="space-y-6">
            {sortedCityKeys.map(cityKey => (
              <div key={cityKey}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">📍</span>
                  <h2 className="text-lg font-bold text-gray-900">{cityKey}</h2>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-medium">{groupedByCity[cityKey].length} hotel{groupedByCity[cityKey].length !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupedByCity[cityKey].map(hotel => (
                    <HotelCard
                      key={hotel.id}
                      hotel={hotel}
                      onEdit={() => setEditingHotel(hotel)}
                      onDelete={() => setDeleteConfirm(hotel)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* All Hotels Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(hotel => (
              <HotelCard
                key={hotel.id}
                hotel={hotel}
                onEdit={() => setEditingHotel(hotel)}
                onDelete={() => setDeleteConfirm(hotel)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
