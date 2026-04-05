'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.utproducts.workers.dev/api/ice-booking';

interface BookingDetails {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  priceCents: number;
  name: string;
  email: string;
  status: string;
}

export default function BookIceConfirmation() {
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slotId = params.get('slot_id');

    if (!slotId) {
      setError('No booking reference found.');
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/booking/${slotId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setBooking(json.data);
        } else {
          setError('Could not find your booking. Please contact us.');
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load booking details. Please contact us.');
        setLoading(false);
      });
  }, []);

  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">â ï¸</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/book-ice"
            className="inline-block py-3 px-6 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition"
          >
            Back to Book Ice
          </a>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const dateLabel = new Date(booking.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* Hero */}
      <div className="relative py-16 sm:py-24">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-green-900/40 to-cyan-900/40" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="text-6xl mb-4">â</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-4">
            Booking Confirmed!
          </h1>
          <p className="text-xl text-green-100 max-w-2xl mx-auto">
            Your ice time has been reserved and payment processed successfully.
          </p>
        </div>
      </div>

      {/* Booking Details Card */}
      <div className="max-w-lg mx-auto px-4 pb-20 -mt-8">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Booking Details</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">{dateLabel}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Time</span>
              <span className="font-medium text-gray-900">
                {fmt(booking.startTime)} â {fmt(booking.endTime)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Duration</span>
              <span className="font-medium text-gray-900">{booking.durationMinutes} minutes</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Location</span>
              <span className="font-medium text-gray-900">Rosemont Outdoor Rink</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Booked By</span>
              <span className="font-medium text-gray-900">{booking.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{booking.email}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-bold text-green-600 text-base">
                ${(booking.priceCents / 100).toFixed(0)}
              </span>
            </div>
          </div>

          {/* Confirmation Notice */}
          <div className="mt-6 bg-cyan-50 rounded-xl p-4">
            <p className="text-sm text-cyan-800">
              A confirmation email has been sent to <strong>{booking.email}</strong>.
              Please save this for your records.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href="/book-ice"
              className="flex-1 py-3 px-6 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition text-center"
            >
              Book Another Time
            </a>
            <a
              href="/"
              className="flex-1 py-3 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition text-center"
            >
              Back to Home
            </a>
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            Questions about your booking? Contact us at{' '}
            <a href="mailto:info@ultimatetournaments.com" className="text-cyan-400 hover:text-cyan-300">
              info@ultimatetournaments.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
