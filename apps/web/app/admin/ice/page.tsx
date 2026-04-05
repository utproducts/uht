'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://uht.utproducts.workers.dev/api/ice-booking';

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price_cents: number;
  status: string;
  booked_by_name: string | null;
  booked_by_email: string | null;
  booked_by_phone: string | null;
  notes: string | null;
  venue_name: string;
  rink_name: string;
}

interface Booking {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  price_cents: number;
  booked_by_name: string;
  booked_by_email: string;
  booked_by_phone: string;
  notes: string | null;
  status: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

// âââ Time Formatter ââââââââââââââââââââââââââââââââââââââââââââ
const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// âââ Slot Generator Form âââââââââââââââââââââââââââââââââââââââ
function SlotGenerator({ onGenerated }: { onGenerated: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('23:00');
  const [duration, setDuration] = useState(60);
  const [buffer, setBuffer] = useState(15);
  const [price, setPrice] = useState(395);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');

  const handleGenerate = () => {
    if (!startDate || !endDate) return;
    setGenerating(true);
    setResult('');

    fetch(`${API_BASE}/slots/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: 'rosemont-outdoor',
        startDate,
        endDate,
        dailyStartTime: startTime,
        dailyEndTime: endTime,
        slotDurationMinutes: duration,
        bufferMinutes: buffer,
        priceCents: price * 100,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setResult(`Created ${json.data.created} slots`);
          onGenerated();
        } else {
          setResult(`Error: ${json.error || 'Failed to generate'}`);
        }
        setGenerating(false);
      })
      .catch(() => {
        setResult('Network error');
        setGenerating(false);
      });
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Generate Time Slots</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Daily Start</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Daily End</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Duration (min)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Buffer (min)</label>
          <input type="number" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Price ($)</label>
          <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={handleGenerate} disabled={generating || !startDate || !endDate}
          className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition text-sm">
          {generating ? 'Generating...' : 'Generate Slots'}
        </button>
        {result && (
          <span className={`text-sm font-medium ${result.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {result}
          </span>
        )}
      </div>
    </div>
  );
}

// âââ Slots Table âââââââââââââââââââââââââââââââââââââââââââââââ
function SlotsTable({ slots, onDelete, onRefresh }: { slots: Slot[]; onDelete: (id: string) => void; onRefresh: () => void }) {
  const grouped = slots.reduce((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, Slot[]>);

  const dates = Object.keys(grouped).sort();

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-500">
        No slots found. Use the generator above to create some.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Ice Slots</h3>
        <button onClick={onRefresh} className="text-sm text-cyan-600 hover:text-cyan-800 font-medium">
          Refresh
        </button>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {dates.map((date) => {
          const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          });
          return (
            <div key={date}>
              <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide sticky top-0">
                {dateLabel} â {grouped[date].length} slot{grouped[date].length !== 1 ? 's' : ''}
              </div>
              {grouped[date].map((slot) => (
                <div key={slot.id} className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      slot.status === 'available' ? 'bg-green-400' :
                      slot.status === 'booked' ? 'bg-blue-400' :
                      slot.status === 'held' ? 'bg-amber-400' : 'bg-gray-400'
                    }`} />
                    <span className="text-sm font-medium text-gray-900">
                      {fmt(slot.start_time)} â {fmt(slot.end_time)}
                    </span>
                    <span className="text-xs text-gray-500">{slot.duration_minutes}min</span>
                    <span className="text-sm font-semibold text-green-600">${(slot.price_cents / 100).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {slot.booked_by_name && (
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {slot.booked_by_name}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      slot.status === 'available' ? 'bg-green-100 text-green-700' :
                      slot.status === 'booked' ? 'bg-blue-100 text-blue-700' :
                      slot.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {slot.status}
                    </span>
                    {slot.status === 'available' && (
                      <button onClick={() => onDelete(slot.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// âââ Bookings Table ââââââââââââââââââââââââââââââââââââââââââââ
function BookingsTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-gray-500">
        No bookings yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">Bookings ({bookings.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold text-gray-600">Date</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Time</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Name</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Email</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Phone</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Amount</th>
              <th className="px-4 py-2 font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{fmt(b.start_time)} â {fmt(b.end_time)}</td>
                <td className="px-4 py-2.5 font-medium">{b.booked_by_name}</td>
                <td className="px-4 py-2.5 text-gray-600">{b.booked_by_email}</td>
                <td className="px-4 py-2.5 text-gray-600">{b.booked_by_phone}</td>
                <td className="px-4 py-2.5 font-semibold text-green-600">${(b.price_cents / 100).toFixed(0)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    b.status === 'booked' ? 'bg-blue-100 text-blue-700' :
                    b.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// âââ Main Admin Page âââââââââââââââââââââââââââââââââââââââââââ
export default function AdminIcePage() {
  const [tab, setTab] = useState<'slots' | 'bookings'>('slots');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadSlots = useCallback(() => {
    let url = `${API_BASE}/admin/slots?`;
    if (dateFilter) url += `start_date=${dateFilter}&end_date=${dateFilter}&`;
    if (statusFilter) url += `status=${statusFilter}&`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => { if (json.success) setSlots(json.data); })
      .catch(() => {});
  }, [dateFilter, statusFilter]);

  const loadBookings = useCallback(() => {
    fetch(`${API_BASE}/admin/bookings`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setBookings(json.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/admin/slots`).then((r) => r.json()),
      fetch(`${API_BASE}/admin/bookings`).then((r) => r.json()),
    ]).then(([slotsJson, bookingsJson]) => {
      if (slotsJson.success) setSlots(slotsJson.data);
      if (bookingsJson.success) setBookings(bookingsJson.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const handleDeleteSlot = (id: string) => {
    if (!confirm('Delete this slot?')) return;
    fetch(`${API_BASE}/slots/${id}`, { method: 'DELETE' })
      .then((r) => r.json())
      .then((json) => { if (json.success) loadSlots(); })
      .catch(() => {});
  };

  // Stats
  const totalSlots = slots.length;
  const available = slots.filter((s) => s.status === 'available').length;
  const booked = slots.filter((s) => s.status === 'booked').length;
  const revenue = slots.filter((s) => s.status === 'booked').reduce((sum, s) => sum + s.price_cents, 0);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gray-900 text-white py-6">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">Ice Booking Admin</h1>
            <p className="text-sm text-gray-400 mt-1">Rosemont Outdoor Rink</p>
          </div>
          <a href="/book-ice" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
            View Public Page â
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-4 -mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalSlots}</div>
            <div className="text-xs text-gray-500 mt-1">Total Slots</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{available}</div>
            <div className="text-xs text-gray-500 mt-1">Available</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{booked}</div>
            <div className="text-xs text-gray-500 mt-1">Booked</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${(revenue / 100).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Revenue</div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="max-w-6xl mx-auto px-4 mt-6">
        <div className="flex gap-1 bg-gray-200 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('slots')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === 'slots' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Manage Slots
          </button>
          <button
            onClick={() => setTab('bookings')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === 'bookings' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Bookings ({bookings.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600" />
          </div>
        ) : tab === 'slots' ? (
          <>
            <SlotGenerator onGenerated={() => { loadSlots(); loadBookings(); }} />

            {/* Filters */}
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Filter by Date</label>
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">All</option>
                  <option value="available">Available</option>
                  <option value="booked">Booked</option>
                  <option value="held">Held</option>
                </select>
              </div>
              {(dateFilter || statusFilter) && (
                <button onClick={() => { setDateFilter(''); setStatusFilter(''); }}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium pb-2">
                  Clear
                </button>
              )}
            </div>

            <SlotsTable slots={slots} onDelete={handleDeleteSlot} onRefresh={loadSlots} />
          </>
        ) : (
          <BookingsTable bookings={bookings} />
        )}
      </div>
    </div>
  );
}
