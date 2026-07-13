'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api/ice-booking';

interface SlotCount {
  date: string;
  available_count: number;
  total_count: number;
}

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price_cents: number;
  status: string;
  venue_name: string;
  rink_name: string;
}

// Calendar Component
function Calendar({
  selectedDate,
  onSelectDate,
  availableDates,
}: {
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  availableDates: Record<string, { available: number; total: number }>;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDow = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prev = () =>
    setViewMonth((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }));
  const next = () =>
    setViewMonth((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }));

  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
      {/* header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prev} className="p-2 rounded-full hover:bg-[#f5f5f7] transition">
          <svg className="w-5 h-5 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-lg font-bold text-[#1d1d1f]">{monthLabel}</h3>
        <button onClick={next} className="p-2 rounded-full hover:bg-[#f5f5f7] transition">
          <svg className="w-5 h-5 text-[#1d1d1f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      {/* day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-[#86868b] py-1">
            {d}
          </div>
        ))}
      </div>
      {/* day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const cellDate = new Date(viewMonth.year, viewMonth.month, day);
          const isPast = cellDate < today;
          const info = availableDates[dateStr];
          const avail = info?.available || 0;
          const total = info?.total || 0;
          const hasSlots = total > 0 && !isPast;
          const hasAvailable = avail > 0;
          const isSelected = dateStr === selectedDate;
          const isSoldOut = hasSlots && !hasAvailable;
          return (
            <button
              key={i}
              disabled={!hasSlots}
              onClick={() => onSelectDate(dateStr)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition
                ${isSelected ? 'bg-[#003e79] text-white font-bold shadow-md' : ''}
                ${hasAvailable && !isSelected ? 'bg-[#f0f7ff] text-[#003e79] hover:bg-[#e0efff] font-medium cursor-pointer' : ''}
                ${isSoldOut && !isSelected ? 'bg-red-50 text-red-400 cursor-pointer' : ''}
                ${!hasSlots ? 'text-[#86868b] cursor-default' : ''}
              `}
            >
              {day}
              {hasSlots && (
                <span className={`text-[10px] leading-none ${
                  isSelected ? 'text-white' :
                  isSoldOut ? 'text-red-400' : 'text-[#003e79]'
                }`}>
                  {isSoldOut ? 'Full' : `${avail} left`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Time Slot Picker
function TimeSlotPicker({
  slots,
  selectedSlot,
  onSelect,
  loading,
}: {
  slots: Slot[];
  selectedSlot: Slot | null;
  onSelect: (s: Slot) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 flex items-center justify-center min-h-[120px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" />
      </div>
    );
  }
  if (slots.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 text-center text-[#6e6e73]">
        No time slots for this date.
      </div>
    );
  }

  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const availableSlots = slots.filter((s) => s.status === 'available');
  const takenSlots = slots.filter((s) => s.status !== 'available');

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#1d1d1f]">Select a Time</h3>
        <div className="flex items-center gap-3 text-xs text-[#6e6e73]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Available ({availableSlots.length})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#d0d0d5] inline-block" /> Booked ({takenSlots.length})</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slots.map((slot) => {
          const isTaken = slot.status !== 'available';
          const selected = selectedSlot?.id === slot.id;
          return (
            <button
              key={slot.id}
              disabled={isTaken}
              onClick={() => !isTaken && onSelect(slot)}
              className={`p-3 rounded-xl border transition relative
                ${isTaken ? 'border-[#e8e8ed] bg-[#f5f5f7] cursor-not-allowed opacity-60' : ''}
                ${selected ? 'border-[#003e79] bg-[#f0f7ff] shadow-md' : ''}
                ${!isTaken && !selected ? 'border-[#e8e8ed] hover:border-[#003e79]/30 hover:bg-[#f5f5f7]' : ''}
              `}
            >
              <div className={`font-bold ${isTaken ? 'text-[#86868b]' : selected ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                {fmt(slot.start_time)}
              </div>
              <div className={`text-xs ${isTaken ? 'text-[#d0d0d5]' : 'text-[#6e6e73]'}`}>to {fmt(slot.end_time)}</div>
              {isTaken ? (
                <div className="text-xs font-semibold text-red-500 mt-1">Booked</div>
              ) : (
                <div className="text-sm font-semibold text-green-600 mt-1">${(slot.price_cents / 100).toFixed(0)}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Booking Form
function BookingForm({
  slot,
  onBack,
}: {
  slot: Slot;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const dateLabel = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: slot.id,
          name,
          email,
          phone,
          notes: reason || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Booking failed. Please try again.');
        setSubmitting(false);
        return;
      }
      // Redirect to Stripe Checkout
      if (json.data?.checkoutUrl) {
        window.location.href = json.data.checkoutUrl;
      } else {
        setError('Payment setup failed. Please contact us.');
        setSubmitting(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
      <button onClick={onBack} className="text-[#003e79] hover:text-[#002d5a] text-sm font-medium mb-4 flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to times
      </button>

      {/* Order Summary */}
      <div className="bg-[#f5f5f7] rounded-xl p-4 mb-6">
        <h4 className="font-bold text-[#1d1d1f] mb-2">Booking Summary</h4>
        <div className="space-y-1 text-sm text-[#3d3d3d]">
          <div className="flex justify-between">
            <span>Date</span>
            <span className="font-medium">{dateLabel}</span>
          </div>
          <div className="flex justify-between">
            <span>Time</span>
            <span className="font-medium">{fmt(slot.start_time)} – {fmt(slot.end_time)}</span>
          </div>
          <div className="flex justify-between">
            <span>Duration</span>
            <span className="font-medium">{slot.duration_minutes} minutes</span>
          </div>
          <div className="flex justify-between">
            <span>Location</span>
            <span className="font-medium">Rosemont Outdoor Rink</span>
          </div>
          <hr className="my-2 border-[#e8e8ed]" />
          <div className="flex justify-between text-base font-bold text-[#1d1d1f]">
            <span>Total</span>
            <span>${(slot.price_cents / 100).toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Full Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#e8e8ed] rounded-xl focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Email Address *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#e8e8ed] rounded-xl focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            placeholder="john@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Phone Number *</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#e8e8ed] rounded-xl focus:ring-2 focus:ring-[#003e79]/20 outline-none"
            placeholder="(555) 123-4567"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1">Reason for Rental</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-2.5 border border-[#e8e8ed] rounded-xl focus:ring-2 focus:ring-[#003e79]/20 outline-none bg-white"
          >
            <option value="">Select a reason (optional)</option>
            <option value="Hockey Practice">Hockey Practice</option>
            <option value="Hockey Game">Hockey Game</option>
            <option value="Figure Skating">Figure Skating</option>
            <option value="Public Skate">Public Skate</option>
            <option value="Private Event">Private Event</option>
            <option value="Birthday Party">Birthday Party</option>
            <option value="Corporate Event">Corporate Event</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-6 bg-[#003e79] hover:bg-[#002d5a] disabled:bg-[#d0d0d5] text-white font-bold rounded-full transition shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] text-lg"
        >
          {submitting ? 'Processing...' : 'Continue to Payment'}
        </button>
        <p className="text-xs text-[#86868b] text-center">
          You will be redirected to Stripe for secure payment processing.
        </p>
      </form>
    </div>
  );
}

// Main Page
export default function BookIcePage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Record<string, { available: number; total: number }>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // Check for cancelled payment
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('cancelled=true')) {
      setCancelled(true);
      window.history.replaceState({}, '', '/book-ice');
    }
  }, []);

  // Load available date counts
  useEffect(() => {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 3);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    fetch(`${API_BASE}/slots/counts?start_date=${start}&end_date=${end}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const map: Record<string, { available: number; total: number }> = {};
          json.data.forEach((row: SlotCount) => {
            map[row.date] = { available: row.available_count, total: row.total_count };
          });
          setAvailableDates(map);
        }
      })
      .catch(() => {});
  }, []);

  // Load slots for selected date
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    setShowForm(false);
    fetch(`${API_BASE}/slots?start_date=${selectedDate}&end_date=${selectedDate}&status=all`)
      .then((r) => r.json())
      .then((json) => {
        setSlots(json.success ? json.data : []);
        setLoadingSlots(false);
      })
      .catch(() => {
        setSlots([]);
        setLoadingSlots(false);
      });
  }, [selectedDate]);

  const handleSelectSlot = (slot: Slot) => {
    setSelectedSlot(slot);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero Section */}
      <div className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#003e79] via-[#005599] to-[#00ccff]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#005599]/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00ccff]/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            Book Ice Time
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Reserve your ice time at the Rosemont Outdoor Rink. Select a date, choose your time slot, and book online.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 pb-20 -mt-12 relative z-10">
        {/* Cancelled banner */}
        {cancelled && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-2xl mb-6 text-center">
            Payment was cancelled. Your time slot has been released. Feel free to try again!
          </div>
        )}

        {showForm && selectedSlot ? (
          <BookingForm slot={selectedSlot} onBack={() => setShowForm(false)} />
        ) : (
          <div className="space-y-6">
            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} availableDates={availableDates} />
            {selectedDate && (
              <TimeSlotPicker
                slots={slots}
                selectedSlot={selectedSlot}
                onSelect={handleSelectSlot}
                loading={loadingSlots}
              />
            )}
          </div>
        )}

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 text-center">
            <div className="text-3xl mb-2">⏱️</div>
            <h4 className="font-bold text-[#1d1d1f] mb-1">1-Hour Sessions</h4>
            <p className="text-sm text-[#6e6e73]">Each rental is a full 60-minute ice session</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 text-center">
            <div className="text-3xl mb-2">📍</div>
            <h4 className="font-bold text-[#1d1d1f] mb-1">Rosemont, IL</h4>
            <p className="text-sm text-[#6e6e73]">Outdoor rink in the heart of Rosemont</p>
          </div>
          <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6 text-center">
            <div className="text-3xl mb-2">🔒</div>
            <h4 className="font-bold text-[#1d1d1f] mb-1">Secure Payment</h4>
            <p className="text-sm text-[#6e6e73]">All payments processed securely via Stripe</p>
          </div>
        </div>
      </div>
    </div>
  );
}
