'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/ice-booking';

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

// --- Time Formatter ---
const fmt = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// --- Template Presets ---
interface Template {
  name: string;
  startTime: string;
  endTime: string;
  duration: number;
  buffer: number;
  price: number;
  description: string;
}

const TEMPLATES: Template[] = [
  { name: 'Weekday Afternoon', startTime: '15:00', endTime: '20:00', duration: 60, buffer: 15, price: 395, description: '3 PM - 8 PM (4 slots)' },
  { name: 'Weekday Evening', startTime: '17:00', endTime: '22:00', duration: 60, buffer: 15, price: 395, description: '5 PM - 10 PM (4 slots)' },
  { name: 'Weekend All Day', startTime: '06:00', endTime: '22:00', duration: 60, buffer: 15, price: 450, description: '6 AM - 10 PM (12 slots)' },
  { name: 'Weekend Morning', startTime: '06:00', endTime: '12:00', duration: 60, buffer: 15, price: 395, description: '6 AM - 12 PM (4 slots)' },
  { name: 'Full Day', startTime: '06:00', endTime: '23:00', duration: 60, buffer: 15, price: 395, description: '6 AM - 11 PM (13 slots)' },
  { name: 'Custom', startTime: '06:00', endTime: '23:00', duration: 60, buffer: 15, price: 395, description: 'Set your own hours' },
];

// --- Mini Calendar for multi-date selection ---
function DatePicker({ selectedDates, onToggleDate }: { selectedDates: Set<string>; onToggleDate: (d: string) => void }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDow = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleString('default', { month: 'long', year: 'numeric' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prev = () => setViewMonth((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }));
  const next = () => setViewMonth((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }));

  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectWeekdays = () => {
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewMonth.year, viewMonth.month, d);
      if (dt < today) continue;
      const dow = dt.getDay();
      const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dow >= 1 && dow <= 5 && !selectedDates.has(dateStr)) onToggleDate(dateStr);
    }
  };
  const selectWeekends = () => {
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewMonth.year, viewMonth.month, d);
      if (dt < today) continue;
      const dow = dt.getDay();
      const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if ((dow === 0 || dow === 6) && !selectedDates.has(dateStr)) onToggleDate(dateStr);
    }
  };
  const clearAll = () => {
    selectedDates.forEach((d) => onToggleDate(d));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} className="p-1.5 rounded-full hover:bg-[#fafafa] transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-bold text-[#1d1d1f]">{monthLabel}</span>
        <button onClick={next} className="p-1.5 rounded-full hover:bg-[#fafafa] transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const cellDate = new Date(viewMonth.year, viewMonth.month, day);
          const isPast = cellDate < today;
          const isSelected = selectedDates.has(dateStr);
          const dow = cellDate.getDay();
          const isWeekend = dow === 0 || dow === 6;
          return (
            <button
              key={i}
              disabled={isPast}
              onClick={() => onToggleDate(dateStr)}
              className={`aspect-square flex items-center justify-center rounded text-xs transition
                ${isPast ? 'text-gray-200 cursor-default' : ''}
                ${isSelected ? 'bg-cyan-600 text-white font-bold' : ''}
                ${!isSelected && !isPast ? (isWeekend ? 'text-cyan-700 hover:bg-cyan-50' : 'text-[#3d3d3d] hover:bg-[#fafafa]') : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={selectWeekdays} className="text-[11px] px-2 py-1 bg-[#fafafa] hover:bg-[#e8e8ed] rounded font-medium text-[#3d3d3d] transition">+ Weekdays</button>
        <button onClick={selectWeekends} className="text-[11px] px-2 py-1 bg-[#fafafa] hover:bg-[#e8e8ed] rounded font-medium text-[#3d3d3d] transition">+ Weekends</button>
        {selectedDates.size > 0 && (
          <button onClick={clearAll} className="text-[11px] px-2 py-1 text-red-500 hover:text-red-700 font-medium transition">Clear All</button>
        )}
      </div>
    </div>
  );
}

// --- Slot Generator with Templates ---
function SlotGenerator({ onGenerated }: { onGenerated: () => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [startTime, setStartTime] = useState(TEMPLATES[0].startTime);
  const [endTime, setEndTime] = useState(TEMPLATES[0].endTime);
  const [duration, setDuration] = useState(TEMPLATES[0].duration);
  const [buffer, setBuffer] = useState(TEMPLATES[0].buffer);
  const [price, setPrice] = useState(TEMPLATES[0].price);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');

  const handleTemplateChange = (tmpl: Template) => {
    setSelectedTemplate(tmpl);
    setStartTime(tmpl.startTime);
    setEndTime(tmpl.endTime);
    setDuration(tmpl.duration);
    setBuffer(tmpl.buffer);
    setPrice(tmpl.price);
  };

  const toggleDate = (d: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  // Preview: compute how many slots per day
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const slotsPerDay = endMins > startMins ? Math.floor((endMins - startMins) / (duration + buffer)) : 0;

  const handleGenerate = () => {
    if (selectedDates.size === 0) return;
    setGenerating(true);
    setResult('');

    const dates = Array.from(selectedDates).sort();

    fetch(`${API_BASE}/slots/generate-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: 'rosemont-outdoor',
        dates,
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
          const parts = [`Created ${json.data.created} slots across ${json.data.dates} days`];
          if (json.data.skipped > 0) parts.push(`(${json.data.skipped} days skipped - already had slots)`);
          setResult(parts.join(' '));
          setSelectedDates(new Set());
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

  const isCustom = selectedTemplate.name === 'Custom';
  const sortedDates = Array.from(selectedDates).sort();

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Generate Time Slots</h3>
      <p className="text-sm text-[#86868b] mb-4">Pick a template, select dates, and generate.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Template + Settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#6e6e73] mb-2 uppercase tracking-wide">Template</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => handleTemplateChange(tmpl)}
                  className={`p-3 rounded-xl border-2 text-left transition ${
                    selectedTemplate.name === tmpl.name
                      ? 'border-[#003e79] bg-cyan-50'
                      : 'border-[#e8e8ed] hover:border-[#e8e8ed]'
                  }`}
                >
                  <div className={`text-sm font-bold ${selectedTemplate.name === tmpl.name ? 'text-cyan-700' : 'text-[#1d1d1f]'}`}>{tmpl.name}</div>
                  <div className="text-[11px] text-[#86868b] mt-0.5">{tmpl.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time settings */}
          <div>
            <label className="block text-xs font-semibold text-[#6e6e73] mb-2 uppercase tracking-wide">
              Settings {!isCustom && <span className="text-gray-400 normal-case font-normal">- from template</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Start Time</label>
                <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); if (!isCustom) setSelectedTemplate(TEMPLATES[5]); }}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">End Time</label>
                <input type="time" value={endTime} onChange={(e) => { setEndTime(e.target.value); if (!isCustom) setSelectedTemplate(TEMPLATES[5]); }}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Duration</label>
                <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] text-[#86868b] mb-1">Buffer (min)</label>
                <input type="number" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-[#86868b] mb-1">Price per Slot ($)</label>
                <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Date Picker */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#6e6e73] mb-2 uppercase tracking-wide">Select Dates</label>
            <DatePicker selectedDates={selectedDates} onToggleDate={toggleDate} />
          </div>

          {/* Selected dates summary */}
          {sortedDates.length > 0 && (
            <div className="bg-[#f5f5f7] rounded-xl p-3">
              <div className="text-xs font-semibold text-[#6e6e73] mb-2">
                {sortedDates.length} date{sortedDates.length !== 1 ? 's' : ''} selected - {slotsPerDay} slot{slotsPerDay !== 1 ? 's' : ''}/day - {sortedDates.length * slotsPerDay} total slots
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedDates.map((d) => {
                  const dt = new Date(d + 'T12:00:00');
                  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  const dow = dt.getDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <span key={d} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium ${
                      isWeekend ? 'bg-cyan-100 text-cyan-700' : 'bg-[#e8e8ed] text-[#3d3d3d]'
                    }`}>
                      {label}
                      <button onClick={() => toggleDate(d)} className="hover:text-red-500 ml-0.5">&times;</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-100">
        <button onClick={handleGenerate} disabled={generating || selectedDates.size === 0}
          className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition text-sm">
          {generating ? 'Generating...' : `Generate ${selectedDates.size * slotsPerDay} Slots`}
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

// --- Slots Table ---
function SlotsTable({ slots, onDelete, onRefresh }: { slots: Slot[]; onDelete: (id: string) => void; onRefresh: () => void }) {
  const grouped = slots.reduce((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, Slot[]>);

  const dates = Object.keys(grouped).sort();

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-[#86868b]">
        No slots found. Use the generator above to create some.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-lg font-bold text-[#1d1d1f]">Ice Slots</h3>
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
              <div className="bg-[#f5f5f7] px-4 py-2 text-xs font-bold text-[#6e6e73] uppercase tracking-wide sticky top-0">
                {dateLabel} - {grouped[date].length} slot{grouped[date].length !== 1 ? 's' : ''}
              </div>
              {grouped[date].map((slot) => (
                <div key={slot.id} className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between hover:bg-[#f5f5f7]">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      slot.status === 'available' ? 'bg-green-400' :
                      slot.status === 'booked' ? 'bg-blue-400' :
                      slot.status === 'held' ? 'bg-amber-400' : 'bg-gray-400'
                    }`} />
                    <span className="text-sm font-medium text-[#1d1d1f]">
                      {fmt(slot.start_time)} - {fmt(slot.end_time)}
                    </span>
                    <span className="text-xs text-[#86868b]">{slot.duration_minutes}min</span>
                    <span className="text-sm font-semibold text-green-600">${(slot.price_cents / 100).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {slot.booked_by_name && (
                      <span className="text-xs text-[#6e6e73] bg-[#fafafa] px-2 py-1 rounded">
                        {slot.booked_by_name}
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      slot.status === 'available' ? 'bg-green-100 text-green-700' :
                      slot.status === 'booked' ? 'bg-blue-100 text-blue-700' :
                      slot.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-[#fafafa] text-[#3d3d3d]'
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

// --- Bookings Table ---
function BookingsTable({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 text-center text-[#86868b]">
        No bookings yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-[#1d1d1f]">Bookings ({bookings.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f5f5f7] text-left">
            <tr>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Date</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Time</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Name</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Email</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Phone</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Amount</th>
              <th className="px-4 py-2 font-semibold text-[#6e6e73]">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-gray-50 hover:bg-[#f5f5f7]">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {new Date(b.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{fmt(b.start_time)} - {fmt(b.end_time)}</td>
                <td className="px-4 py-2.5 font-medium">{b.booked_by_name}</td>
                <td className="px-4 py-2.5 text-[#6e6e73]">{b.booked_by_email}</td>
                <td className="px-4 py-2.5 text-[#6e6e73]">{b.booked_by_phone}</td>
                <td className="px-4 py-2.5 font-semibold text-green-600">${(b.price_cents / 100).toFixed(0)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${
                    b.status === 'booked' ? 'bg-blue-100 text-blue-700' :
                    b.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-[#fafafa] text-[#3d3d3d]'
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

// --- Main Admin Page ---
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
    <div className="bg-[#fafafa] min-h-full">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-6 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Ice Booking Admin</h1>
          <p className="text-sm text-gray-400 mt-0.5">Rosemont Outdoor Rink</p>
        </div>
        <a href="/book-ice" className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">
          View Public Page &rarr;
        </a>
      </div>

      {/* Stats */}
      <div className="max-w-6xl mx-auto px-6 mt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-[#1d1d1f]">{totalSlots}</div>
            <div className="text-xs text-[#86868b] mt-1">Total Slots</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{available}</div>
            <div className="text-xs text-[#86868b] mt-1">Available</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{booked}</div>
            <div className="text-xs text-[#86868b] mt-1">Booked</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">${(revenue / 100).toLocaleString()}</div>
            <div className="text-xs text-[#86868b] mt-1">Revenue</div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab('slots')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === 'slots' ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Manage Slots
          </button>
          <button
            onClick={() => setTab('bookings')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
              tab === 'bookings' ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
            }`}
          >
            Bookings ({bookings.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : tab === 'slots' ? (
          <>
            <SlotGenerator onGenerated={() => { loadSlots(); loadBookings(); }} />

            {/* Filters */}
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Filter by Date</label>
                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm bg-white">
                  <option value="">All</option>
                  <option value="available">Available</option>
                  <option value="booked">Booked</option>
                  <option value="held">Held</option>
                </select>
              </div>
              {(dateFilter || statusFilter) && (
                <button onClick={() => { setDateFilter(''); setStatusFilter(''); }}
                  className="text-sm text-[#86868b] hover:text-[#3d3d3d] font-medium pb-2">
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
